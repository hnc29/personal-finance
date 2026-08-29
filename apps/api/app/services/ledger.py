"""Ledger service: creating and listing financial events, validating entries.

:func:`create_financial_event` builds and persists a single
:class:`app.models.ledger.FinancialEvent` together with its ordinary
:class:`app.models.ledger.AccountEntry` rows, converting each Decimal amount to
its scaled-integer form through ``money_to_scaled``. TRANSFER and
CREDIT_CARD_PAYMENT events are additionally checked at creation for the balanced
two-account pair invariant.

:func:`list_financial_events` reads every stored event ordered by id, each with
its :class:`app.models.ledger.AccountEntry` rows eagerly loaded so the events can
be serialised without a per-event follow-up query.

:func:`get_financial_event` returns one stored event by id — its entries eagerly
loaded the same way — or ``None`` when no event has that id, so the routing layer
can map the absence to 404.

The remaining helpers are pure, side-effect-free checks on the shape and
invariants of an event's account entries: they inspect only the entries handed
to them — no Session, no persistence — so a built event can be validated before
committing. Money is compared in the scaled-integer form (``amount_scaled``),
so those checks are exact; no float or Decimal arithmetic happens in them.
"""

from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.money import money_to_scaled, scaled_to_money
from app.models.account import Account, AccountType
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType
from app.schemas.ledger import (
    AccountEntryCreate,
    FinancialEventCreate,
    FinancialEventUpdate,
)


class UnknownAccountError(Exception):
    """Raised when a referenced ``account_id`` does not exist."""


# TASK-042: the four event types a person can create AND now edit/delete
# through the Transactions composer/API -- exactly `composerEventTypes` in
# apps/web/app/page.tsx. ADJUSTMENT, INTEREST, SAVINGS_DEPOSIT/WITHDRAWAL,
# and ASSET_PURCHASE/ASSET_SALE are produced by their own dedicated domain
# flows (Accounts' balance-adjust action, the Savings module) and, in the
# savings case, denormalized onto other records (e.g.
# SavingsTerm.actual_interest_scaled) alongside the ledger event -- editing
# or deleting one of those generically here, without going through the flow
# that produced it, would desync that domain's own records from the ledger.
# This boundary is enforced here (server-side), not only by the frontend
# hiding the buttons, since a client is not a trust boundary.
EDITABLE_EVENT_TYPES = frozenset(FinancialEventType)


class ProtectedEventTypeError(Exception):
    """Raised when update/delete targets a type outside EDITABLE_EVENT_TYPES."""


def _build_and_validate_entries(
    session: Session,
    event_type: FinancialEventType,
    entry_payloads: Sequence[AccountEntryCreate],
) -> list[AccountEntry]:
    """Build and validate the :class:`AccountEntry` rows for one event.

    Shared by :func:`create_financial_event` and :func:`update_financial_event`.
    An event requires at least one entry; an empty list raises
    :class:`InvalidEventEntriesError`. Every referenced account must already
    exist, or the first that does not raises :class:`UnknownAccountError`
    before any entry is built. TRANSFER and CREDIT_CARD_PAYMENT are further
    validated for the balanced two-account pair invariant (and, for
    CREDIT_CARD_PAYMENT, payment direction) before being returned -- callers
    persist the result, never partially.
    """
    if not entry_payloads:
        raise InvalidEventEntriesError("an event requires at least one entry")

    for entry in entry_payloads:
        if session.get(Account, entry.account_id) is None:
            raise UnknownAccountError(entry.account_id)

    entries = [
        AccountEntry(
            account_id=entry.account_id,
            amount_scaled=money_to_scaled(entry.amount),
        )
        for entry in entry_payloads
    ]

    if event_type in _BALANCED_PAIR_EVENT_TYPES:
        _validate_balanced_pair(event_type, entries)
    if event_type is FinancialEventType.CREDIT_CARD_PAYMENT:
        _validate_credit_card_payment(session, entries)
    if event_type in _SIGNED_EVENT_TYPES:
        _validate_signed_amount(event_type, entries)

    return entries


def create_financial_event(
    session: Session, payload: FinancialEventCreate
) -> FinancialEvent:
    """Build and persist one :class:`FinancialEvent` and its entries.

    Sets the event-level fields (type, ``transaction_date``, the optional and
    separate ``occurred_at``, category and free-text fields), builds its
    :class:`AccountEntry` rows via :func:`_build_and_validate_entries`, then
    commits, so the one event and all its entries persist atomically in a
    single transaction with ids and foreign keys assigned; a failed commit is
    rolled back, leaving neither the event nor any entry persisted, and the
    error propagates.
    """
    entries = _build_and_validate_entries(session, payload.event_type, payload.entries)

    event = FinancialEvent(
        event_type=payload.event_type,
        transaction_date=payload.transaction_date,
        occurred_at=payload.occurred_at,
        category_id=payload.category_id,
        payee_text=payload.payee_text,
        trip_event_text=payload.trip_event_text,
        note=payload.note,
        excluded_from_reports=payload.excluded_from_reports,
        entries=entries,
    )
    session.add(event)
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(event)
    return event


def update_financial_event(
    session: Session, event_id: int, payload: FinancialEventUpdate
) -> FinancialEvent | None:
    """Replace one event's fields and entries wholesale, or ``None`` if absent.

    A full replace, mirroring :func:`create_financial_event`: every entry in
    ``payload.entries`` replaces the event's existing entries outright. The
    old :class:`AccountEntry` rows are removed through the ``entries``
    relationship's ``delete-orphan`` cascade when the new list is assigned --
    never left orphaned, and never double-booked alongside the new ones.
    Only :data:`EDITABLE_EVENT_TYPES` may be updated (checked against both
    the event's current type and the payload's requested type, so this can't
    be used to move an event into or out of a domain-owned type either);
    anything else raises :class:`ProtectedEventTypeError`.
    """
    event = session.get(FinancialEvent, event_id)
    if event is None:
        return None
    if event.event_type not in EDITABLE_EVENT_TYPES or payload.event_type not in EDITABLE_EVENT_TYPES:
        raise ProtectedEventTypeError(event.event_type)

    entries = _build_and_validate_entries(session, payload.event_type, payload.entries)

    event.event_type = payload.event_type
    event.transaction_date = payload.transaction_date
    event.occurred_at = payload.occurred_at
    event.category_id = payload.category_id
    event.payee_text = payload.payee_text
    event.trip_event_text = payload.trip_event_text
    event.note = payload.note
    event.excluded_from_reports = payload.excluded_from_reports
    event.entries = entries
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(event)
    return event


def delete_financial_event(
    session: Session, event_id: int, *, force: bool = False
) -> bool:
    """Delete an event and its entries (TASK-042).

    The ``entries`` relationship's ``delete-orphan`` cascade removes every
    :class:`AccountEntry` row belonging to the event as part of the same
    ``session.delete(event)`` -- necessary because this app enables
    ``PRAGMA foreign_keys=ON`` on every connection (see
    ``app/core/database.py``), so deleting a ``financial_events`` row while
    an ``account_entries`` row still references it would otherwise fail the
    foreign-key check; SQLAlchemy's unit-of-work deletes the cascaded
    children first, satisfying that constraint. Only
    :data:`EDITABLE_EVENT_TYPES` may be deleted unless force=True; anything else
    raises :class:`ProtectedEventTypeError`.
    """
    event = session.get(FinancialEvent, event_id)
    if event is None:
        return False
    if not force and event.event_type not in EDITABLE_EVENT_TYPES:
        raise ProtectedEventTypeError(event.event_type)

    session.delete(event)
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    return True


def list_financial_events(session: Session) -> list[FinancialEvent]:
    """Return every financial event ordered by id, entries eagerly loaded.

    Each event's :class:`AccountEntry` rows are loaded with ``selectinload`` so
    the events can be serialised without a per-event follow-up query.
    """
    return list(
        session.scalars(
            select(FinancialEvent)
            .options(selectinload(FinancialEvent.entries))
            .order_by(FinancialEvent.id)
        )
    )


def get_financial_event(
    session: Session, event_id: int
) -> FinancialEvent | None:
    """Return one financial event by id with entries eagerly loaded, or ``None``.

    The event's :class:`AccountEntry` rows are loaded with ``selectinload`` the
    same way :func:`list_financial_events` loads them, so the event can be
    serialised without a follow-up query. Returns ``None`` when no event has
    ``event_id``, so the routing layer can map the absence to 404.
    """
    return session.scalars(
        select(FinancialEvent)
        .options(selectinload(FinancialEvent.entries))
        .where(FinancialEvent.id == event_id)
    ).one_or_none()


def account_balance_scaled(session: Session, account_id: int) -> int:
    """Return the account's balance as a scaled integer.

    Computes ``SUM(account_entries.amount_scaled)`` over every entry for
    ``account_id`` and coalesces to ``0`` so an account with no entries — or an
    unknown id — balances to zero rather than NULL. The result stays in the
    scaled-integer form: no ``scaled_to_money`` conversion happens here, so the
    sum is exact; producing application Decimal money is left to the caller.
    """
    total = session.scalar(
        select(func.coalesce(func.sum(AccountEntry.amount_scaled), 0)).where(
            AccountEntry.account_id == account_id
        )
    )
    return int(total or 0)


def account_balance(session: Session, account_id: int) -> Decimal | None:
    """Return the account's balance as application money, or ``None`` if absent.

    Returns ``None`` when no account has ``account_id`` — following the
    convention that a service reports absence with ``None`` so the routing layer
    can map it to 404 — rather than reporting a zero balance for an account that
    does not exist. For an existing account it sums the entries exactly in the
    scaled-integer form via :func:`account_balance_scaled` and converts that
    single result to Decimal through ``scaled_to_money``, so the returned money
    is exact and never silently rounded.
    """
    if session.get(Account, account_id) is None:
        return None
    return scaled_to_money(account_balance_scaled(session, account_id))


# Event types whose entries must net to zero across exactly two accounts.
_BALANCED_PAIR_EVENT_TYPES = frozenset(
    {FinancialEventType.TRANSFER, FinancialEventType.CREDIT_CARD_PAYMENT}
)

# QA (2026-08-25): single-entry event types whose sign carries semantic
# meaning -- an EXPENSE must debit (negative) and an INCOME must credit
# (positive) the account, matching the frontend composer's own convention
# (apps/web/app/page.tsx submit(): `type === "EXPENSE" ? negateMoney(...) :
# ...`). Nothing server-side enforced this invariant before; a data
# reconciliation pass against the real database found one EXPENSE event
# persisted with a positive amount, proving a client is not a trust
# boundary here either (matches the reasoning already applied to
# EDITABLE_EVENT_TYPES above). The bad row itself is left untouched --
# real user data is never corrected automatically -- see docs/qa/BUG_FIX_REPORT.md.
_SIGNED_EVENT_TYPES = frozenset(
    {FinancialEventType.EXPENSE, FinancialEventType.INCOME}
)


class InvalidEventEntriesError(Exception):
    """Raised when a financial event's account entries violate an invariant."""


def validate_event_entries(
    event_type: FinancialEventType, entries: Sequence[AccountEntry]
) -> None:
    """Validate the account entries for an event of ``event_type``.

    Every event requires at least one entry. TRANSFER and CREDIT_CARD_PAYMENT
    additionally require a balanced two-account pair; EXPENSE and INCOME
    require their single entry's sign to match the event type. Raises
    :class:`InvalidEventEntriesError` on any violation and returns ``None``
    when the entries are valid.
    """
    if not entries:
        raise InvalidEventEntriesError("an event requires at least one entry")

    if event_type in _BALANCED_PAIR_EVENT_TYPES:
        _validate_balanced_pair(event_type, entries)
    if event_type in _SIGNED_EVENT_TYPES:
        _validate_signed_amount(event_type, entries)


def _validate_balanced_pair(
    event_type: FinancialEventType, entries: Sequence[AccountEntry]
) -> None:
    """Check the two-entry, two-account, nets-to-zero invariant.

    Applies to TRANSFER and CREDIT_CARD_PAYMENT: exactly two entries against
    two distinct accounts whose scaled amounts are exact opposites (sum zero).
    For two integers, a zero sum is equivalent to being exact opposites.
    """
    if len(entries) != 2:
        raise InvalidEventEntriesError(
            f"{event_type.value} requires exactly two entries, got {len(entries)}"
        )

    first, second = entries
    if first.account_id == second.account_id:
        raise InvalidEventEntriesError(
            f"{event_type.value} requires two distinct accounts"
        )

    if first.amount_scaled + second.amount_scaled != 0:
        raise InvalidEventEntriesError(
            f"{event_type.value} entries must be exact opposites summing to zero"
        )


def _validate_signed_amount(
    event_type: FinancialEventType, entries: Sequence[AccountEntry]
) -> None:
    """Check EXPENSE debits and INCOME credits the single entry's account.

    Applies to EXPENSE and INCOME: exactly one entry, whose scaled amount
    must be negative for EXPENSE or positive for INCOME. Zero is rejected
    for both -- a zero-amount event carries no ledger meaning.
    """
    if len(entries) != 1:
        raise InvalidEventEntriesError(
            f"{event_type.value} requires exactly one entry, got {len(entries)}"
        )

    (entry,) = entries
    if event_type is FinancialEventType.EXPENSE and entry.amount_scaled >= 0:
        raise InvalidEventEntriesError("EXPENSE amount must be negative")
    if event_type is FinancialEventType.INCOME and entry.amount_scaled <= 0:
        raise InvalidEventEntriesError("INCOME amount must be positive")


def _validate_credit_card_payment(
    session: Session, entries: Sequence[AccountEntry]
) -> None:
    """Require payment direction: funding account out, card account in."""
    first, second = entries
    first_account = session.get(Account, first.account_id)
    second_account = session.get(Account, second.account_id)
    assert first_account is not None and second_account is not None
    card_entries = [
        (entry, account)
        for entry, account in ((first, first_account), (second, second_account))
        if account.account_type is AccountType.CREDIT_CARD
    ]
    if len(card_entries) != 1:
        raise InvalidEventEntriesError(
            "CREDIT_CARD_PAYMENT requires exactly one CREDIT_CARD account"
        )
    card_entry, _ = card_entries[0]
    if card_entry.amount_scaled <= 0:
        raise InvalidEventEntriesError(
            "CREDIT_CARD_PAYMENT must increase the credit-card balance"
        )
