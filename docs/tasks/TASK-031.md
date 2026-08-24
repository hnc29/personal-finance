# TASK-031 — Rebuild transaction UX, category hierarchy UI, i18n, and real asset management

This task is driven by direct visual review of the running application.

The current UI is NOT acceptable yet:
- transaction controls are uneven and misaligned
- category dropdown wraps badly and feels like a debug/tool UI
- category rows lack coherent icons
- Category Management still exposes canonical English labels in Vietnamese mode
- Category Management collapse/expand behavior is incomplete
- parent selection is a native flat select with English breadcrumbs
- asset management still looks like the old generic form and BTC-only workflow
- a frontend BigInt literal may still break `next build` on the current TS target

The goal is not incremental cosmetic patching. Rebuild the affected user flows
as coherent production-quality interfaces while preserving all audited domain
semantics.

Follow `CLAUDE.md`.

## A. Non-negotiable safety and domain rules

Preserve:
- Decimal/string exactness; never JS/Python float for money or exact quantities
- DB money INTEGER scaled x10,000 where current architecture requires it
- no silent rounding
- ledger balancing semantics
- credit-card payment = transfer, not expense
- category adjacency-list `parent_id`
- UI category depth max 3
- Alembic is the only schema authority
- never `Base.metadata.create_all()`
- immutable Money Lover raw import
- deterministic normalization/reconciliation
- portfolio/valuation LIVE/STALE/MANUAL/UNAVAILABLE semantics
- savings lifecycle service semantics
- canonical precious-metal grams internally
- current crypto precision rules
- user data remains local

Never:
- read/modify `data/**`
- inspect `.env`, credentials, backups, real imports/statements
- send real finance data to any external service
- change dependency versions
- run `npm audit fix --force`
- commit/push/reset/clean/rebase from Codex

Synthetic/disposable fixtures only.

## B. First: inspect before editing

Before implementing, inspect:
1. current `apps/web/app/page.tsx` and any extracted components
2. current CSS
3. current category tree helper
4. current i18n implementation and canonical/default category label mapping
5. Category API schemas including `parent_id`
6. category create/update service cycle/depth validation
7. savings models/services/APIs
8. precious-metal models/units/brands/instruments
9. crypto holding model and CoinGecko pricing provider
10. current Alembic head
11. existing TASK-026/027/029/030 audit scripts
12. launcher/build contract

Do not assume TASK-029/TASK-030 are complete merely because their audit scripts
exist. The running UI proves some acceptance criteria were not met.

---

# 1. Transaction composer — rebuild the visual structure

## 1.1 Primary type control

Keep a single segmented control at the top:
- Chi tiêu
- Thu nhập
- Chuyển tiền

Do not show a second redundant `Loại` select for the same three modes.

If advanced event types still need manual entry, expose them through a compact
secondary `Khác` action, not as a prominent duplicate field.

## 1.2 Form grid

Desktop:
- centered transaction card with sensible max-width
- shared 2-column grid
- row 1: Ngày | Danh mục
- row 2: Tài khoản | Số tiền
- transfer mode: Từ tài khoản | Đến tài khoản, then Số tiền
- details disclosure below
- primary action at bottom

Mobile:
- single column
- no horizontal clipping
- no control wider than viewport

All primary controls must use ONE shared control system:
- same height: target 52-56px
- same radius
- same border
- same horizontal padding
- same font size / line height
- same focus ring
- same label spacing
- same disabled/error treatment

`input[type=date]`, account trigger, category trigger, amount input and transfer
account triggers must visually align.

Do not allow the screenshot's current situation where the date input is a
different size from category/account/amount.

## 1.3 Remove developer-facing helper text

Do not show the long sentence:
`Số âm là tiền ra, số dương là tiền vào...`
in the main simple transaction flow.

Users choose Chi tiêu/Thu nhập/Chuyển tiền; the UI/service should produce the
correct sign semantics.

If a technical explanation remains necessary, put it behind contextual help.

## 1.4 Details

`+ Thêm chi tiết` must truly collapse/expand optional fields:
- payee
- trip
- note
and any other existing optional details.

When collapsed those controls must not remain visible in layout.

---

# 2. Transaction CategoryPicker — rebuild as a polished searchable tree

The current dropdown is visually unacceptable: labels wrap, disclosure buttons
look detached, rows have inconsistent widths, and the popup overlaps awkwardly.

Create/extract a real `CategoryPicker` component.

## 2.1 Closed state

The closed trigger must:
- have the SAME height as date/account/amount controls
- display selected category icon + localized name
- display placeholder `Chọn danh mục`
- use a single chevron at the end
- never show a stray dot/bullet
- truncate very long labels with ellipsis, not wrap to multiple lines

## 2.2 Popover/sheet

Desktop:
- anchored popover under trigger
- width at least trigger width
- practical width ~380-460px
- max-height with internal scrolling
- high enough z-index
- stable layout; scrollbar must not overlap text/buttons

Mobile:
- use a bottom-sheet/dialog-like surface or viewport-safe dropdown
- bounded height, internal scrolling
- no clipping

## 2.3 Search

At top:
`Tìm danh mục`

Requirements:
- accent-insensitive
- case-insensitive
- matches localized label
- matches canonical predefined label
- user-created labels match as entered
- matching a descendant preserves all ancestors
- clearing search restores previous expansion state

## 2.4 Tree row design

Each row has one aligned structure:
- disclosure slot at the START
- category icon
- category label
- optional subtle child count

For a parent:
- disclosure button uses chevron right/down
- `aria-expanded`
- disclosure action ONLY expands/collapses
- label action selects only when selection is valid

For a leaf:
- use a spacer equal to disclosure width
- icon and label align with siblings

No detached rectangular disclosure button.
No label button with a second independent rounded pill.
The entire row should look like one tree row.

Indentation:
- level 1: base
- level 2: +16/20px
- level 3: +32/40px

Labels are single-line with ellipsis.

## 2.5 Filtering

Use canonical root ancestry, not translated text:
- EXPENSE -> Expenses subtree
- INCOME/INTEREST -> Income subtree
- transfer/card payment/savings/asset flows -> no expense/income category unless
  the domain explicitly requires one

Changing transaction type clears a category that is invalid for the new type.
Changing account must NOT clear a valid category.

---

# 3. Category icons

The UI currently lacks coherent category icons.

Implement one local icon system WITHOUT adding dependencies.

Preferred:
- reuse an icon package already installed, if present
- otherwise create small inline SVG React components

Do not use remote assets.

Provide stable icons for seeded groups, for example:
- Expenses: wallet/minus-circle
- Food & Drinks: utensils
- Groceries: basket/cart
- Bills & Utilities: receipt/bolt
- Transportation: car/bus
- Shopping: shopping-bag
- Home & Family: home/users
- Health & Fitness: heart/activity
- Entertainment: play/music
- Education: book
- Travel: plane/luggage
- Income: wallet/plus-circle
- Salary: briefcase
- Bonus: gift/star
- Investment: chart/trending-up
- Other: grid/circle

User-created categories:
- use stored icon when supported
- otherwise use a neutral fallback icon

Icon mapping must be based on stable canonical/default category identity, not
Vietnamese display text.

Use the same icon system in:
- transaction picker
- Category Management
- selected category trigger

---

# 4. Category Management — real localized hierarchical manager

The second screenshot proves this screen still fails usability:
- English canonical names are shown in Vietnamese mode
- parent selection is a native flat list
- hierarchy is not visually managed as a collapsible tree

Rebuild it.

## 4.1 Localization

When locale = `vi`, predefined categories must show Vietnamese labels everywhere:
- tree
- selected row
- search result
- parent picker
- breadcrumb
- dialog title
- add/edit form

Examples:
- Expenses -> Chi tiêu
- Income -> Thu nhập
- Food & Drinks -> Ăn uống
- Bills & Utilities -> Hóa đơn & Tiện ích
- Transportation -> Di chuyển
- Shopping -> Mua sắm

Do NOT translate user-created category names.

Canonical English names may remain in persistence but must not leak into normal
Vietnamese UI.

## 4.2 Main tree

Render a true three-level tree.

Requirements:
- root sections `Chi tiêu`, `Thu nhập`
- explicit chevron at start of every node with children
- `aria-expanded`
- independent expansion state
- root sections start expanded
- parent collapse hides ALL descendants
- child collapse hides grandchildren
- no flat duplicate rendering
- icons aligned at each level
- compact rows with consistent height
- no raw `parent_id` in normal UI

Tabs/filter:
- Tất cả
- Chi tiêu
- Thu nhập

Filtering never flattens hierarchy.

## 4.3 Search

`Tìm danh mục`
- same normalization helper as transaction picker
- preserve ancestors
- no English label leakage in displayed breadcrumb

## 4.4 Parent picker — DO NOT use native flat `<select>`

Replace the current parent selector with a custom hierarchy-aware picker.

Closed:
- `Không có danh mục cha`
or localized breadcrumb:
- `Chi tiêu › Hóa đơn & Tiện ích`

Open:
- searchable/collapsible tree
- icons
- localized labels
- invalid parents disabled/hidden
- single-line breadcrumbs
- no giant native macOS select

Rules:
- cannot select self
- cannot select descendant
- cannot produce a cycle
- cannot make depth > 3
- moving a parent with descendants must account for total subtree depth

## 4.5 Add child

Every level-1/level-2 node has a compact action:
`+ Thêm danh mục con`

Level 3 has no add-child action.

When launched from a row, parent is preselected.

## 4.6 Delete/deactivate

Preserve existing safe domain semantics.
Never cascade-delete transaction history.
Referenced/default categories must not be destructively removed.

---

# 5. i18n — stop English leakage

Audit the entire touched UI.

Vietnamese mode must not visibly expose application-owned English strings such as:
- Expenses
- Income
- Food & Drinks
- Bills & Utilities
- Transportation
- Shopping
- Assets
- Savings
- Precious metals
- Crypto
- Add BTC
- Add savings
- Add gold / silver
- Institution
- Purchase price
- Total cost
- Product
- Grams
- No parent category

Add/strengthen an automated audit that checks VI display mapping for predefined
categories and touched asset/transaction/category strings.

English mode must remain complete.

---

# 6. Fix current frontend build regression

If source still contains BigInt numeric literals such as:
- `10000n`
- `375n`
- `100n`

they can fail because the current TypeScript target is lower than ES2020.

Do NOT change tsconfig target merely to hide this.

Use target-compatible exact integer operations such as:
`BigInt("10000")`.

Do not convert exact metal calculations to Number/float.

Add a guard/audit so frontend source does not reintroduce BigInt literal syntax
unless project target is explicitly and safely moved in a future task.

---

# 7. Assets — replace old generic forms with real asset modules

The running UI still shows an old-style generic form and BTC-only workflow.
That is not acceptable.

Create a dedicated `Tài sản` experience with three visible sub-tabs/cards:
- Sổ tiết kiệm
- Vàng & Bạc
- Crypto

Default asset landing page should show summary cards and then the selected
module.

Do NOT render all three creation forms simultaneously in one large form wall.

Each module must have:
- list/cards of existing records
- `+ Thêm`
- add/edit dialog/sheet
- clear empty state
- valuation/status where supported
- responsive layout

---

# 8. Savings — real `Sổ tiết kiệm` UI

Use the existing savings domain:
- SavingsProduct
- SavingsAccount
- SavingsTerm
- existing lifecycle/interest service

Do not invent fields unsupported by domain.

## 8.1 List

Each savings card/row should display supported fields such as:
- bank/institution
- savings product
- savings book name
- principal
- opened/start date
- maturity date
- term months
- annual interest rate
- status
- days to maturity when derivable exactly
- expected interest/maturity amount only when current exact service supports it

Status badge:
- Còn hạn
- Sắp đáo hạn
- Đã đáo hạn
- Đã đóng
as appropriate to real data.

## 8.2 Add/edit flow

A structured savings-book dialog inspired by practical personal-finance/MISA
workflows, but do not copy proprietary assets.

Use supported domain fields:
- Ngân hàng / Tổ chức
- Sản phẩm tiết kiệm
- Tên sổ
- Số tiền gửi
- Ngày gửi
- Kỳ hạn
- Lãi suất năm
- Ngày đáo hạn when derived/supported
- funding account only if existing service needs it
- rollover/maturity option only if current domain supports it

Do not fake rates or maturity values.

Principal changes must go through existing savings service/event semantics.

---

# 9. Gold & Silver — user unit `chỉ`, canonical grams internally

Normal Vietnamese UI:
- primary unit = `chỉ`
- label = `Số lượng (chỉ)`

Do not show `Grams` as primary input.

Exact conversion:
- 1 chỉ = 3.75 grams

Internal storage/calculation remains canonical grams.

Requirements:
- string/Decimal/BigInt-safe conversion only
- no Number float
- exact round trip where supported
- existing GRAM/LUONG/KG records remain readable
- optional secondary display: `2 chỉ · 7,5 g`
- valuation unchanged by presentation unit

---

# 10. Managed gold/silver product catalog

Visible manager:
`Danh mục sản phẩm`

Seed/default values:
- SJC
- BTMC
- BTMH
- PNJ
- DOJI
- Nguyên liệu

Requirements:
- selectable from metal holding form
- `+ Thêm sản phẩm`
- custom product can be added
- rename/deactivate custom product if safe
- referenced products cannot be destructively removed
- optional stable code
- explicit applicable metal type if domain needs it
- optional pricing instrument mapping

Pricing mapping must be explicit.
Never guess another product's price.
No mapping -> MANUAL/UNAVAILABLE rather than incorrect live valuation.

Persistence:
- inspect current schema first
- reuse safe catalog model if it exists
- otherwise one TASK-031 Alembic migration is allowed to introduce a normalized
  metal product catalog/reference while preserving all current holdings/lots

---

# 11. Crypto — real CoinGecko coin selection, not BTC-only

Current BTC-only form must be replaced.

## 11.1 Coin catalog backend

Implement or finish a CoinGecko coin-list provider against:
`/api/v3/coins/list`

Network boundary must be injectable/testable.

Behavior:
- cache active coin list in memory for a reasonable TTL
- no background loop
- no secret embedded
- offline failure is graceful
- tests mock network; no live CoinGecko calls
- no real portfolio data sent to CoinGecko

Expose a local API search endpoint, e.g.:
`GET /api/v1/assets/crypto/coins?q=...`

Return capped results, e.g. first 50:
- CoinGecko ID
- symbol
- name

Search:
- name
- symbol
- CoinGecko ID
- case-insensitive

## 11.2 Identity

CoinGecko ID is canonical external identity.
Do NOT use symbol alone because symbols can collide.

Existing BTC must remain readable/migrate to:
- id: `bitcoin`
- symbol: `btc`
- name: `Bitcoin`

## 11.3 Crypto UI

`Tìm coin`

Selector:
- searchable combobox
- result row: coin name + uppercase symbol
- show CoinGecko ID when useful for disambiguation
- selecting coin persists canonical CoinGecko ID
- BTC, ETH and any other CoinGecko-listed active asset can be selected

Holding form:
- coin
- quantity
- purchase date
- purchase price
- total cost
- account/wallet only if current model supports it

Existing precision rules remain exact.

Offline:
`Không thể tải danh sách coin`
but existing holdings still display.

## 11.4 Pricing

Existing CoinGecko price provider must use holding's CoinGecko ID rather than
hard-coded BTC or ambiguous symbol.

Preserve LIVE/STALE/MANUAL/UNAVAILABLE semantics.

Persistence:
- inspect current CryptoHolding schema
- if BTC enum/hard-coded pricing instrument prevents arbitrary CoinGecko IDs,
  the same ONE TASK-031 Alembic migration allowed by this task may evolve schema
  safely
- preserve all existing BTC holdings/lots exactly

---

# 12. One migration maximum

Default: no migration.

If custom metal products and arbitrary CoinGecko identity cannot be represented
safely in current schema, TASK-031 may create AT MOST ONE new Alembic revision.

Requirements:
- `down_revision` = pre-task head
- exactly one Alembic head
- empty DB -> head passes
- prior head -> new head passes
- migrate synthetic pre-existing BTC holding/lots
- migrate synthetic pre-existing precious-metal holding/lots
- prove quantity/cost/instrument data preserved
- no manual SQLite alteration
- no data destruction

---

# 13. CSS/UI acceptance based on the rejected screenshots

The rebuilt UI must explicitly avoid these observed problems:

FAIL if:
- date/category/account/amount controls have visibly different heights
- category popover rows wrap into multiple lines under normal desktop width
- disclosure buttons appear as detached pills
- category icon is a stray dot
- parent selector opens a native English flat menu
- canonical `Expenses` appears in VI mode
- root category cannot be collapsed
- asset page still says `Add BTC` / `Add gold / silver` / `Add savings`
- all three asset forms are permanently visible simultaneously
- metal form says `Grams` as primary quantity unit
- crypto form hard-codes `BTC_USD`

Prefer:
- calm finance-app green accent
- warm neutral surfaces
- subtle borders/shadows
- consistent 12/16/20/24 spacing rhythm
- responsive cards
- no brand asset copying

---

# 14. Automated audits/tests

Add:
`apps/web/scripts/task031-ux-audit.mjs`

Expose:
`npm run task031-ux-audit`

Must check at minimum:
- shared control class/structure for date/category/account/amount
- no redundant primary type select
- category trigger uses real CategoryPicker
- category search exists
- aria-expanded exists
- category rows use icon component
- no native parent category select
- localized category display helper used in management
- VI canonical category leakage guard
- root/parent collapse implementation
- assets have Savings/Metals/Crypto sub-navigation
- metal primary unit label is CHI
- six default metal products appear in catalog seed/UI
- crypto uses CoinGecko ID
- BTC-only `pricing_instrument: "BTC_USD"` form code is gone
- source BigInt literal syntax absent
- i18n parity

Pure frontend tests/helpers should prove:
- Vietnamese search normalization
- ancestor-preserving category search
- expansion/collapse
- localized breadcrumb
- cycle/depth parent option filtering
- `1 chỉ -> 3.75 g` exact string conversion
- category trigger selected label/icon behavior where practical

Backend tests:
- category API returns parent_id
- category move cycle/depth safety
- savings lifecycle regression
- metal exact CHI conversion/domain regression
- metal product seed CRUD/idempotency if catalog is persisted
- CoinGecko list parsing/cache/search with mocked transport
- arbitrary CoinGecko ID holding create/list if schema/API added
- BTC preservation
- price provider uses CoinGecko ID
- portfolio regression

---

# 15. Validation

All must pass before commit:

Backend:
- `uv run pytest -q`
- `uv run ruff check .`
- `uv run mypy app`
- `uv run python -m compileall -q app`
- Alembic exactly one head
- migration upgrade tests if revision added

Frontend:
- task031 UX audit
- task030 audit if present
- task029 audit if present
- task027/task026 audits if present
- i18n audit
- lint
- typecheck
- build

Integration:
- launcher on disposable DB
- `scripts/smoke-v1.sh`
- no orphan listeners
- git diff --check

Package safety:
- dependency fields unchanged
- package-lock unchanged
- backend dependency files unchanged

Generated Next files:
- do not commit generated `next-env.d.ts` or incidental `tsconfig.json` drift.

Codex must not commit.
Host runner commits only after validation passes.
