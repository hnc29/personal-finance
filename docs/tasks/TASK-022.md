# TASK-022 — Real portfolio and review read APIs

Replace the synthetic portfolio/review frontend with truthful data from minimal
backend read APIs. Do not add broad CRUD or future features.

## Backend

### GET /api/v1/portfolio/overview
Add a thin router and a query/read-model service. Build the current overview
from persisted current state; do not use PortfolioSnapshot as the sole source
for the current screen.

Return enough typed data for:
- as_of
- net_worth
- invested_assets
- account summary/count
- savings rows
- credit-card rows/liabilities
- precious-metal rows
- crypto rows
- pricing/provider metadata where applicable

Money:
- Python/application: Decimal
- DB: existing INTEGER x10,000
- JSON monetary values: strings with exactly 4 decimals
- never Python/JSON float
- never silently round
- never invent a value for unavailable pricing

Rules:
- CASH/BANK/EWALLET balances are assets.
- CREDIT_CARD outstanding balance is a liability and reduces net worth.
- Savings are assets.
- Metals/crypto reuse existing pricing/domain infrastructure.
- Valuation uses existing BUY-side rules.
- Preserve LIVE/STALE/MANUAL/UNAVAILABLE plus provider/timestamp metadata.
- UNAVAILABLE must remain visibly unavailable, not become a fake zero valuation.
- Reuse app.services.portfolio.calculate_net_worth.
- Keep router thin; SQL/read aggregation belongs in service/query code.

### GET /api/v1/import-batches
Read persisted import batches for review.
- read-only
- typed stable response
- no local/absolute paths, secrets, credentials, or unnecessary metadata
- empty DB => []

### GET /api/v1/reconciliation-candidates
Read persisted reconciliation_candidates, never ordinary financial_events.
Return safe persisted review context: candidate identity/state, raw-row identity,
linked event identity/context if present, and deterministic metadata only when
actually stored/derivable. Do not fabricate scores. Empty table => [].

Mount all routers in app/main.py.

## Frontend

Extend apps/web/lib/api.ts with typed clients:
- portfolio.overview()
- imports.list()
- reconciliation.list()

Update apps/web/app/page.tsx:
- use real portfolio/import/reconciliation APIs
- ordinary financial events are never labeled reconciliation candidates
- remove "Synthetic preview"
- remove hard-coded TASK-020 savings/card/metal/crypto money fixtures
- show loading/error/empty states
- show LIVE/STALE/MANUAL/UNAVAILABLE truthfully
- never invent totals/values when valuation is unavailable
- preserve transactions/accounts/categories behavior

## Acceptance tests

Backend coverage at least:
- empty portfolio => truthful zero/empty summary
- cash/bank/e-wallet included correctly
- credit-card liability reduces net worth
- savings included
- precious-metal valuation uses BUY side
- crypto uses accepted persisted quote
- UNAVAILABLE does not invent value
- STALE metadata preserved
- MANUAL metadata preserved
- money JSON strings have exactly 4 decimals
- reconciliation API reads real reconciliation_candidates
- reconciliation API does not substitute financial_events
- import-batch API does not leak local paths

Frontend:
- no "Synthetic preview"
- no old hard-coded portfolio monetary fixtures
- real portfolio/import/reconciliation clients used
- financial events not presented as reconciliation candidates

## Scope / safety

Follow CLAUDE.md.
Never:
- access/modify data/**
- access .env, credentials, keys, backups, real statements/imports/exports
- use real financial data in tests/prompts/logs
- use Base.metadata.create_all()
- manually alter SQLite
- add network-dependent tests
- add cloud AI/runtime dependencies
- commit/push/reset/clean/rebase from Codex

TASK-022 should not need a migration. Reuse the existing schema unless a concrete
blocker is proven. Do not commit; host runner owns final commit.
