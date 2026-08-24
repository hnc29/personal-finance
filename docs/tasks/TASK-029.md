# TASK-029 — UI polish, searchable category tree, MISA-style savings, chi-unit metals, managed metal products, CoinGecko coin catalog

This task comes from direct visual/use review of the current app.

Preserve all previously audited exact-money, ledger balancing, portfolio,
pricing, import/reconciliation, i18n, runtime build contract, bank-icon and
account-bootstrap behavior.

## 1. Fix transaction composer proportions and alignment

The current screen has visibly uneven controls and too much form/developer-style
spacing.

Redesign the transaction composer to be compact and consistent:
- all tappable input rows use a shared control height (target ~48-52px desktop,
  touch-friendly on mobile)
- consistent border radius, horizontal padding and label rhythm
- no mismatched category/date/type heights
- no giant fieldset whitespace
- use a constrained centered card on desktop and near-full-width sheet/card on
  mobile
- `Chi tiêu / Thu nhập / Chuyển tiền` segmented control remains the primary
  transaction-type control
- remove redundant visible `Loại` select for those same primary types
- expose advanced event types only through an unobtrusive `Khác`/advanced
  action if they still need manual entry
- account and amount rows align in a clean grid
- category row has the same visual weight/height as account row
- remove the long developer-oriented positive/negative helper paragraph from the
  main flow; keep any necessary explanation in compact help text/tooltip
- primary save button should not be visually wider/taller than the containing
  design calls for; match the polished finance-app hierarchy
- retain original green/neutral visual language; do not copy proprietary assets

Add a TASK-029 UI audit that checks for the shared control classes/structure and
guards against reintroducing the redundant main-type select.

## 2. Category picker: searchable + collapsible tree

The category control must be a closed dropdown/popover/sheet until clicked.

Inside the open picker:
- add a search input at the top: `Tìm danh mục`
- accent/case-insensitive search
- search matches localized display labels AND canonical seeded labels
- matching a child must reveal its ancestor path
- preserve transaction-type filtering from TASK-026:
  EXPENSE -> Expenses subtree
  INCOME/INTEREST -> Income subtree
- each node with children has an explicit expand/collapse button at the START
  of the row
- collapsed parent hides descendants
- expanded parent shows descendants
- use accessible `aria-expanded`
- use separate disclosure button and selection button semantics so expanding a
  parent does not accidentally select it
- default expansion may open the first/root grouping level, but not every node
- selected category remains highlighted
- selecting a leaf closes the picker
- Escape/click-outside closes picker
- keyboard navigation remains usable
- display three levels clearly with indentation
- mobile: picker becomes a usable sheet/dropdown with bounded height + scroll

Pure helpers/tests:
- normalize Vietnamese search text
- filter tree by query while preserving ancestors
- expansion state helper
- type subtree filtering

## 3. Savings UI: practical MISA MoneyKeeper-style savings book workflow

Do NOT copy MISA screenshots/assets pixel-for-pixel.

Use the EXISTING savings domain:
- SavingsProduct
- SavingsAccount
- SavingsTerm
and existing exact interest/lifecycle services.

The savings area should look/behave like a dedicated `Sổ tiết kiệm` manager,
not a generic asset form.

Main list/cards should show what the model supports, such as:
- bank / institution / savings product
- savings book/account name
- principal
- start date
- maturity date
- term months
- annual interest rate
- current status
- days/status to maturity
- expected interest / maturity amount only when it can be calculated from
  existing exact service semantics
- renewal/rollover history when available

Create/edit flow should use supported fields from current model, not invented
ones. Prefer a compact top summary and a structured form similar in spirit to a
personal savings-book screen:
- Ngân hàng / Sản phẩm
- Tên sổ
- Số tiền gửi
- Ngày gửi
- Kỳ hạn
- Lãi suất năm
- Lãi suất không kỳ hạn where supported
- Ngày đáo hạn (derived/validated where appropriate)
- account/funding linkage only if the existing service requires it

Show a clear maturity badge:
- Còn hạn
- Sắp đáo hạn
- Đã đáo hạn / Đã đóng
using current data only.

Do not fake interest rates or maturity values.
No direct principal mutation that bypasses existing savings service/event logic.

## 4. Gold and silver UI unit = `chỉ`

Current backend already canonicalizes metal quantity to grams and already has
the CHI unit conversion. Preserve that architecture.

User-facing metal forms:
- Gold quantity input/display defaults to `chỉ`
- Silver quantity input/display defaults to `chỉ`
- do not expose grams as the primary unit in normal Vietnamese UI
- internally store/calculate canonical grams exactly
- use Decimal/string only
- 1 chỉ = 3.75 grams
- allow a compact advanced display such as `2 chỉ · 7.5 g` only if helpful,
  but primary value is `2 chỉ`
- no float conversion

Existing lot/history values stored as GRAM/LUONG/KG must remain readable and be
converted exactly for display where possible.

Tests must prove:
- `1` chỉ -> exact `3.75` grams
- round-trip display does not silently round
- portfolio valuation is unchanged by UI unit choice

## 5. Managed precious-metal product catalog

The user wants selectable product/brand categories:
- SJC
- BTMC
- BTMH
- PNJ
- DOJI
- Nguyên liệu

and the ability to add more later.

Inspect the current `PreciousMetalBrand`, holding and pricing-instrument schema
before changing anything.

Required behavior:
- a visible `Danh mục sản phẩm vàng/bạc` manager
- default catalog includes the six values above
- add custom product
- rename/deactivate custom product if safe
- seeded/default rows should not be destructively removed if referenced
- metal holding form selects a managed product
- each product may carry a stable code and optional pricing-instrument mapping
- pricing mapping must remain explicit; do not guess a provider instrument
- if no exact price instrument exists, valuation state is MANUAL/UNAVAILABLE
  rather than using another product's price
- gold and silver may share product issuers, but product/metal applicability
  should be explicit where useful

Persistence:
- Prefer reusing an existing safe free-form/catalog mechanism if current schema
  already supports it.
- If the current enum-only model cannot safely persist user-added products,
  ONE Alembic migration is allowed to introduce a proper product catalog and
  nullable/reference linkage while preserving every existing holding/lot.
- Existing holdings must migrate/read without data loss.
- Never edit the SQLite schema manually.
- If a migration is created, it must be the single new head after the current
  head and have upgrade/downgrade tests.

Do NOT overload `pricing_instrument` with human display text merely to avoid a
migration.

## 6. Crypto: choose coins from CoinGecko catalog, not BTC-only enum UX

CoinGecko official behavior to implement against:
- `/api/v3/coins/list` returns the supported active coin IDs, names and symbols
  and does not require pagination.
- CoinGecko IDs are the canonical IDs used by price endpoints.
- Price lookup should prefer unique CoinGecko IDs rather than ambiguous symbols.

Add a backend CoinGecko coin-catalog provider with injected/testable network
boundary using stdlib/established project patterns.

Required:
- searchable coin selector in Assets/Crypto
- query by name, symbol or CoinGecko ID
- result row shows name, uppercase symbol, CoinGecko ID when disambiguation helps
- use exact CoinGecko ID as pricing instrument / canonical external ID
- support BTC plus other active coins returned by CoinGecko
- do not hard-code a BTC-only enum in the user workflow
- preserve existing BTC records
- no fake prices
- offline/network failure: show a useful unavailable message and keep existing
  holdings usable
- cache fetched `/coins/list` response in memory for a reasonable TTL to avoid
  repeated huge calls; no background network loop
- cap UI results (for example first 50 search matches)
- no API key is required by the app if the current public/demo endpoint works;
  if CoinGecko changes availability, fail gracefully rather than embedding a
  secret
- tests mock the network boundary; tests never call CoinGecko

Persistence:
- inspect current CryptoAsset/CryptoHolding schema.
- if current BTC enum prevents persistence of arbitrary CoinGecko coins, ONE
  Alembic migration is allowed (shared with section 5 if needed) to evolve
  holdings to canonical `coingecko_id` + symbol/name metadata while preserving
  existing BTC as `bitcoin`.
- avoid symbol as identity because symbols can collide.
- quantity remains exact decimal string and current crypto precision rules stay
  intact.

Pricing:
- existing CoinGecko price provider must use the holding's CoinGecko ID.
- preserve quote freshness/state semantics LIVE/STALE/MANUAL/UNAVAILABLE.

## 7. Asset navigation/visual polish

Tài sản should have clear sub-tabs/cards:
- Sổ tiết kiệm
- Vàng & Bạc
- Crypto

Each should have:
- list
- `+ Thêm`
- clear empty state
- compact card rows
- edit/manage actions appropriate to existing domain
- valuation/source status where relevant
- consistent iconography and spacing

Avoid one giant form containing every asset class at once.

## 8. i18n

Vietnamese mode must contain natural Vietnamese for every new string.

English mode remains complete.

Required Vietnamese strings include:
- Tìm danh mục
- Thu gọn
- Mở rộng
- Sổ tiết kiệm
- Ngày đáo hạn
- Kỳ hạn
- Lãi suất
- Danh mục sản phẩm
- Thêm sản phẩm
- Nguyên liệu
- Số lượng (chỉ)
- Tìm coin
- Không thể tải danh sách coin
- Mã CoinGecko

Do not translate bank/provider/coin proper names.

## 9. Tests and acceptance

Add `apps/web/scripts/task029-ui-audit.mjs` and npm script:
`task029-ui-audit`.

Must cover:
- uniform transaction composer structure
- no redundant primary transaction type select
- searchable category tree
- disclosure expand/collapse buttons with aria-expanded
- query preserving ancestors
- savings-book labels/layout
- primary metal unit is CHI
- default metal products SJC/BTMC/BTMH/PNJ/DOJI/Nguyên liệu
- custom metal-product management
- CoinGecko searchable selector
- CoinGecko ID is used as identity
- BTC preservation
- i18n parity

Backend tests:
- existing savings lifecycle still passes
- savings APIs added/updated by this task
- 1 CHI == 3.75 grams exactly
- product catalog CRUD/seed/idempotency if added
- existing metal holdings preserved
- CoinGecko `/coins/list` parser/cache/search with mocked transport
- crypto create/list with at least bitcoin + ethereum or another synthetic
  CoinGecko ID
- pricing uses CoinGecko ID
- no float columns/serialization introduced
- portfolio regression unchanged

## 10. Migration rule

Default: no migration if current schema safely supports everything.

If persistence of custom metal products and arbitrary CoinGecko assets requires
schema evolution:
- at most ONE new revision for TASK-029
- down_revision = the pre-task Alembic head
- Alembic remains one head
- test empty DB -> head
- test existing schema/head -> new head
- migrate synthetic pre-existing BTC + precious-metal data and prove preserved
- offline SQL generation must pass where compatible with SQLite batch rules

## 11. Validation

Must pass:
- all backend pytest
- Ruff
- mypy
- compileall
- Alembic exactly one head
- migration tests if a new revision exists
- i18n audit
- TASK-026 / TASK-027 audits if present
- TASK-029 audit
- frontend lint/typecheck/build
- launcher disposable DB integration
- smoke-v1
- no orphan ports
- no synthetic portfolio regression
- no package dependency-version changes
- git diff --check

## 12. Safety

Follow CLAUDE.md.

Codex/tests must never:
- read/modify real `data/**`
- inspect .env/credentials/API keys/backups/real imports/statements
- send finance data to CoinGecko or any network service
- use real finance data in prompts/logs/tests
- manually alter SQLite
- use Base.metadata.create_all()
- use Python/JS float for money or exact quantities
- silently round money/metal/crypto values
- fake pricing
- upgrade dependencies
- run npm audit fix --force
- commit/push/reset/clean/rebase

Codex must not commit. Host runner validates and commits only after PASS.
