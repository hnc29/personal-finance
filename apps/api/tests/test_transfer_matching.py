from datetime import date, timedelta
from types import SimpleNamespace

from app.services.transfer_matching import (
    find_semantic_duplicates,
    pair_transfer_rows,
    score_transfer_candidate,
)


def event(day: date, amount: int, account: int, *, payee: str | None = None, note: str | None = None):
    entry = SimpleNamespace(amount_scaled=amount, account_id=account)
    return SimpleNamespace(transaction_date=day, entries=(entry,), payee_text=payee, note=note)


def test_exact_date_unique_match_auto_pairs_and_is_used_once() -> None:
    day = date(2026, 8, 22)
    left = event(day, -100_000, 1)
    right = event(day, 100_000, 2)
    duplicate_right = event(day, 100_000, 3)

    pairs, reviews = pair_transfer_rows((left, right, duplicate_right))

    assert pairs == ()
    assert reviews == ()
    assert score_transfer_candidate(left, right).auto_pair is True


def test_ambiguous_match_is_not_auto_paired_when_competitor_is_reversed() -> None:
    day = date(2026, 8, 22)
    source = event(day, -100_000, 1)
    exact = event(day, 100_000, 2)
    one_day = event(day + timedelta(days=1), 100_000, 3)

    pairs, reviews = pair_transfer_rows((one_day, source, exact))

    assert pairs == ()
    assert reviews == ()


def test_one_day_unique_match_auto_pairs_but_two_to_seven_days_review() -> None:
    day = date(2026, 8, 22)
    one_day = score_transfer_candidate(event(day, -250_000, 1), event(day + timedelta(days=1), 250_000, 2))
    review = score_transfer_candidate(event(day, -250_000, 1), event(day + timedelta(days=2), 250_000, 2))

    assert one_day is not None and one_day.auto_pair is True and one_day.review is False
    assert review is not None and review.auto_pair is False and review.review is True


def test_pairs_and_reviews_respect_date_boundaries() -> None:
    day = date(2026, 8, 22)
    pairs, reviews = pair_transfer_rows((
        event(day, -100_000, 1), event(day + timedelta(days=1), 100_000, 2),
        event(day, -200_000, 3), event(day + timedelta(days=7), 200_000, 4),
        event(day, -300_000, 5), event(day + timedelta(days=8), 300_000, 6),
    ))

    assert len(pairs) == 1
    assert len(reviews) == 1
    assert reviews[0].date_distance == 7


def test_semantic_duplicates_ignore_source_id_and_group_only_matching_rows() -> None:
    first = event(date(2026, 8, 22), -99_000, 1, payee="Shop", note="synthetic")
    second = event(date(2026, 8, 22), -99_000, 1, payee="Shop", note="synthetic")
    other = event(date(2026, 8, 22), -99_000, 1, payee="Other", note="synthetic")

    groups = find_semantic_duplicates((first, second, other))

    assert groups == ((first, second),)
