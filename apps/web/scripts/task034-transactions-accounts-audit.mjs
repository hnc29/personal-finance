import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const api = readFileSync("lib/api.ts", "utf8");
const i18nSrc = readFileSync("lib/i18n.ts", "utf8");

// --- Transactions composer: exactly the 4 hand-entry-safe types are
// reachable (EXPENSE, INCOME, TRANSFER, CREDIT_CARD_PAYMENT). No advanced/
// "other transaction type" escape hatch may remain -- INTEREST/
// SAVINGS_DEPOSIT/SAVINGS_WITHDRAWAL are owned exclusively by the Savings
// module's own actions, and ASSET_PURCHASE/ASSET_SALE have no live
// producer anywhere in the app. ---
const composerMatch = page.match(/const composerEventTypes: EventType\[\] = \[([^\]]*)\];/);
assert.ok(composerMatch, "TASK-034: composerEventTypes allowlist not found in page.tsx");
const composerTypes = [...composerMatch[1].matchAll(/"([A-Z_]+)"/g)].map(m => m[1]);
assert.deepEqual(composerTypes, ["EXPENSE", "INCOME", "TRANSFER", "CREDIT_CARD_PAYMENT"], "TASK-034: composerEventTypes no longer exactly [EXPENSE, INCOME, TRANSFER, CREDIT_CARD_PAYMENT]");
assert.ok(!/advanced-type-select/.test(page), "TASK-034: the old advanced-type-select dropdown reappeared in Transactions()");
assert.ok(!/otherTransactionType/.test(page), "TASK-034: a reference to the removed 'other transaction type' escape hatch reappeared");

// --- Credit Card Payment: must be a dedicated guided fieldset, not a raw
// double-entry escape hatch -- a credit-card account select scoped to
// CREDIT_CARD accounts, a funding account select scoped to non-CREDIT_CARD
// accounts, and a payment amount input. The two selects must be backed by
// disjoint account-type filters so the balanced-pair backend validation
// (_validate_credit_card_payment: exactly one CREDIT_CARD account, its
// entry positive) can never be violated from the UI. ---
assert.ok(page.includes('type === "CREDIT_CARD_PAYMENT" ?'), "TASK-034: Transactions() has no dedicated CREDIT_CARD_PAYMENT branch");
assert.ok(page.includes('x.account_type === "CREDIT_CARD"') && page.includes("creditCardAccounts"), "TASK-034: no credit-card-account filter (account_type === CREDIT_CARD) for the card select");
assert.ok(page.includes('x.account_type !== "CREDIT_CARD"') && page.includes("fundingAccounts"), "TASK-034: no funding-account filter (account_type !== CREDIT_CARD) for the source select");
// TASK-036 replaced the plain <select name="cardAccount"/"fundingAccount">
// escape hatches with a tappable <AccountRow> popover (Moneylover-style
// row UI) bound to controlled `cardAccountId`/`fundingAccountId` state, so
// there is no longer a `name="..."` attribute for submit() to read via
// FormData -- the state variables themselves are the source of truth now.
assert.ok(page.includes('cardAccountId') && page.includes('fundingAccountId') && page.includes('paymentAmount'), "TASK-034: credit-card-payment fieldset is missing cardAccountId/fundingAccountId/paymentAmount state");
assert.ok(/<AccountRow label="Credit card" accounts=\{creditCardAccounts\} value=\{cardAccountId\}/.test(page), "TASK-034: no AccountRow scoped to creditCardAccounts for the card field");
assert.ok(/<AccountRow label="From account" accounts=\{fundingAccounts\} value=\{fundingAccountId\}/.test(page), "TASK-034: no AccountRow scoped to fundingAccounts for the funding field");
assert.ok(page.includes("No credit card accounts available. Create one first."), "TASK-034: no empty-state hint when there are zero credit card accounts");

// --- submit() must construct the correct balanced pair: source account
// debited (negative), credit card credited (positive) -- matching
// _validate_credit_card_payment's requirement that the card entry be
// positive (payment reduces debt). ---
assert.ok(/account_id: Number\(fundingAccountId\), amount: `-\$\{paymentAmount\}`/.test(page), "TASK-034: submit() no longer debits the funding account for CREDIT_CARD_PAYMENT");
assert.ok(/account_id: Number\(cardAccountId\), amount: paymentAmount/.test(page), "TASK-034: submit() no longer credits the card account with a positive amount for CREDIT_CARD_PAYMENT");

// --- Accounts page: creation must be gated behind a "+ Thêm tài khoản"
// button, not an always-visible inline form (mirrors the TASK-033 Savings
// pattern). A live balance (fetched from GET /accounts/{id}/balance, never
// stored) and an "Adjust balance" action must be shown per account. ---
assert.ok(page.includes('onClick={() => setFormTarget("new")}'), "TASK-034: no '+ Add account' trigger button wired to open the create dialog");
assert.ok(!/<form[^>]*onSubmit=\{submit\}[^>]*>[\s\S]{0,200}name="name"[\s\S]{0,400}<\/Section>/.test(page.slice(page.indexOf("function Accounts()"), page.indexOf("function AccountFormDialog"))), "TASK-034: an always-visible inline account-create form reappeared in Accounts()");
assert.ok(page.includes("<AccountFormDialog") && page.includes("<AccountAdjustForm"), "TASK-034: Accounts() no longer renders both AccountFormDialog and AccountAdjustForm");
assert.ok(page.includes("useAccountBalances"), "TASK-034: Accounts() no longer fetches live balances via useAccountBalances");
assert.ok(page.includes('onClick={() => setAdjusting(x)}'), "TASK-034: no 'Adjust balance' action wired per account");
assert.ok(api.includes("balance: (id: number)"), "TASK-034: lib/api.ts no longer exposes api.accounts.balance()");
assert.ok(!/AccountRead[\s\S]*balance/.test(api), "TASK-034: api.ts should not assume AccountRead carries a balance field -- balances come from the dedicated /accounts/{id}/balance endpoint only");

// --- Account balance adjustment: must post a single ADJUSTMENT entry equal
// to the exact signed difference between the entered target balance and
// the current derived balance, using exact-money (sumMoney/negateMoney)
// arithmetic -- never float subtraction. ---
assert.ok(page.includes('event_type: "ADJUSTMENT"'), "TASK-034: AccountAdjustForm no longer submits an ADJUSTMENT event");
assert.ok(page.includes("sumMoney([target, negateMoney(currentBalance)])"), "TASK-034: AccountAdjustForm no longer computes the delta via exact-money sumMoney/negateMoney helpers");
assert.ok(page.includes("isZeroMoney(delta)") && page.includes("No change to save."), "TASK-034: AccountAdjustForm no longer guards against submitting a zero-delta adjustment");
assert.ok(/entries: \[\{ account_id: account\.id, amount: delta \}\]/.test(page), "TASK-034: the ADJUSTMENT event no longer posts a single entry of exactly `delta` against the adjusted account");

// --- i18n coverage, extended to also catch Field/Submit/Empty/Modal prop
// strings (same pattern as TASK-033's audit -- these route through tr()
// *inside* those components and are invisible to a plain call-site regex).
// A key missing from viUi (even if present in enUi) renders literal
// `undefined` in the Vietnamese UI, which is worse than an English leak. ---
const enUiMatch = i18nSrc.match(/const enUi = \{([\s\S]*?)\} as const;/);
const viUiMatch = i18nSrc.match(/const viUi: Record<string, string> = \{([\s\S]*?)\n\};/);
const extraMatch = i18nSrc.match(/const extra: Record<string, string> = \{([\s\S]*?)\};/);
assert.ok(enUiMatch && viUiMatch && extraMatch, "TASK-034: could not locate enUi/viUi/extra dictionaries in lib/i18n.ts");
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
  assert.ok(enUiKeys.has(key) || extraKeys.has(key), `TASK-034: "${key}" has no entry in enUi/extra`);
  assert.ok(viUiKeys.has(key) || extraKeys.has(key), `TASK-034: "${key}" has no entry in viUi/extra -- would render literal undefined in Vietnamese mode`);
}
assert.ok(callSites.size > 90, "TASK-034: i18n call-site scan (incl. Field/Submit/Empty/Modal props) found suspiciously few usages -- extraction regex likely broke");

console.log(`TASK-034 transactions/accounts UX audit passed (${callSites.size} i18n call/prop sites checked)`);
