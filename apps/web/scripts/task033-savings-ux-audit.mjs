import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const api = readFileSync("lib/api.ts", "utf8");
const i18nSrc = readFileSync("lib/i18n.ts", "utf8");

// --- BA spec (TASK-033) §5.1: savings gets its own tab, distinct from
// metals/crypto, and is never mixed into a single generic asset form. ---
assert.ok(/\[\["savings","Savings"\]/.test(page), "TASK-033: Assets() no longer has a distinct 'savings' tab");
assert.ok(page.includes("<SavingsPanel"), "TASK-033: Assets() no longer renders <SavingsPanel> for the savings tab");

// --- §5.1: no permanently-visible inline creation form on the Assets page.
// Creation must be gated behind a modal/dialog triggered by an explicit
// "+ Thêm sổ tiết kiệm" action, not always rendered. ---
assert.ok(!/asset-form.*onSubmit=\{e => submit\(e, "savings"\)\}/.test(page), "TASK-033: the old always-visible inline savings form reappeared in Assets()");
assert.ok(page.includes('+ {tr("Add savings account")}'), "TASK-033: no '+ Thêm sổ tiết kiệm' trigger button found");
assert.ok(page.includes("createOpen &&") && page.includes("<SavingsCreateForm"), "TASK-033: the create form is not gated behind dialog-open state");
assert.ok(page.includes("<Modal title="), "TASK-033: no reusable <Modal> primitive is used for savings dialogs");

// --- §5.2: the create form must collect every BA-mandated field (grouped
// A/B/C/D). Assert each field name/control is present in SavingsCreateForm. ---
const createFormStart = page.indexOf("function SavingsCreateForm");
const createFormEnd = page.indexOf("\nfunction SavingsDetailDialog");
const createForm = page.slice(createFormStart, createFormEnd);
for (const field of [
  'name="institution"', 'name="name"', 'name="principal"', 'name="funding_account_id"',
  'name="opened_date"', 'name="term_months"', 'name="annual_rate"', 'name="maturity_action"',
]) {
  assert.ok(createForm.includes(field), `TASK-033: SavingsCreateForm is missing required field ${field}`);
}
assert.ok(/previewMaturity/.test(createForm), "TASK-033: SavingsCreateForm does not compute/display a maturity date preview");

// --- §18.1/§19: the list must show principal, status, and maturity per
// BA spec's card mockup; the detail view must expose the full field set. ---
assert.ok(page.includes("savingsStatusText") && page.includes("savings-card-principal"), "TASK-033: savings card no longer renders principal + a derived status badge");
assert.ok(page.includes("row.current_term.maturity_date"), "TASK-033: savings card no longer renders the term's maturity date");

// --- §4: status vocabulary -- Còn hạn / Sắp đáo hạn / Đã đáo hạn / Đã tất
// toán / Tất toán trước hạn must all be reachable, not just a subset. ---
for (const status of ["Ongoing", "Maturing soon", "Matured", "Settled", "Settled early"]) {
  assert.ok(page.includes(`"${status}"`), `TASK-033: savingsStatusText() is missing the "${status}" status branch`);
}

// --- §11/§12/§13/§14: settlement and renewal actions must all be wired to
// dedicated dialogs, not collapsed into a single generic action. ---
for (const marker of ["SavingsCloseForm", "SavingsRenewForm", "SavingsEditForm"]) {
  assert.ok(page.includes(`function ${marker}`), `TASK-033: missing dedicated component ${marker}`);
}
assert.ok(page.includes('kind === "close"') && page.includes('kind === "early-close"'), "TASK-033: SavingsCloseForm no longer distinguishes normal vs early close");

// --- §15: partial withdrawal must not be exposed as a UI action in V1. ---
assert.ok(!/Rút một phần|Partial withdraw/i.test(page), "TASK-033: a partial-withdrawal UI action leaked into page.tsx despite being out of V1 scope");

// --- §16: edit must be gated by the backend's `editable` flag (sole term,
// still ACTIVE), never unconditionally offered. ---
assert.ok(page.includes("row.editable &&") || page.includes("row.editable && "), "TASK-033: the Edit action is not gated behind the account's `editable` flag");

// --- Net Worth correctness surface: the create flow must always require a
// funding (source) account -- this is what makes SAVINGS_DEPOSIT fire. ---
assert.ok(/funding_account_id:\s*Number\(v\("funding_account_id"\)\)/.test(page), "TASK-033: SavingsCreateForm no longer sends a required funding_account_id");

// --- lib/api.ts: the client must cover the full lifecycle surface, not
// just list/create. ---
for (const method of ["get:", "create:", "update:", "close:", "earlyClose:", "renew:"]) {
  assert.ok(api.includes(method), `TASK-033: api.assets.savings is missing the ${method.replace(":", "")} method`);
}

// --- i18n coverage, extended to also catch Field/Submit/Empty/Modal prop
// strings (which route through tr() *inside* those components and are
// therefore invisible to a plain tr()/ui() call-site regex). A key missing
// from viUi (even if present in enUi) renders literal `undefined` in the
// Vietnamese UI, which is worse than an English leak, so both dictionaries
// are checked here. ---
const enUiMatch = i18nSrc.match(/const enUi = \{([\s\S]*?)\} as const;/);
const viUiMatch = i18nSrc.match(/const viUi: Record<string, string> = \{([\s\S]*?)\n\};/);
const extraMatch = i18nSrc.match(/const extra: Record<string, string> = \{([\s\S]*?)\};/);
assert.ok(enUiMatch && viUiMatch && extraMatch, "TASK-033: could not locate enUi/viUi/extra dictionaries in lib/i18n.ts");
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
]);
for (const key of callSites) {
  assert.ok(enUiKeys.has(key) || extraKeys.has(key), `TASK-033: "${key}" has no entry in enUi/extra`);
  assert.ok(viUiKeys.has(key) || extraKeys.has(key), `TASK-033: "${key}" has no entry in viUi/extra -- would render literal undefined in Vietnamese mode`);
}
assert.ok(callSites.size > 100, "TASK-033: i18n call-site scan (incl. Field/Submit/Empty/Modal props) found suspiciously few usages -- extraction regex likely broke");

console.log(`TASK-033 savings UX audit passed (${callSites.size} i18n call/prop sites checked)`);
