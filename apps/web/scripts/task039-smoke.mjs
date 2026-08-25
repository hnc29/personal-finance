import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("pageerror", err => consoleErrors.push(`pageerror: ${err.message}`));
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`); });

await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });

// Confirm the seeded starting balance shows WITHOUT a trailing .0000 on the
// Accounts page (500000.0000 was seeded directly via the API).
await page.getByRole("button", { name: /^tài khoản$/i }).click();
await page.locator(".account-balance strong").first().waitFor({ timeout: 10000 });
const balanceBefore = await page.locator(".account-balance strong").first().textContent();
console.log("BALANCE_BEFORE:", balanceBefore);

// Record an EXPENSE of 150000 from the ZaloPay account -- exactly the
// reported scenario ("nhập chi tiêu từ ví zalopay").
await page.getByRole("button", { name: /^giao dịch$/i }).click();
await page.getByText("Chọn tài khoản").waitFor();
await page.getByText("Chọn tài khoản").click();
await page.getByRole("option", { name: /zalopay/i }).click();
await page.locator(".amount-input").fill("150000");
await page.getByRole("button", { name: "Ghi giao dịch" }).click();

// Wait for the new row to appear in the transactions table. Events list
// oldest-first (ordered by id), so the just-recorded EXPENSE is the LAST
// data row, after the seeded ADJUSTMENT.
await page.waitForFunction(() => document.querySelectorAll(".table .row").length > 1, { timeout: 10000 });
const entryText = await page.locator(".table .row .entry b").last().textContent();
console.log("ENTRY_DISPLAY:", entryText);

// Go back to Accounts and check the balance actually decreased.
await page.getByRole("button", { name: /^tài khoản$/i }).click();
await page.waitForTimeout(500);
const balanceAfter = await page.locator(".account-balance strong").first().textContent();
console.log("BALANCE_AFTER:", balanceAfter);

console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors));
await browser.close();

const failures = [];
if (balanceBefore !== "500000") failures.push(`expected seeded balance to display as "500000" (no .0000), got ${JSON.stringify(balanceBefore)}`);
if (entryText !== "-150000") failures.push(`expected the recorded EXPENSE entry to display as "-150000", got ${JSON.stringify(entryText)}`);
if (balanceAfter !== "350000") failures.push(`expected balance after a 150000 EXPENSE to be "350000" (500000 - 150000), got ${JSON.stringify(balanceAfter)} -- if this is "650000" the sign bug is back (expense added instead of subtracted)`);

if (failures.length) {
  console.error("FAIL:\n" + failures.map(f => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("TASK-039 smoke test PASSED: EXPENSE from ZaloPay correctly subtracted, and all displayed amounts are free of trailing .0000.");
