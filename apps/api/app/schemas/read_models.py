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
    # TASK-040: how many of this batch's raw rows already became a real
    # financial_events row (via auto-apply). Lets the Review page show
    # "already applied" vs. offer an Apply action, without a second call.
    applied_row_count: int = 0

class ImportApplyRead(BaseModel):
    """Response for POST /imports/{batch_id}/apply -- see ApplyResult."""

    batch_id: int
    total_rows: int
    already_applied_rows: int
    transfer_pairs_applied: int
    expense_income_rows_applied: int
    applied_rows: int
    categorized_rows: int
    uncategorized_rows: int
    invalid_rows: list[int]
    unmatched_wallets: dict[str, int]
    unmatched_row_count: int

class ReconciliationRead(BaseModel):
    id: int
    state: str
    raw_row_id: int
    source_row_number: int
    source_row_id: str | None
    financial_event_id: int
    transaction_date: date
    event_type: str
