from datetime import date

import pytest

from app.models.reconciliation import ReconciliationCandidateState
from app.services.reconciliation import (
    ReconciliationRecord,
    decide_reconciliation,
    normalize_reconciliation_text,
    reconcile_records,
    score_reconciliation_candidate,
    text_similarity_basis_points,
)


def record(
    identifier: int,
    *,
    day: int = 10,
    amount_scaled: int = -1_250_000,
    reference: str | None = None,
    text: str | None = None,
) -> ReconciliationRecord:
    return ReconciliationRecord(
        identifier=identifier,
        transaction_date=date(2026, 8, day),
        amount_scaled=amount_scaled,
        reference=reference,
        text=text,
    )


def test_text_normalization_and_similarity_are_integer_deterministic() -> None:
    assert normalize_reconciliation_text("  Chuyển-khoản: ĐIỆN  ") == "chuyen khoan dien"
    assert text_similarity_basis_points("alpha beta", "beta gamma") == 3333


def test_different_amount_or_distant_date_is_not_a_candidate() -> None:
    statement = record(1)
    assert score_reconciliation_candidate(
        statement, record(2, amount_scaled=-1_250_001)
    ) is None
    assert score_reconciliation_candidate(statement, record(2, day=18)) is None


def test_exact_reference_and_amount_produce_auditable_score() -> None:
    score = score_reconciliation_candidate(
        record(1, reference="REF-001", text="Synthetic merchant payment"),
        record(2, reference=" ref 001 ", text="merchant payment"),
    )
    assert score is not None
    assert score.amount_matches is True
    assert score.reference_matches is True
    assert score.date_distance_days == 0
    assert score.text_similarity_basis_points == 6666
    assert score.score == 113


def test_unique_exact_reference_auto_matches() -> None:
    statement = record(1, reference="ABC-42")
    decision = decide_reconciliation(
        statement,
        [record(2, reference="ABC-42"), record(3, day=11)],
    )
    assert decision.state is ReconciliationCandidateState.AUTO_MATCHED
    assert decision.candidate is not None
    assert decision.candidate.event.identifier == 2


def test_equal_best_candidates_require_review() -> None:
    statement = record(1, text="synthetic shop")
    decision = decide_reconciliation(
        statement,
        [record(3, text="synthetic shop"), record(2, text="synthetic shop")],
    )
    assert decision.state is ReconciliationCandidateState.REVIEW_REQUIRED
    assert [item.event.identifier for item in decision.alternatives] == [2, 3]


def test_repeated_exact_reference_requires_review_and_no_candidate_is_unmatched() -> None:
    statement = record(1, reference="DUPLICATE-REF")
    ambiguous = decide_reconciliation(
        statement,
        [
            record(2, reference="DUPLICATE-REF"),
            record(3, day=11, reference="DUPLICATE-REF"),
        ],
    )
    assert ambiguous.state is ReconciliationCandidateState.REVIEW_REQUIRED

    unmatched = decide_reconciliation(statement, [record(4, amount_scaled=1)])
    assert unmatched.state is ReconciliationCandidateState.UNMATCHED
    assert unmatched.candidate is None


def test_scaled_amount_rejects_float_and_bool() -> None:
    with pytest.raises(TypeError):
        record(1, amount_scaled=1.25)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        record(1, amount_scaled=True)


def test_effective_date_can_supply_bounded_date_evidence() -> None:
    statement = ReconciliationRecord(
        identifier=1,
        transaction_date=date(2026, 8, 18),
        effective_date=date(2026, 8, 10),
        amount_scaled=-1_250_000,
        reference="DATE-REF",
    )
    score = score_reconciliation_candidate(statement, record(2, reference="DATE-REF"))
    assert score is not None
    assert score.date_distance_days == 0


def test_conflicting_populated_references_never_auto_match_on_text() -> None:
    decision = decide_reconciliation(
        record(1, reference="BANK-REF", text="synthetic exact description"),
        [record(2, reference="LEDGER-REF", text="synthetic exact description")],
    )
    assert decision.state is ReconciliationCandidateState.REVIEW_REQUIRED
    assert decision.candidate is not None
    assert decision.candidate.reference_conflicts is True


def test_lower_scoring_exact_reference_does_not_override_stronger_conflict() -> None:
    decision = decide_reconciliation(
        record(1, reference="BANK-REF", text="generic payment"),
        [
            record(2, reference="LEDGER-REF", text="generic payment"),
            record(3, reference="BANK-REF", day=16, text="unrelated"),
        ],
    )
    assert decision.state is ReconciliationCandidateState.REVIEW_REQUIRED
    assert decision.candidate is not None
    assert decision.candidate.event.identifier == 2
    assert decision.candidate.reference_conflicts is True


def test_batch_downgrades_event_reuse_to_review() -> None:
    statements = [
        record(1, reference="SAME-REF"),
        record(2, reference="SAME-REF"),
    ]
    decisions = reconcile_records(
        statements,
        [record(3, reference="SAME-REF")],
    )
    assert [decision.state for decision in decisions] == [
        ReconciliationCandidateState.REVIEW_REQUIRED,
        ReconciliationCandidateState.REVIEW_REQUIRED,
    ]
    assert all(decision.candidate is not None for decision in decisions)


def test_batch_downgrades_auto_match_used_by_another_rows_review_set() -> None:
    decisions = reconcile_records(
        [
            record(1, reference="EXACT-REF"),
            record(2, text="synthetic shop"),
        ],
        [
            record(3, reference="EXACT-REF", text="synthetic shop"),
            record(4, text="synthetic shop"),
        ],
    )
    assert [decision.state for decision in decisions] == [
        ReconciliationCandidateState.REVIEW_REQUIRED,
        ReconciliationCandidateState.REVIEW_REQUIRED,
    ]
