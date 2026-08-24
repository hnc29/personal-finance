# TASK-030 — Rebuild Category Management as a real parent/child tree

The user reports that the Category Management screen still renders all
categories as a flat list. This is incorrect because the domain already uses an
adjacency-list hierarchy through `parent_id`, with UI depth <= 3.

This task is specifically about the CATEGORY MANAGEMENT screen, not only the
transaction category picker.

Preserve all existing V1 correctness, TASK-025/026/027/028/029 behavior, exact
money, account, import, asset, pricing and runtime semantics.

No schema migration should be needed.

## 1. Diagnose the current management screen

Inspect:
- category API schema/response
- `parent_id`
- create/update API behavior
- current category management JSX
- existing `category-tree.ts` or equivalent helper
- default category i18n mapping

Confirm whether the API already returns `parent_id`. If yes, build the tree
client-side from the real data. Do not duplicate hierarchy state.

If the API accidentally strips `parent_id`, fix the read schema/API without a
migration and add a regression test.

## 2. Category management must show a real tree

Replace any flat list/table with a hierarchical tree.

Required visual structure:

Chi tiêu
  Ăn uống
    Đi chợ / Siêu thị
    Ăn ngoài
    Cà phê & Đồ uống
  Hóa đơn & Tiện ích
    Điện
    Nước
    Internet
  ...

Thu nhập
  Lương
  Thưởng
  Thu nhập kinh doanh
  ...

Requirements:
- parent/child/grandchild indentation is visible and consistent
- maximum 3 visible hierarchy levels
- each parent with children has a chevron/disclosure button at the START of row
- `aria-expanded`
- collapsed parent hides all descendants
- expand/collapse state is independent per node
- default root groups may start expanded
- selected/active row remains readable
- no flattened duplicate rendering
- no child rendered at root unless its parent is genuinely missing/orphaned
- if an orphan exists, show it in a clearly marked `Khác / Chưa phân loại`
  diagnostic group instead of pretending it is a root
- predefined categories render localized vi/en labels
- user-created category names stay exactly as entered
- icons remain visible and aligned by hierarchy level
- child count may be shown subtly but is optional

## 3. Expense and Income grouping

For default hierarchy:
- `Expenses` is displayed as `Chi tiêu`
- `Income` is displayed as `Thu nhập`

Category Management should make the two major trees visually distinct.

Preferred UX:
- segmented tabs or filter chips:
  - Tất cả
  - Chi tiêu
  - Thu nhập
- default `Tất cả` may show two separate root sections
- filtering must not flatten descendants
- a search result must preserve its ancestor path

Do not infer category type from translated labels. Use canonical root ancestry /
tree identity.

## 4. Search within management

Add a search input:
- `Tìm danh mục`
- accent/case-insensitive Vietnamese search
- matches localized label and canonical predefined label
- user-created names searchable as typed
- child match keeps ancestors visible
- non-matching sibling branches may be hidden
- search never destroys expand/collapse state when search is cleared

Reuse the tested category-tree search helper from transaction picker if
appropriate instead of creating competing logic.

## 5. Add category / Add child

Category management must support hierarchy-aware creation.

Each row:
- `+ Thêm danh mục con` for level 1 or level 2 nodes
- no add-child action at level 3

Top-level action:
- `+ Thêm danh mục`

Create form:
- Tên danh mục
- Nhóm cha / Parent
- optional icon if current UI supports it
- status/active if current API supports it

Parent selection requirements:
- show parent choices as hierarchy, not flat ambiguous names
- display breadcrumbs such as:
  `Chi tiêu › Ăn uống`
- prevent choosing itself while editing
- prevent choosing descendants while editing
- prevent cycles
- prevent depth > 3
- if adding through a row's `Thêm danh mục con`, preselect that parent

No schema migration.

## 6. Edit / move safely

When editing an existing category:
- name can be edited using current API
- parent can be changed only if resulting hierarchy remains valid
- cannot move a node under itself
- cannot move a node under one of its descendants
- cannot make resulting descendants exceed level 3
- moving a parent moves its subtree logically through parent relationship; do
  not rewrite unrelated children
- default/predefined categories may be protected from destructive rename/move if
  current app semantics require stable canonical names
- user-created categories remain fully manageable within safe constraints

If current backend update API does not enforce cycle/depth safety, add service
validation and API tests without schema migration.

## 7. Delete/deactivate behavior

Use existing domain semantics.

If categories are deactivated rather than deleted:
- show `Ẩn` / `Ngừng sử dụng`
- do not destroy categories referenced by transactions
- descendants must not silently become orphaned

If delete exists:
- reject unsafe delete when referenced or when children exist unless current
  service has an explicit safe strategy
- never cascade-delete financial events

Do not invent destructive behavior merely for UI convenience.

## 8. Tree helper as single source of truth

Create/reuse a pure typed helper module with functions such as:
- buildCategoryTree(categories)
- getCategoryDepth(id)
- getDescendantIds(id)
- filterCategoryTreeByRoot(...)
- searchCategoryTreePreserveAncestors(...)
- canMoveCategory(...)
- getParentOptions(...)

Tests/audit must prove:
- Expenses -> Food & Drinks -> Groceries yields depths 1,2,3
- Income -> Salary yields depths 1,2
- collapse hides descendants
- search Groceries keeps Expenses + Food & Drinks
- moving Food & Drinks under Groceries is rejected
- moving a level-2 parent with level-3 children under another level-2 parent is
  rejected because children would become level 4
- valid move remains allowed
- orphan handling is deterministic

## 9. UI visual quality

Category Management should match the refined finance-app design:
- clean card/surface
- compact tree rows
- equal row heights
- clear indentation
- subtle connector/indent guides allowed
- green accent for active controls
- original local icons
- responsive desktop/mobile
- no giant raw table
- no developer-style parent_id display in normal UI
- actions grouped neatly in row overflow/action buttons

## 10. i18n

Vietnamese required:
- Quản lý danh mục
- Tìm danh mục
- Tất cả
- Chi tiêu
- Thu nhập
- Thêm danh mục
- Thêm danh mục con
- Danh mục cha
- Không có danh mục cha
- Mở rộng
- Thu gọn
- Chỉnh sửa
- Ngừng sử dụng
- Khác / Chưa phân loại
- Không tìm thấy danh mục

English equivalents must also be complete.

## 11. Automated audit

Add:
`apps/web/scripts/task030-category-tree-audit.mjs`

Expose:
`npm run task030-category-tree-audit`

Audit should fail if:
- Category Management main rendering falls back to a flat `.map(categories)`
  without tree grouping
- parent_id is ignored
- disclosure buttons / aria-expanded are absent
- search helper is absent
- hierarchy-aware parent selection is absent
- add-child action is absent
- depth/cycle helper is absent

Do not weaken existing TASK-026/027/029/i18n audits.

## 12. Validation

Must pass:
- backend pytest
- Ruff
- mypy
- compileall
- Alembic one head unchanged from task start
- category API tests including parent_id
- category create/update hierarchy safety tests
- TASK-030 audit
- i18n audit
- previous task audits where present
- frontend lint/typecheck/build
- launcher disposable DB integration
- smoke-v1
- no orphan ports
- no package dependency-version changes
- no migration
- git diff --check

## 13. Safety

Follow CLAUDE.md.

Never:
- read/modify real `data/**`
- inspect .env/credentials/backups/real finance data
- add migration
- manually edit SQLite
- Base.metadata.create_all()
- change exact-money/ledger semantics
- add dependency upgrades
- run npm audit fix --force
- commit/push/reset/clean/rebase from Codex

Synthetic fixtures only.
Codex must not commit.
