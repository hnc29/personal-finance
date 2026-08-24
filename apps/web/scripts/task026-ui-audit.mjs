import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const helperPath = new URL("../lib/category-tree.ts", import.meta.url);
const helperSource = readFileSync(helperPath, "utf8");
const compiledHelper = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compiledHelper).toString("base64")}`);

const categories = [
  { id: 1, name: "Expenses", parent_id: null, is_active: true },
  { id: 2, name: "Food & Drinks", parent_id: 1, is_active: true },
  { id: 3, name: "Groceries", parent_id: 2, is_active: true },
  { id: 4, name: "Income", parent_id: null, is_active: true },
  { id: 5, name: "Salary", parent_id: 4, is_active: true },
  { id: 6, name: "Interest", parent_id: 4, is_active: true },
];

const namesFor = (type) => helpers.categoriesForEventType(type, categories).map((category) => category.name);
assert.deepEqual(namesFor("EXPENSE"), ["Expenses", "Food & Drinks", "Groceries"]);
assert.deepEqual(namesFor("INCOME"), ["Income", "Salary", "Interest"]);
assert.deepEqual(namesFor("INTEREST"), ["Income", "Salary", "Interest"]);
assert.deepEqual(namesFor("ADJUSTMENT"), categories.map((category) => category.name));
for (const type of ["TRANSFER", "CREDIT_CARD_PAYMENT", "SAVINGS_DEPOSIT", "SAVINGS_WITHDRAWAL", "ASSET_PURCHASE", "ASSET_SALE"]) {
  assert.deepEqual(namesFor(type), [], `${type} must not expose a category picker`);
}
assert.equal(helpers.categoryDepth(categories[0], categories), 0);
assert.equal(helpers.categoryDepth(categories[1], categories), 1);
assert.equal(helpers.categoryDepth(categories[2], categories), 2);
assert.equal(helpers.categoryIsValidForEventType("EXPENSE", "3", categories), true);
assert.equal(helpers.categoryIsValidForEventType("EXPENSE", "5", categories), false);
assert.equal(helpers.categoryIsValidForEventType("INCOME", "3", categories), false);
assert.equal(helpers.categoryIsValidForEventType("TRANSFER", "5", categories), false);

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
for (const marker of [
  "categoryIsValidForEventType(next, categoryId",
  "categoryIsValidForEventType(type, categoryId",
  'role="tree"',
  'role="treeitem"',
  "aria-selected",
  "setDetailsOpen(open => !open)",
]) {
  assert.ok(page.includes(marker), `Missing TASK-026 UI regression marker: ${marker}`);
}
for (const forbidden of ["Bút toán tài khoản", "Thêm bút toán", "Số tiền có dấu"]) {
  assert.ok(!page.includes(forbidden), `Forbidden old UI wording remains: ${forbidden}`);
}

console.log("TASK-026 hierarchy/filter/UI audit passed");
