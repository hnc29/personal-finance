# TASK-022 Repair — Correct portfolio read-model semantics and add acceptance tests

Base commit: ba49330.

The initial TASK-022 implementation passed generic validation but manual audit
found correctness/coverage gaps. Repair those gaps without broadening V1 scope.

## 1. Credit-card liability semantics — mandatory

Inspect the existing ledger and credit-card domain contracts and prove the sign
semantics with tests.

Current project behavior indicates credit-card current ledger balance is zero or
negative, while `calculate_net_worth()` subtracts CREDIT_CARD component values.
Normalize the value passed to `PortfolioComponentValue(CREDIT_CARD, ...)` so a
real outstanding debt reduces net worth rather than increasing it.

Acceptance example:
- asset account = +100.0000
- credit-card ledger balance = -25.0000
- net worth must be 75.0000, not 125.0000

The read-model row for credit cards must use a clear, consistent liability
representation. Do not change ledger accounting conventions merely to make the
read model easier.

## 2. Incomplete valuation semantics — mandatory

Do not present a partial aggregate as a complete net worth.

Standardize the overview contract with:
- `valuation_complete: bool`
- `net_worth: str | None`
- `invested_assets: str | None`

If any holding included in net worth requires a price but has no acceptable
valuation (`UNAVAILABLE` / no usable valuation price), then:
- `valuation_complete` must be false
- aggregate `net_worth` must be null
- aggregate `invested_assets` must be null when the missing valuation affects it
- the affected asset row value remains null and quote state remains UNAVAILABLE

If everything required is valued, aggregates are exact 4-decimal money strings.

An empty portfolio is complete and may return zero totals.

Frontend must show a truthful "Valuation incomplete" / equivalent state rather
than displaying a partial total as authoritative.

## 3. Pricing metadata — mandatory

`QuoteMeta` must preserve, when available:
- state
- provider
- quoted_at
- observed_at
- valuation_price

`valuation_price` is a money/price decimal string using the project's exact
fixed-point conventions; never JSON float.

Keep LIVE, STALE, MANUAL, UNAVAILABLE truthful.

## 4. Exact-money serialization — mandatory

Remove silent rounding from the TASK-022 read model.

Do not use formatting such as `f"{value:.4f}"` as a way to coerce arbitrary
Decimal values to four places.

Reuse the project's existing fixed-point helpers/invariants
(`money_to_scaled` / `scaled_to_money` or the established equivalent). If a
derived monetary valuation cannot be represented exactly at scale 4, handle it
explicitly according to the existing money-domain contract; do not silently
round.

Add tests proving exact 4-decimal JSON output and the chosen exact behavior for
derived valuation.

Do not weaken the global rule that money with >4 decimals is rejected rather
than silently rounded.

## 5. Real TASK-022 acceptance tests — mandatory

Add focused synthetic tests for the read APIs/services. Tests must cover at least:
- GET /api/v1/portfolio/overview on empty DB
- cash/bank/e-wallet asset inclusion
- credit-card liability reduces net worth
- savings inclusion
- precious-metal BUY-side valuation
- crypto accepted quote valuation
- UNAVAILABLE => no invented row value and incomplete aggregate
- STALE metadata preserved
- MANUAL metadata preserved
- observed_at and valuation_price exposed
- money serialized exactly with 4 decimals
- GET /api/v1/import-batches sanitizes local/absolute path to basename
- GET /api/v1/reconciliation-candidates reads persisted candidates
- ordinary financial_events alone do not appear as reconciliation candidates

Use only synthetic/anonymized fixtures. No real financial data and no network.

The repair is not accepted merely because the old 187 tests pass; new tests must
exercise the new endpoints/semantics.

## 6. Existing correct behavior to preserve

Keep:
- real portfolio/import/reconciliation clients in frontend
- no Synthetic preview
- no hard-coded TASK-020 portfolio fixture values
- import read endpoint path sanitization
- reconciliation backed by ReconciliationCandidate
- thin router/read-model boundary
- existing transactions/accounts/categories flows

## 7. Scope / safety

Follow CLAUDE.md.

Do NOT:
- read/modify data/**
- read .env, credentials, keys, backups, real statements/imports/exports
- add a schema migration
- use Base.metadata.create_all()
- use Python/JSON float for money
- add broad CRUD
- add network-dependent tests
- commit/push/reset/clean/rebase from Codex

Do not modify `apps/web/tsconfig.tsbuildinfo`; it is generated build state and
will be handled separately by the host audit.
