import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- TASK-042: "chi tiết giao dịch sẽ hiển thị theo đúng danh mục chi
// tiêu ở level nhỏ nhất ví dụ ăn sáng (trong level ăn uống) tương đương
// với trường thông tin nhóm trong file dữ liệu moneylover; thiết kế thêm
// tính năng xem chi tiết, chỉnh sửa, xoá giao dịch" -- locks in: (1) the
// transaction details modal shows category as a full root-to-leaf
// breadcrumb via categoryPath(), (2) view/edit/delete exist and are
// scoped to composerEventTypes only, (3) the backend enforces that same
// scope server-side (EDITABLE_EVENT_TYPES), not just via hidden buttons,
// (4) the delete-orphan cascade that makes deleting an event's entries
// safe under real SQLite FK enforcement. ---

const page = readFileSync("app/page.tsx", "utf8");

// --- categoryPath is used (not just the bare leaf name) in the detail
// modal, satisfying "ở level nhỏ nhất... trong level ăn uống". ---
const categoryTree = readFileSync("lib/category-tree.ts", "utf8");
assert.ok(/export function categoryPath\(/.test(categoryTree), "TASK-042: category-tree.ts is missing the categoryPath() breadcrumb helper");
assert.ok(
  /categoryPath\(category, categories, n => categoryLabel\(language, n\)\)/.test(page),
  "TASK-042: TransactionDetailModal no longer renders the category as a full breadcrumb via categoryPath()"
);

// --- The detail modal component exists, is reachable by clicking a row,
// and only offers Edit/Delete for composerEventTypes (everything else
// stays read-only with an explanatory note). ---
const modalMatch = page.match(/function TransactionDetailModal\([\s\S]*?\n\}\n/);
assert.ok(modalMatch, "TASK-042: could not locate TransactionDetailModal in app/page.tsx");
const modal = modalMatch[0];
assert.ok(/const editable = composerEventTypes\.includes\(event\.event_type\)/.test(modal), "TASK-042: the detail modal no longer scopes Edit/Delete to composerEventTypes");
assert.ok(/This transaction type is managed on its own page and can't be edited or deleted here\./.test(modal), "TASK-042: the read-only note for non-editable event types is missing");
assert.ok(/onClick=\{\(\) => setDetailEvent\(x\)\}/.test(page), "TASK-042: clicking a transaction row no longer opens the details modal");
assert.ok(/row-clickable/.test(page) && /\.row\.row-clickable \{ cursor:pointer \}/.test(readFileSync("app/styles.css", "utf8")), "TASK-042: the clickable-row affordance (CSS) is missing");

// --- Delete requires a two-step confirm (never a bare click-to-delete on
// a financial record) and actually calls the API. ---
assert.ok(/setConfirmingDelete\(true\)/.test(modal) && /!confirmingDelete/.test(modal), "TASK-042: delete no longer requires a two-step confirm (setConfirmingDelete(true) + a !confirmingDelete branch)");
assert.ok(/mutationFn: \(\) => api\.events\.remove\(event\.id\)/.test(modal), "TASK-042: the delete button no longer calls api.events.remove");

// --- Edit reuses the composer (startEdit/cancelEdit), not a second form,
// and the composer's amount/account/category checks from TASK-041 still
// apply unchanged in edit mode (submit() isn't duplicated per-mode). ---
assert.ok(/function startEdit\(event: FinancialEvent\)/.test(page), "TASK-042: startEdit() is missing");
assert.ok(/function cancelEdit\(\)/.test(page), "TASK-042: cancelEdit() is missing");
assert.ok(
  /mutationFn: \(input: EventInput\) => editingEvent \? api\.events\.update\(editingEvent\.id, input\) : api\.events\.create\(input\)/.test(page),
  "TASK-042: submit's mutation no longer branches between create and update based on editingEvent"
);
assert.ok(/key=\{editingEvent \? `edit-\$\{editingEvent\.id\}` : "new"\}/.test(page), "TASK-042: the composer form no longer remounts on editingEvent change (payee/trip/note defaultValue would go stale)");

// --- i18n coverage for the new UI strings. ---
const i18n = readFileSync("lib/i18n.ts", "utf8");
for (const [en, vi] of [
  ["Delete", "Xoá"],
  ["Confirm delete", "Xác nhận xoá"],
  ["Deleting...", "Đang xoá..."],
  ["Transaction details", "Chi tiết giao dịch"],
  ["Editing transaction", "Đang sửa giao dịch"],
]) {
  assert.ok(new RegExp(`"${en}":"${en}"`).test(i18n), `TASK-042: enUi is missing a "${en}" entry`);
  assert.ok(i18n.includes(`"${en}":"${vi}"`), `TASK-042: viUi is missing the "${en}" -> "${vi}" translation`);
}

// --- Backend: the editable-type boundary is enforced server-side, not
// only by the frontend hiding buttons (a client is not a trust boundary).
const ledgerService = readFileSync("../api/app/services/ledger.py", "utf8");
assert.ok(/EDITABLE_EVENT_TYPES = frozenset\(/.test(ledgerService), "TASK-042: ledger.py is missing EDITABLE_EVENT_TYPES");
assert.ok(/class ProtectedEventTypeError\(Exception\)/.test(ledgerService), "TASK-042: ledger.py is missing ProtectedEventTypeError");
assert.ok(
  /def update_financial_event\(/.test(ledgerService) && /raise ProtectedEventTypeError\(event\.event_type\)/.test(ledgerService),
  "TASK-042: update_financial_event no longer enforces EDITABLE_EVENT_TYPES"
);
assert.ok(/def delete_financial_event\(/.test(ledgerService), "TASK-042: delete_financial_event is missing from ledger.py");

// --- The FK-safe delete-orphan cascade the whole delete feature depends
// on under real SQLite (PRAGMA foreign_keys=ON): without it, deleting a
// FinancialEvent while its AccountEntry rows still reference it fails the
// foreign-key check. ---
const ledgerModel = readFileSync("../api/app/models/ledger.py", "utf8");
assert.ok(/cascade="all, delete-orphan"/.test(ledgerModel), "TASK-042: FinancialEvent.entries is missing the delete-orphan cascade the delete feature relies on");

// --- The PATCH/DELETE routes exist and map ProtectedEventTypeError to 409. ---
const apiRoutes = readFileSync("../api/app/api/financial_events.py", "utf8");
assert.ok(/@router\.patch\("\/\{event_id\}", response_model=FinancialEventRead\)/.test(apiRoutes), "TASK-042: PATCH /financial-events/{event_id} route is missing");
assert.ok(/@router\.delete\("\/\{event_id\}", response_model=DeletedEventRead\)/.test(apiRoutes), "TASK-042: DELETE /financial-events/{event_id} route is missing");
assert.ok(/status_code=status\.HTTP_409_CONFLICT/.test(apiRoutes), "TASK-042: ProtectedEventTypeError is no longer mapped to 409");

// --- CORS must allow DELETE, or the browser's preflight blocks the new
// delete endpoint outright (same class of bug as TASK-038's missing
// X-Filename header -- caught live by the smoke test before this line
// existed, so it's locked in here to prevent a silent regression). ---
const mainPy = readFileSync("../api/app/main.py", "utf8");
assert.ok(/allow_methods=\["GET", "POST", "PATCH", "DELETE", "OPTIONS"\]/.test(mainPy), "TASK-042: CORS allow_methods no longer includes DELETE -- the delete button would silently fail with a CORS preflight error");

console.log("TASK-042 transaction detail/edit/delete audit passed (breadcrumb category display, view/edit/delete scoped to composerEventTypes both client- and server-side, delete-orphan cascade, CORS DELETE, i18n covered)");
