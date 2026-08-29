"""HTTP routes for the financial-events (ledger) API.

Thin adapters over :mod:`app.services.ledger`. Creating an event persists it
atomically with its account entries: a referenced account that does not exist
maps to 404, and entries that violate an event's invariants map to 400.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.ledger import FinancialEvent
from app.schemas.ledger import (
    DeletedEventRead,
    FinancialEventCreate,
    FinancialEventRead,
    FinancialEventUpdate,
)
from app.services import ledger as ledger_service
from app.services.ledger import (
    InvalidEventEntriesError,
    ProtectedEventTypeError,
    UnknownAccountError,
)

DbSession = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/api/v1/financial-events", tags=["financial-events"])


@router.get("", response_model=list[FinancialEventRead])
def list_financial_events(db: DbSession) -> list[FinancialEvent]:
    """List all financial events with their entries, ordered by id."""
    return ledger_service.list_financial_events(db)


@router.get("/{event_id}", response_model=FinancialEventRead)
def get_financial_event(event_id: int, db: DbSession) -> FinancialEvent:
    """Return one financial event by id, mapping an unknown id to 404."""
    event = ledger_service.get_financial_event(db, event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial event not found",
        )
    return event


@router.post(
    "",
    response_model=FinancialEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_financial_event(
    data: FinancialEventCreate, db: DbSession
) -> FinancialEvent:
    """Create a financial event with its entries, validating both."""
    try:
        return ledger_service.create_financial_event(db, data)
    except UnknownAccountError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        ) from exc
    except InvalidEventEntriesError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch("/{event_id}", response_model=FinancialEventRead)
def update_financial_event(
    event_id: int, data: FinancialEventUpdate, db: DbSession
) -> FinancialEvent:
    """Replace an event's fields and entries wholesale (TASK-042).

    A full replace, mirroring how the Transactions composer re-submits the
    whole form when editing. 404 for an unknown event or account, 400 for
    entries that violate an event's invariants, 409 for an event type
    (ADJUSTMENT, INTEREST, SAVINGS_*, ASSET_*) that is owned by another
    domain flow and cannot be edited here.
    """
    try:
        event = ledger_service.update_financial_event(db, event_id, data)
    except UnknownAccountError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        ) from exc
    except InvalidEventEntriesError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ProtectedEventTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{exc.args[0].value} events are managed elsewhere and cannot be edited here",
        ) from exc
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial event not found",
        )
    return event


@router.delete("/{event_id}", response_model=DeletedEventRead)
def delete_financial_event(
    event_id: int, db: DbSession, force: bool = False
) -> DeletedEventRead:
    """Delete an event and its entries (TASK-042).

    404 for an unknown event, 409 for an event type (ADJUSTMENT, INTEREST,
    SAVINGS_*, ASSET_*) that is owned by another domain flow and cannot be
    deleted here without force=True.
    """
    try:
        if force:
            deleted = ledger_service.delete_financial_event(
                db, event_id, force=True
            )
        else:
            deleted = ledger_service.delete_financial_event(db, event_id)
    except ProtectedEventTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{exc.args[0].value} events are managed elsewhere and cannot be deleted here",
        ) from exc
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial event not found",
        )
    return DeletedEventRead(id=event_id)
