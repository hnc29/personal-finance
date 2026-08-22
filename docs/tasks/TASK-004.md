# TASK-004 — Accounts and Categories API

Implement only account/category application services and HTTP APIs.

## Requirements

- Reuse existing SQLAlchemy models and sync Session.
- Reuse AccountType exactly as defined by TASK-003.
- Do not add a persisted account balance column.
- Do not hard-delete accounts/categories; use is_active.
- Pydantic 2 schemas only.

### Accounts

Provide:
- POST /api/v1/accounts
- GET /api/v1/accounts
- GET /api/v1/accounts/{account_id}
- PATCH /api/v1/accounts/{account_id}

Fields exposed for create/read/update should remain aligned with the Account model:
name, account_type, currency, is_active.

Return 404 for an unknown account id.

### Categories

Provide:
- POST /api/v1/categories
- GET /api/v1/categories
- GET /api/v1/categories/{category_id}
- PATCH /api/v1/categories/{category_id}

Support parent_id.
Reject self-parenting.
Return 404 for unknown category/parent ids.
Do not enforce a database depth limit.

### Structure

Prefer small modules under app/schemas, app/services and app/api or the
existing project routing convention. Register routes in the FastAPI app.

### Tests

Create exactly:
- tests/test_accounts_api.py
- tests/test_categories_api.py

Tests must use synthetic data/mocks/overrides only and must never read or
write data/finance.db, data/** or .env.

Do not use Base.metadata.create_all(). Alembic remains the sole schema authority.

## Out of scope

- financial events / ledger APIs
- balance calculations
- imports
- savings
- assets
- market prices
- frontend
- dependency additions
- commits
