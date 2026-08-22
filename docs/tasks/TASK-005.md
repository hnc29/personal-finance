# TASK-005 — Ledger Service and Financial Event API

Implement only the financial-event/account-entry application layer and APIs.

## Requirements

Use existing FinancialEvent, AccountEntry, FinancialEventType and money
primitives from TASK-002/TASK-003.

### Money boundary

- API/application monetary values are Decimal.
- Persistence is amount_scaled INTEGER x10,000.
- Convert only through money_to_scaled/scaled_to_money.
- Never use Python float for money.
- Never silently round.

### Event creation

Provide an atomic service for creating one FinancialEvent with one or more
AccountEntry rows.

Require:
- transaction_date
- event_type
- at least one entry
- every referenced account must exist
- occurred_at remains optional and separate from transaction_date

For TRANSFER and CREDIT_CARD_PAYMENT only:
- exactly two entries
- two distinct accounts
- scaled amounts must be exact opposites and sum to zero

Do not impose a zero-sum rule on EXPENSE, INCOME or other event types.

Do not implement event mutation/deletion in this task.

### Query API

Provide:
- POST /api/v1/financial-events
- GET /api/v1/financial-events
- GET /api/v1/financial-events/{event_id}
- GET /api/v1/accounts/{account_id}/balance

Account balance is SUM(account_entries.amount_scaled) for that account and is
returned as Decimal/application money.

### Tests

Create exactly:
- tests/test_ledger_service.py
- tests/test_ledger_api.py

Cover:
- ordinary expense/income creation
- exact Decimal scaling
- transfer validation
- credit-card-payment validation
- account balance summation
- transaction_date vs nullable occurred_at
- 404/validation behavior

Tests must use synthetic data/mocks/overrides only and must never touch
data/finance.db, data/** or .env.

Do not use Base.metadata.create_all().

## Out of scope

- reconciliation
- Money Lover/MISA imports
- savings
- assets
- market prices
- event editing/deleting
- commits
