from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.read_models import (
    ImportBatchRead,
    PortfolioOverview,
    ReconciliationRead,
)
from app.services import read_models

DbSession = Annotated[Session, Depends(get_db)]
router = APIRouter(prefix="/api/v1", tags=["read-models"])
@router.get("/portfolio/overview", response_model=PortfolioOverview)
def overview(db: DbSession): return read_models.portfolio_overview(db)
@router.get("/import-batches", response_model=list[ImportBatchRead])
def imports(db: DbSession): return read_models.list_import_batches(db)
@router.get("/reconciliation-candidates", response_model=list[ReconciliationRead])
def reconciliation(db: DbSession): return read_models.list_reconciliation(db)
