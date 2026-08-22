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
from app.schemas.ledger import FinancialEventCreate, FinancialEventRead
from app.services import ledger as ledger_service
from app.services.ledger import InvalidEventEntriesError, UnknownAccountError

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
