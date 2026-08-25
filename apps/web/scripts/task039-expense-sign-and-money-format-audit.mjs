import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- TASK-039: two bugs reported together.
//
// (1) "nhập chi tiêu từ ví zalopay thì số tiền không bị trừ đi mà cộng
// thêm" -- recording an EXPENSE from the single-entry composer added to
// the account balance instead of subtracting. Root cause: the ledger
// service (apps/api/app/services/ledger.py) trusts the caller's signed
// amount as-is and never flips signs itself -- by design, the same way
// TRANSFER/CREDIT_CARD_PAYMENT already negate one side client-side before
// submitting. The single-entry EXPENSE/INCOME path never did that: it sent
// whatever unsigned magnitude the user typed straight through, so an
// EXPENSE landed as a positive entry (added) instead of negative
// (subtracted). Fixed by making the Expense/Income segmented control the
// sole source of sign in Transactions' submit().
//
// (2) "tiền việt nam không có phần lẻ, hãy bỏ phần .0000 đi" -- every money
// amount from the API is a fixed-point Decimal string with exactly 4
// decimal places (apps/api/app/core/money.py), so a plain whole amount
// like 50000 always serialises as "50000.0000" and was shown to the user
// with that literal suffix everywhere. Fixed with a shared fmtMoney()
// helper (built on the existing exact-BigInt sumMoney(), not float
// parsing) applied at every money-display call site. ---

const page = readFileSync("app/page.tsx", "utf8");

// --- (1) sign fix: submit() must force EXPENSE negative / INCOME positive
// via the type toggle, not trust whatever the user typed. ---
// Several components declare their own local submit() -- anchor on the one
// containing the TRANSFER pair-account check, which is unique to
// Transactions' submit().
const submitMatch = page.match(/function submit\(e: FormEvent<HTMLFormElement>\) \{[\s\S]*?Choose two different accounts[\s\S]*?\n  \}/);
assert.ok(submitMatch, "TASK-039: could not locate Transactions' submit() in app/page.tsx");
const submitFn = submitMatch[0];
assert.ok(
  /type === "EXPENSE" \? negateMoney\(magnitude\) : magnitude/.test(submitFn),
  "TASK-039: single-entry EXPENSE no longer forces a negative signed amount via negateMoney() -- expenses will add to the balance again"
);
assert.ok(
  /const magnitude = entry\.amount\.trim\(\)\.replace\(\/\^-\/, ""\)/.test(submitFn),
  "TASK-039: single-entry submit no longer strips a user-typed sign before applying the type-derived sign -- a manually typed '-' could double-negate"
);
assert.ok(
  !/entries\.map\(entry => \(\{ account_id: Number\(entry\.accountId\), amount: entry\.amount \}\)\)/.test(submitFn),
  "TASK-039: submit() regressed back to sending the raw unsigned entry.amount for EXPENSE/INCOME"
);

// --- The single-entry amount input must no longer accept a leading "-"
// (sign is now determined entirely by the Expense/Income toggle). ---
assert.ok(
  /const moneyPattern = "\^\\\\d\+\(\\\\\.\\\\d\{1,4\}\)\?\$";/.test(page),
  'TASK-039: moneyPattern regained an optional leading "-?" -- reintroduces ambiguity now that sign comes from the type toggle'
);

// --- (2) fmtMoney must exist and be applied at every known raw
// money-display call site (not just defined and unused). ---
assert.ok(/function fmtMoney\(value: string \| null \| undefined\)/.test(page), "TASK-039: fmtMoney() helper is missing");
const fmtMoneySites = [
  'fmtMoney(row.principal)} {row.currency}</p>',
  '<dd>{fmtMoney(row.principal)} {row.currency}</dd>',
  '<dd>{fmtMoney(term.expected_interest)}</dd>',
  '<span>{fmtMoney(t.principal)} {row.currency}</span>',
  'tr("Actual interest received")}: {fmtMoney(t.actual_interest)}',
  'fmtMoney(p.net_worth) ?? tr("Valuation incomplete")',
  'fmtMoney(p.invested_assets) ?? tr("Valuation incomplete")',
  'fmtMoney(row.value) ?? tr("Valuation unavailable")',
  'fmtMoney(balances.balances.get(x.id)) ?? (balances.isPending',
  'fmtMoney(currentBalance)',
  'fmtMoney(e.amount)',
];
for (const site of fmtMoneySites) {
  assert.ok(page.includes(site), `TASK-039: expected money-display call site missing fmtMoney(): ${JSON.stringify(site)}`);
}

// --- fmtMoney must reuse the existing exact BigInt-based sumMoney() for
// trimming -- never Number()/parseFloat(), which could silently
// misrepresent a large or precise money string. ---
const fmtMoneyMatch = page.match(/function fmtMoney\(value: string \| null \| undefined\)[\s\S]*?\n\}/);
assert.ok(fmtMoneyMatch, "TASK-039: could not locate fmtMoney() body");
assert.ok(/return sumMoney\(\[value\]\)/.test(fmtMoneyMatch[0]), "TASK-039: fmtMoney() no longer delegates to sumMoney() for exact trimming");
assert.ok(!/Number\(|parseFloat\(/.test(fmtMoneyMatch[0]), "TASK-039: fmtMoney() must not parse money as a float");

console.log(`TASK-039 audit passed (EXPENSE/INCOME sign forced by type toggle, ${fmtMoneySites.length} money-display sites trimmed via exact fmtMoney())`);
