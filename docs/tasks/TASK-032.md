# TASK-032 — Close the TASK-031 acceptance gaps found in review

This task was self-defined from `docs/tasks/TASK-031-REVIEW.md`, a direct
review of the running app against TASK-031's acceptance criteria. That review
found several TASK-031 requirements that were not actually met even though
`task031-ux-audit.mjs` passed — the audit checked for literal substrings
(including some that no longer reflected the real code), not for the actual
behavior TASK-031 specified. This task fixes the underlying product gaps and
replaces the substring-matching audit with checks tied to real structure.

Executed autonomously per user instruction: run, self-fix on error, report
only the final result.

## 1. Critical issues fixed

### 1.1 Category parent picker leaked English / used a native `<select>`

TASK-031 §4.4 required a custom hierarchy-aware parent picker, not a native
flat `<select>`. `Categories()` now uses a new `ParentPicker` component
(`apps/web/app/page.tsx`) — a searchable/collapsible tree matching the
existing `CategoryPicker` control system, with a "None" root option, per-node
`<CategoryIcon>` + localized breadcrumb, and validity computed via
`canMoveCategory`/`getCategoryDepth` (self, descendant, and depth-3 rules from
`lib/category-tree.ts`, unchanged).

### 1.2 Advanced transaction types were unreachable

TASK-031 §1.1 said advanced event types (`CREDIT_CARD_PAYMENT`, `INTEREST`,
`SAVINGS_DEPOSIT`, `SAVINGS_WITHDRAWAL`, `ASSET_PURCHASE`, `ASSET_SALE`,
`ADJUSTMENT`) may be exposed through a compact secondary control, but the
primary segmented control only rendered `eventTypes.slice(0, 3)` and nothing
else surfaced the remaining seven — they were only reachable by data that
already had that `event_type` set, not from the composer UI. `Transactions()`
now pairs the primary 3-way segmented control with a secondary
`<select className="advanced-type-select">` (`eventTypes.slice(3)`) inside a
new `.type-row` wrapper, so all 10 `EventType` values are selectable.

### 1.3 Crypto backend was hardcoded to BTC with no real coin search

TASK-031 §11 required arbitrary CoinGecko coin identity with a real search
endpoint. The previous `CryptoAsset` enum (`BTC` only) has been removed.

Backend:
- `crypto.py` models: `CryptoHolding` now stores `coingecko_id`, `symbol`,
  `display_name` instead of an `asset` enum column.
- New Alembic revision `0014_crypto_coin_identity` (down_revision
  `0013_portfolio_snapshots`, single head) backfills existing BTC holdings to
  `coingecko_id="bitcoin"`, `symbol="btc"`, then drops the old column.
  `crypto_lots` (an FK child of `crypto_holdings`) is detached (rows captured,
  table dropped) before the parent table is recreated, then reattached —
  required because SQLite's batch-mode table recreation cannot proceed while
  a child table still references the parent, and `PRAGMA foreign_keys` is a
  no-op mid-transaction. Verified by manual upgrade/downgrade round-trips
  against synthetic data (ids, quantities, prices preserved exactly).
- New `app/services/http_client.py` (stdlib `urllib`, no new dependency) and
  `app/services/crypto_coin_catalog.py`: `CoinGeckoCoinListProvider.search()`
  against `GET /api/v3/coins/list`, TTL-cached in memory, falls back to stale
  cache on transport error, injectable `HttpClient` for tests (no live
  network calls in the test suite).
- New endpoint `GET /assets/crypto/coins?q=...` (`app/api/assets.py`), wired
  through FastAPI `Depends()` for test overrides.
- `CryptoCreate` schema now takes `coingecko_id`/`symbol`/`display_name`
  instead of a fixed asset enum; `create_crypto`/`list_crypto` updated to
  match. `CryptoPriceProvider` and `read_models.py` updated to key off
  `coingecko_id` rather than the removed enum.

Frontend: new `CoinPicker` component (`apps/web/app/page.tsx`) — a debounced
(250ms) searchable combobox backed by `api.assets.crypto.searchCoins`,
replacing the old free-text/hardcoded coin input. The crypto submit button is
disabled until a coin is actually selected.

### 1.4 Banned help sentence still shown in the main flow

TASK-031 §1.3 said the long developer-facing sentence ("Use negative amounts
for money leaving an account...") must not show in the main simple flow. It
now renders only for the seven advanced event types, behind a
`<details className="hint-details">` disclosure — EXPENSE/INCOME (the common
path) never show it.

## 2. Important issues fixed

- **Category icons**: `categoryIcon(name): string`, which returned bare
  Unicode glyphs/dots, is removed from `lib/category-tree.ts`. New
  `lib/category-icons.tsx` provides ~30 inline-SVG icons (no new dependency)
  keyed by canonical category name, with a `Grid` fallback (never a bare
  dot). Used in the transaction `CategoryPicker`, `ParentPicker`, and
  Category Management's tree rows.
- **Category Management root sections collapsed by default**: TASK-031 §4.2
  required roots to start expanded. `Categories()` now seeds `expanded` from
  loaded data (`useEffect` over `query.data`, filtering `parent_id == null`).
- **Metal product/brand catalog not exposed in UI**: new
  `GET /assets/metal-brands` endpoint returns the managed brand catalog
  (`SUPPORTED_PRECIOUS_METAL_BRANDS`, including `RAW`); the metals form's
  brand `<select>` is now sourced from it instead of free text, and
  `list_metals`/`create_metal` responses include `brand`.
- **English leak in the metal quantity placeholder**: `"Quantity (chỉ)"` was
  used as both the `tr()` key and the raw string with no Vietnamese
  translation registered, so Vietnamese mode showed English. Added proper
  `enUi`/`viUi` entries (see i18n cleanup below).

## 3. i18n cleanup

`lib/i18n.ts` had several **dead** Vietnamese-only `viUi` entries — keyed by
the Vietnamese text itself (e.g. `"Sổ tiết kiệm":"Sổ tiết kiệm"`) rather than
by the English key actually passed to `tr()`/`ui()`. Because `ui()` looks a
key up in `enUi` first and falls back to the raw key text when absent, these
entries were unreachable by any real call site — they were leftover
placeholders, not working translations, and masked real English-leak bugs
(the code was calling `tr("Product catalog")`, `tr("Quantity (chỉ)")`,
`tr("Search coin")`, `tr("Coin catalog unavailable")`, `tr("Choose coin")`,
none of which had a matching `enUi` key, so Vietnamese mode silently showed
English for all of them).

Fixed by adding the actual keys used by the new/changed UI to `enUi`, with
correct `viUi` translations, and removing the unreachable self-mapped
entries. Two of those removed entries (`"Sổ tiết kiệm"`, and fields implied by
`"Ngày đáo hạn"`/`"Kỳ hạn"`/`"Lãi suất"`) referred to the richer MISA-style
savings book UI that TASK-029 §3 specified (maturity date, term, interest
rate) but that was never actually built — the Savings form still only has
name/institution/principal/date. That gap is **not** fixed by this task (see
§5) — the dead strings were placeholders for it and are removed rather than
kept as fake coverage.

Also added `RAW: "Nguyên liệu"` to the enum-label dictionary (`display.vi`)
so the metal brand select shows a translated label for that value in
Vietnamese mode, matching the other brand codes (which are proper nouns and
correctly shown as-is in both languages).

## 4. Audit scripts

- Rewrote `scripts/task031-ux-audit.mjs`'s markers to match the real
  implementation (`CategoryIcon`/`CoinPicker` instead of the removed
  `categoryIcon`/hardcoded-BTC markers it was checking for).
- Fixed `scripts/task027-ui-audit.mjs`: it asserted `"Vietcombank"` appears in
  `app/page.tsx`, but that string only ever lived in `lib/bank-catalog.ts`
  (imported as `bankCatalog`) — the assertion could not have been checking
  what it claimed to check. It now reads the catalog file directly.
- Fixed `scripts/task029-ui-audit.mjs`: removed assertions for the dead
  self-mapped i18n strings described in §3 above, keeping only the ones that
  correspond to real, wired-up translations.
- Added `scripts/task032-ux-audit.mjs` (`npm run task032-ux-audit`), which
  checks structure instead of hand-picked substrings:
  - every literal `tr("...")`/`ui(language, "...")` call site in `page.tsx`
    resolves through `enUi` or the vi-only `extra` override map (i.e. a
    general i18n-leak guard, not a fixed string list — this is the audit that
    would have caught the §3 bugs automatically);
  - the removed `categoryIcon()` function is gone from both call sites and
    its own module, and `<CategoryIcon>` is actually rendered;
  - `<ParentPicker>` is used for the category parent field and no native
    `<select name="parent">` reappears;
  - both `eventTypes.slice(0, 3)` and `eventTypes.slice(3)` are present (all
    10 event types reachable);
  - `entryAmountHelp` is wrapped in `<details>`, not rendered unconditionally
    before the entries list;
  - `<CoinPicker>` calls the real search endpoint, no `CryptoAsset.BTC` or
    hardcoded `pricing_instrument: v("coin")` pattern remains, and crypto
    submit sends `coin.id` as `coingecko_id`;
  - metal brands come from `api.assets.metalBrands`, not a hardcoded
    `<option value="SJC">` literal;
  - no BigInt literal syntax reintroduced (carried over from TASK-031 §6).

## 5. Known gaps not addressed by this task

Out of scope for this pass — flagged for a future task rather than silently
built or silently left with fake audit coverage:

- **Savings UI is still the plain generic form** (name/institution/
  principal/date only). TASK-029 §3 / TASK-031 §8 specified a real
  `Sổ tiết kiệm` book UI with savings product, term months, annual interest
  rate, maturity date, and status (Còn hạn/Sắp đáo hạn/Đã đáo hạn/Đã đóng)
  driven by the existing `SavingsProduct`/`SavingsAccount`/`SavingsTerm`
  domain. This is a real feature build, not a small fix, and was not part of
  the 4 critical + important issues this task targeted.
- The Assets page's three forms/tabs and portfolio summary cards are
  functionally complete (TASK-031 §7) but have not been re-reviewed
  pixel-for-pixel against §13's visual acceptance list in this pass; only the
  functional gaps from `TASK-031-REVIEW.md` were addressed.

## 6. Validation

Backend (`apps/api`):
- `uv run pytest -q` — 212 passed
- `uv run ruff check .` — clean
- `uv run mypy app` — clean, 66 source files
- `uv run python -m compileall -q app` — clean
- `alembic heads` — single head (`0014_crypto_coin_identity`)
- dependency fields (`pyproject.toml`) unchanged — no new packages added

Frontend (`apps/web`):
- `npm run lint` (`--max-warnings=0`) — clean
- `npm run typecheck` — clean
- `npm run build` — clean production build
- `npm run task026-ui-audit` / `task027-ui-audit` / `task029-ui-audit` /
  `task030-category-tree-audit` / `task031-ux-audit` / `task032-ux-audit` —
  all pass
- `node scripts/i18n-audit.mjs` — clean
- `package.json` dependencies/devDependencies unchanged — no new packages
  added (only a new `task032-ux-audit` script entry)

Integration (`scripts/smoke-v1.sh`):
- Ran against a fresh disposable SQLite DB migrated to `0014_crypto_coin_identity`
  from empty, with default categories seeded (61 inserted).
- Equivalent to the full script's checks, run in two phases (API then web)
  rather than one combined process tree, purely for sandbox process-lifetime
  reasons in this session — same assertions, same disposable-DB/no-real-data
  setup: exact-money ledger create + balance round-trip
  (`"123.4500"` preserved exactly), CORS header on `/health`, AI boundary
  (`enabled: false`, `authoritative: false`), default category seed present,
  Next.js production build + `next start`, PWA manifest/`sw.js`/`icon.svg`.
- Also exercised the two new TASK-032 endpoints end-to-end against the live
  server: `GET /assets/metal-brands` returns the managed catalog (includes
  `SJC`, `RAW`), and `POST /assets/crypto` with an arbitrary coin
  (`coingecko_id: "ethereum"`, not BTC) persists and round-trips correctly.
- All checks passed.
