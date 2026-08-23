"""Deterministic transfer matching primitives for normalized ledger events.

The matcher is deliberately side-effect free.  Callers can use the returned
pair/candidate decisions to update ledger records in a later workflow.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from typing import Any, cast


@dataclass(frozen=True)
class TransferCandidate:
    left: Any
    right: Any
    amount_match: bool
    account_match: bool
    date_distance: int
    score: int
    auto_pair: bool
    review: bool


def _amount(event: Any) -> int | None:
    entries = cast(tuple[Any, ...], getattr(event, "entries", ()))
    values = [getattr(entry, "amount_scaled", None) for entry in entries]
    return values[0] if len(values) == 1 and isinstance(values[0], int) else None


def _account(event: Any) -> int | None:
    entries = getattr(event, "entries", ())
    values = [getattr(entry, "account_id", None) for entry in entries]
    return values[0] if len(values) == 1 and isinstance(values[0], int) else None


def score_transfer_candidate(left: Any, right: Any) -> TransferCandidate | None:
    """Score two events using exact amount, distinct account, and date evidence."""
    left_amount, right_amount = _amount(left), _amount(right)
    left_date, right_date = getattr(left, "transaction_date", None), getattr(right, "transaction_date", None)
    if left_amount is None or right_amount is None or not isinstance(left_date, date) or not isinstance(right_date, date):
        return None
    distance = abs((left_date - right_date).days)
    amount_match = left_amount != 0 and left_amount == -right_amount
    account_match = _account(left) is not None and _account(right) is not None and _account(left) != _account(right)
    score = (60 if amount_match else 0) + (25 if account_match else 0) + max(0, 15 - distance * 2)
    auto_pair = amount_match and account_match and distance <= 1
    return TransferCandidate(left, right, amount_match, account_match, distance, score, auto_pair, amount_match and account_match and 2 <= distance <= 7)


def pair_transfer_rows(events: Iterable[Any]) -> tuple[tuple[TransferCandidate, ...], tuple[TransferCandidate, ...]]:
    """Return deterministic auto-pairs and review candidates.

    Each event is used at most once.  Same-date matches win, followed by
    one-day matches, then higher scores and stable input order.
    """
    rows = list(events)
    decisions: list[TransferCandidate] = []
    used: set[int] = set()
    # Resolve globally by date distance, so exact-date evidence always wins
    # over a one-day option regardless of input order. Ties are ambiguous.
    eligible: list[tuple[TransferCandidate, int, int]] = []
    for i, left in enumerate(rows):
        for j in range(i + 1, len(rows)):
            candidate = score_transfer_candidate(left, rows[j])
            if candidate is not None and candidate.auto_pair:
                eligible.append((candidate, i, j))
    for distance in (0, 1):
        for candidate, i, j in sorted((item for item in eligible if item[0].date_distance == distance), key=lambda item: (item[1], item[2])):
            if i in used or j in used:
                continue
            # A match is unique only when neither row has another eligible
            # counterpart. Exact-date candidates are considered first, so a
            # same-date match wins over a one-day alternative deterministically.
            competing = [
                (other, oi, oj)
                for other, oi, oj in eligible
                if (oi == i or oj == i or oi == j or oj == j)
                and oi not in used
                and oj not in used
            ]
            if len(competing) != 1:
                continue
            decisions.append(candidate)
            used.update((i, j))
    reviews = tuple(
        candidate
        for i, left in enumerate(rows)
        for j in range(i + 1, len(rows))
        if i not in used and j not in used
        for candidate in [score_transfer_candidate(left, rows[j])]
        if candidate is not None and candidate.review
    )
    return tuple(decisions), reviews


def semantic_duplicate_key(event: Any) -> tuple[Any, ...] | None:
    """Return a source-independent key for duplicate/candidate handling."""
    entries = cast(tuple[Any, ...], getattr(event, "entries", ()))
    if len(entries) != 1:
        return None
    entry = entries[0]
    transaction_date = getattr(event, "transaction_date", None)
    amount = getattr(entry, "amount_scaled", None)
    account = getattr(entry, "account_id", None)
    if not isinstance(transaction_date, date) or not isinstance(amount, int) or not isinstance(account, int):
        return None
    return (transaction_date, amount, account, getattr(event, "payee_text", None), getattr(event, "note", None))


def find_semantic_duplicates(events: Iterable[Any]) -> tuple[tuple[Any, ...], ...]:
    groups: dict[tuple[Any, ...], list[Any]] = {}
    for event in events:
        key = semantic_duplicate_key(event)
        if key is not None:
            groups.setdefault(key, []).append(event)
    return tuple(tuple(group) for group in groups.values() if len(group) > 1)


__all__ = ["TransferCandidate", "find_semantic_duplicates", "pair_transfer_rows", "score_transfer_candidate", "semantic_duplicate_key"]
