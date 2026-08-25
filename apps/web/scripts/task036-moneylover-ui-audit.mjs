import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- TASK-036: (1) restyle the Transactions composer as a Moneylover-style
// card of tappable rows (account / amount / category / note / date) while
// keeping exactly the same 4 hand-entry types from TASK-034/035; (2) let a
// category be assigned any icon from a broad library instead of only ever
// the name-inferred default. ---

const page = readFileSync("app/page.tsx", "utf8");
const iconsSrc = readFileSync("lib/category-icons.tsx", "utf8");
const api = readFileSync("lib/api.ts", "utf8");
const categoryModel = readFileSync("../api/app/models/category.py", "utf8");
const categorySchema = readFileSync("../api/app/schemas/category.py", "utf8");
const i18nSrc = readFileSync("lib/i18n.ts", "utf8");

// --- The composer must still expose exactly the 4 types TASK-034/035
// established -- this task only restyles the UI, it must not reopen the
// "other transaction type" escape hatch or drop a type. ---
const composerMatch = page.match(/const composerEventTypes: EventType\[\] = \[([^\]]*)\];/);
assert.ok(composerMatch, "TASK-036: composerEventTypes allowlist not found in page.tsx");
const composerTypes = [...composerMatch[1].matchAll(/"([A-Z_]+)"/g)].map(m => m[1]);
assert.deepEqual(composerTypes, ["EXPENSE", "INCOME", "TRANSFER", "CREDIT_CARD_PAYMENT"], "TASK-036: composerEventTypes no longer exactly [EXPENSE, INCOME, TRANSFER, CREDIT_CARD_PAYMENT]");

// --- Row-based composer: a tappable AccountRow (icon + name + chevron)
// replaces the old <select> for every account field, a big amount input
// with a currency badge, and a date row with prev/next steppers. ---
assert.ok(page.includes("function AccountRow("), "TASK-036: AccountRow component (tappable account picker row) not found");
assert.ok(/<AccountRow label="Select account" accounts=\{activeAccounts\} value=\{entries\[0\]\?\.accountId/.test(page), "TASK-036: the single-entry EXPENSE/INCOME account field is not wired to AccountRow");
assert.ok(/<AccountRow label="From account" accounts=\{activeAccounts\} value=\{transferFrom\}/.test(page) && /<AccountRow label="To account" accounts=\{activeAccounts\} value=\{transferTo\}/.test(page), "TASK-036: TRANSFER's from/to fields are not wired to AccountRow");
assert.ok(page.includes('className="amount-row"') && page.includes('className="currency-badge"') && page.includes('className="amount-input"'), "TASK-036: the big amount-row/currency-badge/amount-input markup is missing");
assert.ok(page.includes('className="date-row"') && page.includes("shiftIsoDate") && page.includes("formatIsoDateLabel"), "TASK-036: the date-row prev/next stepper is missing");
assert.ok(page.includes('className="note-row"'), "TASK-036: the always-visible note row is missing");
assert.ok(!/<Field label="Note"><input name="note" \/><\/Field>/.test(page), "TASK-036: Note reverted to a hidden '+ Add details' field instead of the always-visible note row");

// --- Category icon customization: Category.icon exists end-to-end
// (backend column + schema, frontend type, resolver that prefers the
// per-category override over the name-based default, and a picker UI). ---
assert.ok(/icon: Mapped\[str \| None\]/.test(categoryModel), "TASK-036: Category model has no nullable `icon` column");
assert.ok(/icon: str \| None = None/.test(categorySchema), "TASK-036: CategoryBase/CategoryUpdate schema has no `icon` field");
assert.ok(api.includes("icon: string | null"), "TASK-036: lib/api.ts Category/CategoryInput types don't carry `icon`");
assert.ok(iconsSrc.includes("export function resolveIconKey(") && /if \(category\.icon && ICON_REGISTRY\[category\.icon\]\) return category\.icon;/.test(iconsSrc), "TASK-036: resolveIconKey no longer prefers a category's own icon override over the name-based default");
assert.ok(page.includes("function IconPicker("), "TASK-036: IconPicker component (category icon picker UI) not found");
assert.ok(/<Field label="Icon"><IconPicker value=\{iconKey\}/.test(page), "TASK-036: the category edit form no longer wires up the Icon field");
assert.ok(/save\.mutate\(\{ id: editing\?\.id, name: [^,]+, parent_id: parentId, icon: iconKey \}\)/.test(page), "TASK-036: category submit() no longer includes the chosen icon in the save payload");

// --- Icon library breadth: every icon a category can be assigned must
// actually be reachable from the picker's grouped UI (no orphaned/
// unreachable registry entries) and have a bilingual label. ---
const registryMatch = iconsSrc.match(/const ICON_REGISTRY: Record<string, \(p: IconProps\) => React\.ReactElement> = \{([\s\S]*?)\n\};/);
assert.ok(registryMatch, "TASK-036: could not locate ICON_REGISTRY in lib/category-icons.tsx");
const registryKeys = new Set([...registryMatch[1].matchAll(/\b([A-Z][A-Za-z]*)\b/g)].map(m => m[1]));
const groupsMatch = iconsSrc.match(/export const ICON_GROUPS:[\s\S]*?= \[([\s\S]*?)\n\];/);
assert.ok(groupsMatch, "TASK-036: could not locate ICON_GROUPS in lib/category-icons.tsx");
const groupedKeys = new Set([...groupsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]));
const unreachable = [...registryKeys].filter(k => !groupedKeys.has(k));
assert.deepEqual(unreachable, [], `TASK-036: these icon-registry keys are never listed in any ICON_GROUPS entry, so the picker can never offer them: ${unreachable.join(", ")}`);
assert.ok(registryKeys.size >= 70, `TASK-036: icon library has suspiciously few icons (${registryKeys.size}) for a "browse a broad icon library" picker`);
const labelsMatch = iconsSrc.match(/const ICON_LABELS: Record<string, \{ en: string; vi: string \}> = \{([\s\S]*?)\n\};/);
assert.ok(labelsMatch, "TASK-036: could not locate ICON_LABELS in lib/category-icons.tsx");
const labeledKeys = new Set([...labelsMatch[1].matchAll(/\b([A-Z][A-Za-z]*): \{ en:/g)].map(m => m[1]));
const unlabeled = [...registryKeys].filter(k => !labeledKeys.has(k));
assert.deepEqual(unlabeled, [], `TASK-036: these icon-registry keys have no bilingual ICON_LABELS entry: ${unlabeled.join(", ")}`);

// --- i18n coverage, extended for this task's new literal call sites (same
// pattern as TASK-033/034/035's audits). ---
const enUiMatch = i18nSrc.match(/const enUi = \{([\s\S]*?)\} as const;/);
const viUiMatch = i18nSrc.match(/const viUi: Record<string, string> = \{([\s\S]*?)\n\};/);
const extraMatch = i18nSrc.match(/const extra: Record<string, string> = \{([\s\S]*?)\};/);
assert.ok(enUiMatch && viUiMatch && extraMatch, "TASK-036: could not locate enUi/viUi/extra dictionaries in lib/i18n.ts");
function literalKeysOf(body) {
  const keys = new Set();
  const re = /"((?:[^"\\]|\\.)*)"\s*:/g;
  let m;
  while ((m = re.exec(body))) keys.add(m[1].replace(/\\"/g, '"'));
  return keys;
}
const enUiKeys = literalKeysOf(enUiMatch[1]);
const viUiKeys = literalKeysOf(viUiMatch[1]);
const extraKeys = literalKeysOf(extraMatch[1]);
function literalCallsOf(source, pattern) {
  const keys = new Set();
  let m;
  while ((m = pattern.exec(source))) keys.add(m[1].replace(/\\"/g, '"'));
  return keys;
}
const callSites = new Set([
  ...literalCallsOf(page, /\btr\("((?:[^"\\]|\\.)*)"\)/g),
  ...literalCallsOf(page, /\bui\(language,\s*"((?:[^"\\]|\\.)*)"\)/g),
  ...literalCallsOf(page, /<Field label="((?:[^"\\]|\\.)*)"/g),
  ...literalCallsOf(page, /<Submit[^>]*\stext="((?:[^"\\]|\\.)*)"/g),
  ...literalCallsOf(page, /<Empty[^>]*\stext="((?:[^"\\]|\\.)*)"/g),
  ...literalCallsOf(page, /<Modal title="((?:[^"\\]|\\.)*)"/g),
  ...literalCallsOf(page, /<AccountRow label="((?:[^"\\]|\\.)*)"/g),
]);
for (const key of callSites) {
  assert.ok(enUiKeys.has(key) || extraKeys.has(key), `TASK-036: "${key}" has no entry in enUi/extra`);
  assert.ok(viUiKeys.has(key) || extraKeys.has(key), `TASK-036: "${key}" has no entry in viUi/extra -- would render literal undefined in Vietnamese mode`);
}
assert.ok(callSites.size > 90, "TASK-036: i18n call-site scan found suspiciously few usages -- extraction regex likely broke");

console.log(`TASK-036 Moneylover-style UI audit passed (${registryKeys.size} icons across ${[...groupsMatch[1].matchAll(/label: \{/g)].length} groups, ${callSites.size} i18n call/prop sites checked)`);
