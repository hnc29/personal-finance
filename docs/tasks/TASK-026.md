# TASK-026 — Money Lover-inspired transaction UX and category hierarchy

This task is based on direct user review of the current transaction screen.

Preserve all audited V1 financial correctness and the TASK-025 runtime/i18n
repairs. No schema migration and no dependency major upgrades.

Do not copy Money Lover proprietary logos, icon assets, screenshots, or source
code. The visual direction may be strongly inspired by its consumer-finance
layout, spacing, green accent, rounded controls, modal/card composition and
interaction patterns, but must remain an original implementation.

## 1. Hierarchical category picker: real 3-level tree

The current category selector is a flat native select. Replace it with an
accessible hierarchical category picker that visibly preserves the category tree
up to three levels.

Requirements:
- show parent/child hierarchy clearly with indentation and/or expandable groups
- three levels must remain visually distinguishable
- use the existing `parent_id` hierarchy from the API; do not flatten away the
  structure
- predefined category display names use the current vi/en localization mapping
- user-created category names remain exactly as entered
- show simple original category icons using emoji/CSS shapes or existing
  non-proprietary assets; do not add a new icon package unless already present
- keyboard accessible
- picker works on desktop and mobile
- avoid relying on nested `<optgroup>` because it cannot represent the required
  three-level interactive tree well
- a selected category should remain visibly selected when the picker is reopened

The roots `Expenses` / `Income` are grouping nodes. Prefer not to let the user
accidentally choose the wrong root when a more specific descendant is expected,
but preserve compatibility if current domain allows selecting a root.

## 2. Category list must correspond to transaction type

Do not show all categories for every transaction type.

Required behavior:
- `EXPENSE`: show only the `Expenses` subtree
- `INCOME`: show only the `Income` subtree
- `INTEREST`: show the `Income` subtree, with `Interest` available naturally
- `TRANSFER`: category hidden / not required
- `CREDIT_CARD_PAYMENT`: category hidden / not required
- `SAVINGS_DEPOSIT`: category hidden / not required
- `SAVINGS_WITHDRAWAL`: category hidden / not required
- `ASSET_PURCHASE`: category hidden / not required
- `ASSET_SALE`: category hidden / not required
- `ADJUSTMENT`: category optional; if the existing domain semantics require a
  category, allow both groups in a clearly optional picker, otherwise hide it

When transaction type changes:
- if current selected category does not belong to the newly valid subtree,
  clear it
- do not submit a hidden stale category
- `Salary` must never appear in the expense picker
- expense categories must never appear in the income picker

Add a small pure helper for classification/filtering so this behavior is not
buried in JSX.

## 3. Account selection must not break category selection

The user reported that after choosing an account, category behavior is wrong /
missing.

Acceptance:
- account selection and category selection are independent
- choosing or changing an account must never clear, hide, or corrupt a valid
  selected category
- selecting category then account preserves category
- selecting account then category works
- submitted financial event carries the selected category id exactly once at
  the event level, consistent with the existing API/domain
- do NOT invent a category field on ledger/account entries if the domain model
  does not have one
- add regression coverage around the frontend state/helper logic where practical

## 4. Vietnamese wording changes requested by user

UI-only terminology:
- replace visible `Bút toán` wording with `Giao dịch` wording
- `Bút toán tài khoản` -> `Tài khoản giao dịch`
- `Thêm bút toán` -> `Thêm dòng giao dịch` (or a similarly natural phrase)
- table header/labels should not use `BÚT TOÁN`
- internal API/model field name `entries` remains unchanged

Amount label:
- `Số tiền có dấu` -> `Số tiền`
- keep the existing exact-money sign semantics internally
- helper text may explain positive/negative semantics only when needed, but do
  not put “có dấu” in the field label

All Vietnamese application-owned UI remains Vietnamese.

## 5. Progressive "Thêm chi tiết"

The following fields should be hidden by default:
- Người nhận
- Chuyến đi / sự kiện
- Ghi chú

Replace their always-visible row with a compact secondary action:
`+ Thêm chi tiết`

Behavior:
- clicking it reveals those fields with a smooth/simple CSS transition or
  immediate accessible expansion
- button changes appropriately to `Ẩn chi tiết` when open
- if editing/re-rendering a form that already contains any of those values,
  details should start expanded so data is never hidden unexpectedly
- collapsing details must NOT erase already typed values
- no data loss on expand/collapse
- English mode has equivalent natural labels

## 6. Money Lover-inspired original visual redesign

Use the attached reference conceptually, but do not copy proprietary assets.

Transaction composer should feel like a modern consumer-finance app:
- soft neutral page background
- centered transaction card / modal-like panel on desktop
- strong green primary action/accent inspired by finance apps
- rounded corners (card, segmented controls, buttons, picker rows)
- subtle borders/shadows
- compact typography hierarchy
- generous but efficient spacing
- segmented transaction-type control at top
- account row presented like a tappable/selectable finance account row
- amount is visually prominent
- category row is prominent with icon + selected category + disclosure affordance
- clear green primary `Lưu giao dịch` / `Ghi giao dịch` button
- secondary actions use light neutral pills/buttons
- responsive: modal/card on desktop, near-full-width sheet/card on mobile
- preserve existing bottom navigation/mobile behavior if already present
- use original CSS/emoji/simple SVG drawn in repository if needed
- no Money Lover logo, no copied icons, no pixel-perfect screenshot clone
- no new runtime dependency solely for visuals

If the current page has a large raw developer-style form, reduce that visual
density. The main transaction entry flow should prioritize:
1. type
2. account
3. amount
4. category when applicable
5. save
6. optional details

Advanced/internal semantics can remain available without dominating the UI.

## 7. Entry rows / multiple-account transactions

The existing exact-money ledger supports multiple entries for transfers and
other multi-account events. Preserve it.

UX:
- for simple EXPENSE/INCOME, one primary account row is enough initially
- if multiple entries are allowed/needed, reveal additional account rows with
  `Thêm dòng giao dịch`
- TRANSFER should naturally expose two account rows
- do not break balancing/validation rules
- do not silently auto-create incorrect balancing entries
- preserve all existing server-side validation

## 8. Default categories and API regression

Do not regress TASK-025 category merge/runtime fixes.

On a disposable DB:
- migrate
- merge defaults
- `/api/v1/categories` returns full hierarchy
- parent_id relationships for Expenses/Food & Drinks/Groceries and
  Income/Salary are correct
- count remains meaningful (>= 20)

No real finance DB must be touched by Codex/tests.

## 9. i18n regression

The existing i18n audit must keep passing.

Add/update tests/audit markers for these exact Vietnamese labels:
- Tài khoản giao dịch
- Thêm dòng giao dịch
- Số tiền
- Thêm chi tiết
- Ẩn chi tiết
- Chọn danh mục
- Lưu giao dịch or Ghi giao dịch

And ensure forbidden old UI literals do not appear in rendering source:
- Bút toán tài khoản
- Thêm bút toán
- Số tiền có dấu

## 10. Validation

Must pass:
- backend pytest
- Ruff
- mypy
- compileall
- one Alembic head = `0013_portfolio_snapshots`
- frontend i18n audit
- frontend lint/typecheck/build
- category hierarchy/filter helper acceptance checks
- disposable DB API hierarchy check
- TASK-025 build contract
- daily launcher disposable DB integration
- smoke-v1
- no orphan 8000/3000/18000/13000 listeners
- no synthetic portfolio regression
- no migration
- no package dependency change
- git diff --check

## 11. Safety

Follow CLAUDE.md.

Never:
- read/modify real `data/**` during implementation/testing
- inspect `.env`, credentials, API keys, backups, statements/imports/exports
- use real finance data in tests/logs
- add a migration
- use Base.metadata.create_all()
- change exact-money semantics
- use float/silent money rounding
- upgrade dependencies
- run npm audit fix --force
- add network-dependent tests
- commit/push/reset/clean/rebase from Codex

Codex must not commit. Host runner validates and commits only after PASS.
