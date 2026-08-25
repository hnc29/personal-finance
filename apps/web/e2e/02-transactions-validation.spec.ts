import { test, expect } from "@playwright/test";
import { goToTab, VI, errorAlert } from "./helpers";

// E2E flow #12 (empty-data state) + #13 (validation). Runs before any
// transaction CRUD spec creates rows, relying on finance.test.db starting
// with 0 financial_events (see docs/qa/QA_STATE.md).
test.describe.serial("transactions: empty state and validation", () => {
  test("shows empty state when there are no transactions yet", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await expect(page.getByText(VI.noTransactions)).toBeVisible();
  });

  test("rejects an EXPENSE submit with no account selected", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    // Composer defaults to EXPENSE; amount is required by the input's
    // `required` attribute, so fill it to isolate the account check.
    await page.locator(".amount-input").fill("10000");
    await page.locator(".event-form.composer button.primary").click();
    await expect(errorAlert(page)).toHaveText(VI.chooseAccount);
  });

  test("blocks an EXPENSE submit with no amount entered", async ({ page, request }) => {
    // The amount input carries HTML `required` + `pattern` (see
    // page.tsx's moneyPattern), so the browser's own constraint validation
    // blocks the form's submit event before React's onSubmit -- and
    // therefore the app's own "Vui lòng nhập số tiền" JS check -- ever
    // runs. That JS check is unreachable through a real empty submit; what
    // matters here is that no transaction gets created either way.
    const before = await (await request.get("http://127.0.0.1:8010/api/v1/financial-events")).json();
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await page.getByRole("button", { name: VI.selectAccount }).click();
    await page.getByRole("option", { name: "E2E Cash" }).click();
    await page.locator(".event-form.composer button.primary").click();
    await page.waitForTimeout(300);
    const after = await (await request.get("http://127.0.0.1:8010/api/v1/financial-events")).json();
    expect(after.length).toBe(before.length);
  });

  test("rejects a TRANSFER with the same source and destination account", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await page.getByRole("group", { name: VI.type }).getByRole("button", { name: VI.transfer }).click();
    await page.getByRole("button", { name: VI.fromAccount }).click();
    await page.getByRole("option", { name: "E2E Cash" }).click();
    await page.getByRole("button", { name: VI.toAccount }).click();
    await page.getByRole("option", { name: "E2E Cash" }).click();
    await page.locator(".amount-row .amount-input").fill("5000");
    await page.locator(".event-form.composer button.primary").click();
    await expect(errorAlert(page)).toHaveText(VI.chooseTwoAccounts);
  });
});
