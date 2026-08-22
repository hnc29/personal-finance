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
from app.models.account import Account
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType
from app.schemas.ledger import FinancialEventCreate


class UnknownAccountError(Exception):
    """Raised when a referenced ``account_id`` does not exist."""


def create_financial_event(
    session: Session, payload: FinancialEventCreate
) -> FinancialEvent:
    """Build and persist one :class:`FinancialEvent` and its entries.

    An event requires at least one entry; an empty ``entries`` list raises
    :class:`InvalidEventEntriesError`. Every account referenced by an entry must
    already exist; an :class:`UnknownAccountError` is raised for the first that
    does not, before any event is added. Sets the event-level fields (type,
    ``transaction_date``, the optional and separate ``occurred_at``, category
    and free-text fields), builds one ordinary :class:`AccountEntry` per payload
    entry — converting each Decimal ``amount`` to its scaled-integer form only
    through ``money_to_scaled`` — then commits, so the one event and all its
    entries persist atomically in a single transaction with ids and foreign
    keys assigned; a failed commit is rolled back, leaving neither the event nor
    any entry persisted, and the error propagates. TRANSFER and
    CREDIT_CARD_PAYMENT events are also validated for the balanced two-account
    pair invariant before persistence.
    """
    if not payload.entries:
        raise InvalidEventEntriesError("an event requires at least one entry")

    for entry in payload.entries:
        if session.get(Account, entry.account_id) is None:
            raise UnknownAccountError(entry.account_id)

    entries = [
        AccountEntry(
            account_id=entry.account_id,
            amount_scaled=money_to_scaled(entry.amount),
        )
        for entry in payload.entries
    ]

    if payload.event_type in _BALANCED_PAIR_EVENT_TYPES:
        _validate_balanced_pair(payload.event_type, entries)

    event = FinancialEvent(
        event_type=payload.event_type,
        transaction_date=payload.transaction_date,
        occurred_at=payload.occurred_at,
        category_id=payload.category_id,
        payee_text=payload.payee_text,
        trip_event_text=payload.trip_event_text,
        note=payload.note,
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


class InvalidEventEntriesError(Exception):
    """Raised when a financial event's account entries violate an invariant."""


def validate_event_entries(
    event_type: FinancialEventType, entries: Sequence[AccountEntry]
) -> None:
    """Validate the account entries for an event of ``event_type``.

    Every event requires at least one entry. TRANSFER and CREDIT_CARD_PAYMENT
    additionally require a balanced two-account pair; other event types carry
    no zero-sum rule. Raises :class:`InvalidEventEntriesError` on any
    violation and returns ``None`` when the entries are valid.
    """
    if not entries:
        raise InvalidEventEntriesError("an event requires at least one entry")

    if event_type in _BALANCED_PAIR_EVENT_TYPES:
        _validate_balanced_pair(event_type, entries)


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
