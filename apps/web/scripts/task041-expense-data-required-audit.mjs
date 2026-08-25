import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- TASK-041: "ràng buộc dữ liệu cho việc nhập chi tiêu, phải đầy đủ số
// tiền, ngày tháng, loại chi tiêu" -- recording an EXPENSE/INCOME
// previously let account, amount, and category all go unset: an
// unselected account silently sent account_id: 0 (a foreign-key violation
// with no clean message, since AccountRow is a custom popover with no
// native "required" to lean on), and an unselected category silently
// saved as uncategorized with no warning. Date can't be missing --
// dateRow's onChange always falls back to today() -- so it needs no
// extra check. This audit locks in the new submit()-time validation and
// its inline error message for the EXPENSE/INCOME composer path. ---

const page = readFileSync("app/page.tsx", "utf8");
const txMatch = page.match(/function Transactions\(\) \{[\s\S]*?\n\}\n/);
assert.ok(txMatch, "TASK-041: could not locate Transactions() in app/page.tsx");
const tx = txMatch[0];

// --- The three new checks, gated to the EXPENSE/INCOME path only (a
// category can't even be picked for TRANSFER/CREDIT_CARD_PAYMENT -- see
// categoriesForEventType -- so requiring one there would be nonsensical).
assert.ok(
  /if \(type === "EXPENSE" \|\| type === "INCOME"\) \{/.test(tx),
  "TASK-041: submit() no longer scopes the new required-field checks to EXPENSE/INCOME"
);
assert.ok(
  /if \(!entries\[0\]\?\.accountId\) \{ setFormError\(tr\("Choose an account"\)\); return; \}/.test(tx),
  "TASK-041: submit() no longer requires an account to be selected for EXPENSE/INCOME"
);
assert.ok(
  /if \(!entries\[0\]\?\.amount\?\.trim\(\)\) \{ setFormError\(tr\("Enter an amount"\)\); return; \}/.test(tx),
  "TASK-041: submit() no longer requires a non-empty amount for EXPENSE/INCOME"
);
assert.ok(
  /if \(validCategories\.length > 0 && !categoryIsValidForEventType\(type, categoryId, categories\.data \?\? \[\]\)\) \{ setFormError\(tr\("Choose a category"\)\); return; \}/.test(tx),
  "TASK-041: submit() no longer requires a category for EXPENSE/INCOME"
);

// --- The category check must stay gated on validCategories.length > 0 --
// otherwise a user with every category deactivated could never record
// anything again (a hard deadlock), instead of just falling back to no
// category the way it always could before this task. ---
assert.ok(
  /validCategories\.length > 0 && !categoryIsValidForEventType/.test(tx),
  "TASK-041: the category requirement is no longer conditional on there being a category to pick -- would lock out users with no active categories"
);

// --- The error must actually render somewhere inside the EXPENSE/INCOME
// branch (previously only the TRANSFER/CREDIT_CARD_PAYMENT branches ever
// rendered this alert at all), and formError must be reset at the top of
// submit() so a stale error from a previous failed attempt doesn't linger
// after a later successful one. ---
const expenseBranchMatch = tx.match(/<\/> : <>[\s\S]*?<\/>\}/);
assert.ok(expenseBranchMatch, "TASK-041: could not locate the EXPENSE/INCOME composer branch");
assert.ok(
  /\{formError && <p className="error" role="alert">\{formError\}<\/p>\}/.test(expenseBranchMatch[0]),
  "TASK-041: the EXPENSE/INCOME branch no longer renders the validation error message"
);
assert.ok(/setFormError\(""\);\s*\n\s*const f = new FormData/.test(tx), "TASK-041: submit() no longer clears a stale formError at the start of each attempt");

// --- i18n coverage for the three new messages. ---
const i18n = readFileSync("lib/i18n.ts", "utf8");
for (const [en, vi] of [
  ["Choose an account", "Vui lòng chọn tài khoản"],
  ["Enter an amount", "Vui lòng nhập số tiền"],
  ["Choose a category", "Vui lòng chọn danh mục"],
]) {
  assert.ok(new RegExp(`"${en}":"${en}"`).test(i18n), `TASK-041: enUi is missing a "${en}" entry`);
  assert.ok(i18n.includes(`"${en}":"${vi}"`), `TASK-041: viUi is missing the "${en}" -> "${vi}" translation`);
}

// --- No leftover references to the old, narrower variable name (it was
// renamed to formError since the error now covers more than account
// pairing). ---
assert.ok(!/\bpairError\b/.test(page), "TASK-041: a stale pairError reference survives the rename to formError");

console.log("TASK-041 expense/income required-field audit passed (account + amount + category all required to record an EXPENSE/INCOME, category requirement stays gated on categories actually existing, i18n covered)");
