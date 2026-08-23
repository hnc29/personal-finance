"""Deterministic scoring primitives for bank-statement reconciliation."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.models.reconciliation import ReconciliationCandidateState

MAX_DATE_DISTANCE_DAYS = 7
AUTO_MATCH_SCORE = 85
AUTO_MATCH_MARGIN = 15


@dataclass(frozen=True, slots=True)
class ReconciliationRecord:
    """Minimal, source-independent input used by the scorer."""

    identifier: int | str
    transaction_date: date
    amount_scaled: int
    reference: str | None = None
    text: str | None = None
    effective_date: date | None = None

    def __post_init__(self) -> None:
        if isinstance(self.amount_scaled, bool) or not isinstance(
            self.amount_scaled, int
        ):
            raise TypeError("amount_scaled must be an integer")


@dataclass(frozen=True, slots=True)
class ReconciliationScore:
    """Score and auditable evidence for one possible row/event link."""

    statement: ReconciliationRecord
    event: ReconciliationRecord
    score: int
    amount_matches: bool
    reference_matches: bool
    reference_conflicts: bool
    date_distance_days: int
    text_similarity_basis_points: int


@dataclass(frozen=True, slots=True)
class ReconciliationDecision:
    """State assigned after comparing all candidates for one statement row."""

    state: ReconciliationCandidateState
    candidate: ReconciliationScore | None
    alternatives: tuple[ReconciliationScore, ...]


def normalize_reconciliation_text(value: str | None) -> str:
    """Normalize references and descriptions without locale-dependent behavior."""
    if not value:
        return ""
    value = value.replace("Đ", "D").replace("đ", "d")
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", ascii_text.casefold()))


def text_similarity_basis_points(left: str | None, right: str | None) -> int:
    """Return deterministic Jaccard token overlap as an integer in 0..10,000."""
    left_tokens = frozenset(normalize_reconciliation_text(left).split())
    right_tokens = frozenset(normalize_reconciliation_text(right).split())
    if not left_tokens or not right_tokens:
        return 0
    return len(left_tokens & right_tokens) * 10_000 // len(left_tokens | right_tokens)


def score_reconciliation_candidate(
    statement: ReconciliationRecord, event: ReconciliationRecord
) -> ReconciliationScore | None:
    """Score exact amount/reference plus bounded date and text evidence.

    Amount equality is a prerequisite: a different monetary value is never a
    reconciliation candidate. References are compared only when both exist.
    """
    if statement.amount_scaled != event.amount_scaled:
        return None
    statement_dates = (statement.transaction_date,) + (
        (statement.effective_date,) if statement.effective_date is not None else ()
    )
    event_dates = (event.transaction_date,) + (
        (event.effective_date,) if event.effective_date is not None else ()
    )
    date_distance = min(
        abs((statement_date - event_date).days)
        for statement_date in statement_dates
        for event_date in event_dates
    )
    if date_distance > MAX_DATE_DISTANCE_DAYS:
        return None

    statement_reference = normalize_reconciliation_text(statement.reference)
    event_reference = normalize_reconciliation_text(event.reference)
    reference_matches = bool(
        statement_reference
        and event_reference
        and statement_reference == event_reference
    )
    reference_conflicts = bool(
        statement_reference
        and event_reference
        and statement_reference != event_reference
    )
    similarity = text_similarity_basis_points(statement.text, event.text)
    if date_distance == 0:
        date_score = 20
    elif date_distance == 1:
        date_score = 15
    elif date_distance <= 3:
        date_score = 10
    else:
        date_score = 5
    score = (
        50
        + date_score
        + (30 if reference_matches else 0)
        + similarity * 20 // 10_000
    )
    return ReconciliationScore(
        statement=statement,
        event=event,
        score=score,
        amount_matches=True,
        reference_matches=reference_matches,
        reference_conflicts=reference_conflicts,
        date_distance_days=date_distance,
        text_similarity_basis_points=similarity,
    )


def decide_reconciliation(
    statement: ReconciliationRecord,
    events: Iterable[ReconciliationRecord],
) -> ReconciliationDecision:
    """Choose a unique strong match or preserve all plausible rows for review."""
    candidates = tuple(
        sorted(
            (
                candidate
                for event in events
                if (candidate := score_reconciliation_candidate(statement, event))
                is not None
            ),
            key=lambda item: (
                -item.score,
                item.date_distance_days,
                str(item.event.identifier),
            ),
        )
    )
    if not candidates:
        return ReconciliationDecision(ReconciliationCandidateState.UNMATCHED, None, ())

    best = candidates[0]
    runner_up_score = candidates[1].score if len(candidates) > 1 else 0
    reference_matches = tuple(
        candidate for candidate in candidates if candidate.reference_matches
    )
    # An exact reference is decisive only when it belongs to the selected
    # highest-scoring candidate. A conflicting reference with stronger date or
    # text evidence must remain review-only, even if another candidate happens
    # to carry the statement reference.
    exact_reference_unique = best.reference_matches and len(reference_matches) == 1
    strong_unique_score = (
        best.score >= AUTO_MATCH_SCORE
        and best.score - runner_up_score >= AUTO_MATCH_MARGIN
    )
    if exact_reference_unique or (
        not reference_matches
        and not best.reference_conflicts
        and strong_unique_score
    ):
        same_strength = [
            candidate for candidate in candidates if candidate.score == best.score
        ]
        if len(same_strength) == 1:
            return ReconciliationDecision(
                ReconciliationCandidateState.AUTO_MATCHED, best, candidates
            )
    return ReconciliationDecision(
        ReconciliationCandidateState.REVIEW_REQUIRED, best, candidates
    )


def reconcile_records(
    statements: Iterable[ReconciliationRecord],
    events: Iterable[ReconciliationRecord],
) -> tuple[ReconciliationDecision, ...]:
    """Decide a batch without auto-matching one event more than once.

    Per-row evidence is retained for review. If an otherwise automatic match's
    event is plausible for another statement row, the automatic match is
    downgraded rather than selecting a winner based on input order.
    """
    event_rows = tuple(events)
    decisions = tuple(decide_reconciliation(row, event_rows) for row in statements)
    event_counts: dict[int | str, int] = {}
    for decision in decisions:
        for identifier in {
            alternative.event.identifier for alternative in decision.alternatives
        }:
            event_counts[identifier] = event_counts.get(identifier, 0) + 1

    return tuple(
        ReconciliationDecision(
            ReconciliationCandidateState.REVIEW_REQUIRED,
            decision.candidate,
            decision.alternatives,
        )
        if decision.state is ReconciliationCandidateState.AUTO_MATCHED
        and decision.candidate is not None
        and event_counts[decision.candidate.event.identifier] > 1
        else decision
        for decision in decisions
    )


__all__ = [
    "AUTO_MATCH_MARGIN",
    "AUTO_MATCH_SCORE",
    "MAX_DATE_DISTANCE_DAYS",
    "ReconciliationDecision",
    "ReconciliationRecord",
    "ReconciliationScore",
    "decide_reconciliation",
    "normalize_reconciliation_text",
    "reconcile_records",
    "score_reconciliation_candidate",
    "text_similarity_basis_points",
]
