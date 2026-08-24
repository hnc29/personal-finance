# TASK-027 — Complete daily finance workflows

This task implements the user's latest hands-on review.

Preserve all audited V1 exact-money, ledger, portfolio, pricing, migration,
runtime-build-contract, default-category and i18n correctness.

Do not copy Money Lover proprietary assets, screenshots, logos or source. The
experience may be strongly inspired by common Money-Lover-style personal finance
patterns while remaining an original implementation.

No schema migration unless an existing model/table is genuinely unusable. The
default expectation is NO migration because savings/metals/crypto/import models
already exist in V1. If a migration appears necessary, STOP and report rather
than creating one.

## 1. Category picker behaves like a dropdown/popover

The category tree must NOT always be expanded on screen.

Required UX:
- closed by default
- a compact category field/row shows icon + selected category + chevron
- click/tap opens a dropdown/popover/sheet containing the 3-level tree
- click outside closes it
- Escape closes it
- selecting a category closes it
- reopening preserves selected category and visibly highlights it
- keyboard accessible
- mobile uses a sheet/popover that remains usable in narrow width
- preserve 3-level hierarchy and type filtering from TASK-026
- do not fall back to a flat native select

## 2. "Thêm chi tiết" must actually collapse fields

The following must be absent from normal layout until expanded:
- Người nhận
- Chuyến đi / sự kiện
- Ghi chú

Required:
- default collapsed on a new transaction
- `+ Thêm chi tiết` expands
- `Ẩn chi tiết` collapses
- collapse does not erase typed values
- if existing values are loaded into form, initialize expanded
- no CSS rule may leave the fields visible while state says collapsed
- accessibility: `aria-expanded`, keyboard button
- automated UI audit must verify collapsed-by-default rendering/state

## 3. Bank catalog/templates

The user wants predefined banks similar to the convenience of Money Lover.

Do NOT claim this is Money Lover's exact proprietary bank dataset.

Add an original practical Vietnam bank catalog for account creation. It should
include common institutions such as:
- Vietcombank
- BIDV
- VietinBank
- Agribank
- MB
- Techcombank
- ACB
- VPBank
- TPBank
- VIB
- Sacombank
- HDBank
- OCB
- MSB
- SHB
- SeABank
- LPBank
- Eximbank
- Nam A Bank
- Bac A Bank
- Other / Custom bank

Requirements:
- when creating a BANK account, show a searchable bank-template picker
- choosing a template fills a sensible account name but remains editable
- do not use/copy bank logos; use original monogram/CSS icon badges
- user may create a custom bank
- this catalog is a UI convenience list, not a new financial-category tree
- do not automatically create 20 bank accounts in the user's DB
- existing accounts unchanged

## 4. Original activity/category icons

Create a small local icon system for:
- expense categories
- income categories
- asset categories
- savings
- gold
- silver
- BTC/crypto
- bank/cash/wallet/credit card
- transfer
- import/export

Use:
- inline SVG components, CSS shapes, or Unicode where appropriate
- no external icon dependency solely for this task
- no copied Money Lover icon files
- icons must have accessible labels or be aria-hidden when decorative

Map predefined categories to stable icons. Unknown/user-created categories use a
safe generic icon.

## 5. Transfer must have a destination account

TRANSFER composer must explicitly show:
- Từ tài khoản
- Đến tài khoản
- Số tiền

Required semantics:
- source and destination are different accounts
- input amount is a positive exact-money string in UI
- submit creates exactly two account entries:
  source = negative amount
  destination = positive amount
- category hidden/not submitted
- changing source must not erase destination unless they become identical;
  if identical, require user to choose a different account
- clear validation messages
- preserve server-side balancing rules
- CREDIT_CARD_PAYMENT may use an analogous source/payment-account + card target
  flow if existing domain supports it
- add regression tests for exact entry signs and account IDs

For EXPENSE/INCOME retain the normal single primary account flow.

## 6. Language selector becomes flag buttons

Replace the language menu/select with compact flag-style buttons:
- 🇻🇳 Tiếng Việt
- 🇺🇸 English (or compact flag-only on narrow screen with accessible tooltip)

Requirements:
- two explicit buttons, not a select/dropdown
- active language visibly selected
- `aria-pressed`
- saved preference remains persisted
- switching remains reload-free
- accessible text must not depend only on emoji flag

## 7. Visible Import / Export data workflow

Add a user-facing `Dữ liệu` / `Data` page or section accessible from navigation.

### Import
Connect to the existing immutable Money Lover raw import/normalization pipeline
rather than inventing a new master ledger import path.

Required UI:
- choose `.csv` or `.xlsx`
- clearly label `Nhập từ Money Lover`
- upload file
- show imported batch result/status/counts
- do not silently convert uncertain rows into ledger events
- reconciliation/review semantics remain intact
- file parsing/import must use existing backend services where possible
- if multipart dependency is absent, prefer an application/octet-stream/raw-body
  upload endpoint with filename metadata rather than adding a new dependency

Security:
- filename sanitized
- size limit
- reject unsupported extension/type
- no arbitrary filesystem path exposure
- tests use synthetic files only

### Export
Provide visible export actions:
- Export financial events to CSV
- Export financial events to XLSX
- preserve money as exact decimal strings
- dates/times remain explicit
- exported data should be useful for personal backup/analysis
- never label a generated file as an official Money Lover or MISA document

Use existing `openpyxl` if XLSX is implemented. Do not add unnecessary
dependencies.

Add synthetic tests for CSV/XLSX export and Money Lover import endpoint.

## 8. Asset management UI + APIs

The user explicitly wants management, not only a read-only portfolio.

Add a visible `Tài sản` / `Assets` area with practical management flows for the
existing V1 modules:

### Savings
- list savings positions/accounts
- create a savings position using fields supported by the existing model
- edit safe metadata supported by current model
- record deposit/withdrawal using existing domain/service/event semantics where
  available
- do not directly mutate a balance in a way that breaks the ledger/domain model

### Precious metals
- GOLD and SILVER
- list holdings/lots
- add holding/lot using the existing metal model
- quantity uses canonical grams and exact decimal-string parsing
- allow edit/delete only if current domain model safely supports it
- show current pricing/valuation state from existing portfolio/pricing APIs
- BUY-side valuation semantics remain unchanged

### Crypto
- BTC must be supported
- list crypto lots/holdings
- add a BTC holding/lot using existing crypto model
- quantity is decimal string; never JS/Python float for exact values
- show pricing/valuation state
- no fake market price

Backend:
- inspect existing savings/metals/crypto models/services first
- expose typed CRUD/action APIs aligned to the existing domain
- no synthetic portfolio numbers
- no new duplicate source of truth
- use existing tables
- no migration
- API tests must prove create/list operations and portfolio integration where
  applicable

Frontend:
- forms must use exact string inputs
- clear empty states
- category/activity icons
- Vietnamese/English complete
- responsive original finance-app styling

## 9. Navigation

Navigation should expose, at minimum:
- Giao dịch / Transactions
- Tài khoản / Accounts
- Danh mục / Categories
- Tài sản / Assets
- Dữ liệu / Data
- Tổng quan / Portfolio or Overview
- Review where still relevant

Mobile bottom navigation can keep only primary items with `Thêm`/`Khác` sheet
for secondary sections if needed. Desktop can show all primary sections.

## 10. Money Lover-inspired visual direction

Refine the app consistently:
- green primary accent
- light neutral background
- rounded cards and pill/segmented controls
- compact white input surfaces
- original category/account/asset icons
- prominent amount
- category/account rows feel tappable
- primary save button green
- subtle border/shadow
- mobile-first spacing
- no copied logo/assets/pixel-perfect cloning

## 11. Automated acceptance audit

Add `apps/web/scripts/task027-ui-audit.mjs` and expose it as:
`npm run task027-ui-audit`

Audit markers must verify:
- category popover/dropdown closed state + open action
- details collapsed state + toggle labels
- transfer source/destination labels
- flag-language controls
- Assets section
- Data section
- bank template catalog
- no old always-expanded category tree marker in main form

Add pure TypeScript helpers/tests/auditable modules for:
- transaction-type category filtering
- transfer entry construction from exact money strings
- predefined bank catalog
- icon mapping

Do not weaken existing TASK-025/TASK-026 audits.

## 12. Host validation requirements

Must pass:
- backend pytest
- Ruff
- mypy
- compileall
- Alembic exactly one head: `0013_portfolio_snapshots`
- existing i18n audit
- TASK-026 audit
- TASK-027 audit
- frontend lint
- frontend typecheck
- production build
- TASK-025 build contract
- launcher disposable DB integration
- smoke-v1
- ports clean
- synthetic import/export tests
- synthetic savings/metals/BTC management API tests
- no synthetic portfolio regression
- no migration
- no dependency-version changes
- git diff --check

## 13. Safety

Follow CLAUDE.md.

Codex/tests must never:
- read/modify real `data/**`
- inspect `.env`, credentials, keys, backups, real statements/imports/exports
- use real finance data in fixtures/logs
- add a migration
- use Base.metadata.create_all()
- use float/silent money rounding
- change exact-money/ledger balancing semantics
- fake market prices
- add network-dependent tests
- upgrade dependencies
- run npm audit fix --force
- commit/push/reset/clean/rebase

Codex must not commit. Host runner validates and commits after PASS only.
