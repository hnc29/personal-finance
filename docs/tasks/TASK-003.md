# TASK-003 — SQLAlchemy persistence foundation

Implement only the foundational persistence layer.

Do not implement APIs, services, repositories, import adapters,
savings, assets, market prices, credit-card profiles, budgets,
reconciliation or frontend code.

Alembic is the sole schema authority.
Never call Base.metadata.create_all().

Money persisted in database columns must use INTEGER scaled x10,000.
Never persist monetary values using float.

Do not access data/** or .env.
Do not commit.

## 3A — Model foundation and core models

Create an app/models package using SQLAlchemy 2 typed declarative ORM.

Create a common Base.

Create AccountType with exactly:

- CASH
- BANK
- CREDIT_CARD
- EWALLET

Create accounts table/model with at least:

- id: integer primary key
- name: required string
- account_type: AccountType persisted as string
- currency: required string, default VND
- is_active: boolean, default true

Do not persist a current balance column.
Balances will be derived from ledger entries.

Create categories table/model using adjacency-list hierarchy:

- id: integer primary key
- name: required string
- parent_id: nullable FK to categories.id
- is_active: boolean, default true

Database hierarchy must support unlimited depth.
The UI depth restriction will be implemented later.

Create appropriate SQLAlchemy relationships.

Ensure app/models/__init__.py imports the models required for metadata.

## 3B — Migration 0001_core

Update migrations/env.py so:

- Base.metadata is the Alembic target_metadata
- all models are imported before metadata is used
- existing SQLite engine/configuration behavior is preserved
- no Base.metadata.create_all() is introduced

Create migration:

0001_core

It creates:

- accounts
- categories

Downgrade must reverse only this migration.

## 3C — Ledger models

Create FinancialEventType with exactly:

- EXPENSE
- INCOME
- TRANSFER
- CREDIT_CARD_PAYMENT
- INTEREST
- SAVINGS_DEPOSIT
- SAVINGS_WITHDRAWAL
- ASSET_PURCHASE
- ASSET_SALE
- ADJUSTMENT

Create financial_events with at least:

- id: integer primary key
- event_type: FinancialEventType
- transaction_date: required DATE
- occurred_at: nullable DATETIME
- category_id: nullable FK to categories
- payee_text: nullable text/string
- trip_event_text: nullable text/string
- note: nullable text

transaction_date and occurred_at must remain separate.
Never fabricate midnight for date-only sources.

Create account_entries with at least:

- id: integer primary key
- financial_event_id: required FK to financial_events
- account_id: required FK to accounts
- amount_scaled: required INTEGER

amount_scaled is signed:
- negative decreases an account
- positive increases an account

Do not use Float/Numeric for this field.

Create sensible indexes for event date and foreign-key lookups.

## 3D — Migration 0002_ledger

Create migration:

0002_ledger

down_revision must be 0001_core.

It creates:

- financial_events
- account_entries
- required indexes and foreign keys

Downgrade must reverse only this migration.

## 3E — Import models

Create import_batches with at least:

- id: integer primary key
- source: required string
- original_filename: required string
- file_sha256: required string
- imported_at: required datetime
- row_count: required integer

file_sha256 must support exact-file duplicate detection.

Create raw_import_rows with at least:

- id: integer primary key
- import_batch_id: required FK to import_batches
- source_row_number: required integer
- source_row_id: nullable string
- raw_payload: required text
- semantic_fingerprint: nullable string

Raw rows represent immutable imported source records.
Do not normalize or overwrite raw_payload.

Add uniqueness for:
(import_batch_id, source_row_number)

Do not implement import adapters in TASK-003.

## 3F — Migration 0003_import

Create migration:

0003_import

down_revision must be 0002_ledger.

It creates:

- import_batches
- raw_import_rows
- required constraints and indexes

Downgrade must reverse only this migration.

Migration chain must be:

0001_core
  ->
0002_ledger
  ->
0003_import

with exactly one Alembic head.

## 3G — Tests

Add focused tests for the persistence foundation.

At minimum verify:

- AccountType values are exact
- FinancialEventType values are exact
- category uses self-referencing parent_id
- financial_events has transaction_date
- occurred_at remains nullable and separate
- account_entries.amount_scaled is integer based
- expected tables are present in SQLAlchemy metadata
- migration chain is 0001_core -> 0002_ledger -> 0003_import

Tests must not access data/finance.db.

Use synthetic/test-only data where data is needed.

Do not use Base.metadata.create_all() as application schema management.

## Global constraints

Do not modify app/core/money.py semantics.

Do not add dependencies unless absolutely required; none are expected.

Do not implement:
- APIs
- repositories
- import adapters
- Money Lover parser
- MISA parser/exporter
- bank statement parser
- savings
- precious metals
- crypto
- market prices
- credit-card profiles/statements
- frontend

Do not commit.
