from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class QuoteMeta(BaseModel):
    state: str
    provider: str | None = None
    quoted_at: datetime | None = None
    observed_at: datetime | None = None
    valuation_price: str | None = None

class PortfolioRow(BaseModel):
    id: int
    name: str
    value: str | None = None
    quantity: str | None = None
    quote: QuoteMeta | None = None

class PortfolioOverview(BaseModel):
    as_of: datetime
    valuation_complete: bool
    net_worth: str | None
    invested_assets: str | None
    account_count: int
    accounts: list[PortfolioRow]
    savings: list[PortfolioRow]
    credit_cards: list[PortfolioRow]
    precious_metals: list[PortfolioRow]
    crypto: list[PortfolioRow]

class ImportBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source: str
    original_filename: str
    imported_at: datetime
    row_count: int

class ReconciliationRead(BaseModel):
    id: int
    state: str
    raw_row_id: int
    source_row_number: int
    source_row_id: str | None
    financial_event_id: int
    transaction_date: date
    event_type: str
