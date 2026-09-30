from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import CurrentUser
from app.schemas.read_models import (
    ImportBatchRead,
    PortfolioOverview,
    ReconciliationRead,
)
from app.services import read_models

DbSession = Annotated[Session, Depends(get_db)]
router = APIRouter(prefix="/api/v1", tags=["read-models"])


@router.get("/portfolio/overview", response_model=PortfolioOverview)
def overview(current_user: CurrentUser, db: DbSession):
    return read_models.portfolio_overview(db, user_id=current_user.id)


@router.get("/import-batches", response_model=list[ImportBatchRead])
def imports(current_user: CurrentUser, db: DbSession):
    return read_models.list_import_batches(db, user_id=current_user.id)


@router.get("/reconciliation-candidates", response_model=list[ReconciliationRead])
def reconciliation(current_user: CurrentUser, db: DbSession):
    return read_models.list_reconciliation(db, user_id=current_user.id)
