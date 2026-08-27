import { test, expect } from "@playwright/test";
import { goToTab, VI } from "./helpers";

const API = "http://127.0.0.1:8010/api/v1";

// E2E coverage for the new "Sổ giao dịch" (Ledger) page (user request,
// 2026-08-26 UI redesign): account switcher defaulting to the first
// account, month tabs, opening/closing/net summary, day-grouped list,
// the right-side detail panel's Sửa (Edit) and Xóa (Delete)
// actions, and the floating "+ Thêm giao dịch" button. Runs after the
// other CRUD specs, so "E2E Cash" (account_id 1, seeded first -- see the
// same assumption in 09-responsive.spec.ts) remains the first account by
// sort_order regardless of accounts created by earlier spec files.
test.describe.serial("ledger: sổ giao dịch page", () => {
  test("defaults to the first account with a balance and this-month tab active", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Sổ giao dịch");
    await expect(page.getByRole("button", { name: "E2E Cash" })).toBeVisible();
    await expect(page.locator(".ledger-balance strong")).toBeVisible();
    await expect(page.locator(".ledger-months button.active")).toHaveText(VI.thisMonth);
  });

  test("adds a transaction via the floating button and sees it in the day-grouped list", async ({ page, request }) => {
    const before = await (await request.get(`${API}/financial-events`)).json();

    await page.goto("/");
    await goToTab(page, "Sổ giao dịch");
    await page.getByRole("button", { name: `+ ${VI.addTransaction}` }).click();
    const dialog = page.getByRole("dialog");
    // The composer defaults its account to whichever account the Ledger
    // page currently has selected ("E2E Cash"), so there's no account
    // picker step here unlike the Giao dịch page's blank composer.
    await dialog.locator(".amount-row .amount-input").fill("20000");
    await dialog.getByRole("button", { name: /Chọn danh mục/ }).click();
    await dialog.getByLabel("Tìm danh mục").fill("Cà phê");
    await dialog.getByRole("treeitem", { name: "Cà phê & Đồ uống" }).click();
    await dialog.locator(".note-input").fill("E2E-LEDGER-1");
    await dialog.locator(".event-form.composer button.primary").click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E-LEDGER-1")).toBeVisible();

    const after = await (await request.get(`${API}/financial-events`)).json();
    expect(after.length).toBe(before.length + 1);
  });

  test("opens the detail panel and edits the transaction", async ({ page, request }) => {
    const before = await (await request.get(`${API}/financial-events`)).json();

    await page.goto("/");
    await goToTab(page, "Sổ giao dịch");
    await page.getByText("E2E-LEDGER-1").click();
    const panel = page.locator(".ledger-detail-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: VI.edit }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".amount-row .amount-input")).toHaveValue("20000");
    await dialog.locator(".note-input").fill("E2E-LEDGER-EDITED");
    await dialog.locator(".event-form.composer button.primary").click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E-LEDGER-EDITED")).toBeVisible();

    const after = await (await request.get(`${API}/financial-events`)).json();
    expect(after.length).toBe(before.length);
  });

  test("deletes a transaction from the detail panel", async ({ page, request }) => {
    await request.post(`${API}/financial-events`, {
      data: { event_type: "EXPENSE", transaction_date: new Date().toISOString().slice(0, 10), entries: [{ account_id: 1, amount: "-1000" }], note: "E2E-LEDGER-DELETE" },
    });
    await page.goto("/");
    await goToTab(page, "Sổ giao dịch");
    await page.getByText("E2E-LEDGER-DELETE").click();
    const panel = page.locator(".ledger-detail-panel");
    await panel.getByRole("button", { name: VI.delete }).click();
    await panel.getByRole("button", { name: VI.confirmDelete }).click();
    // Scope to the list row specifically: the detail panel beside it (not
    // a modal, unlike Transactions()' TransactionDetailModal) shows the
    // same note text in its own <dd> at the same time, which would make a
    // page-wide getByText a strict-mode violation while both are visible.
    await expect(page.locator(".ledger-row", { hasText: "E2E-LEDGER-DELETE" })).toHaveCount(0);
  });

  test("switches to All accounts and views combined ledger", async ({ page, request }) => {
    // Create an event on account 2 if account 2 exists
    const accounts = await (await request.get(`${API}/accounts`)).json();
    const secondAcc = accounts.length > 1 ? accounts[1] : accounts[0];
    await request.post(`${API}/financial-events`, {
      data: { event_type: "INCOME", transaction_date: new Date().toISOString().slice(0, 10), entries: [{ account_id: secondAcc.id, amount: "50000" }], note: "E2E-LEDGER-ALL-ACCS" },
    });

    await page.goto("/");
    await goToTab(page, "Sổ giao dịch");
    // Open account switcher and select All accounts
    await page.locator(".ledger-header .row-trigger").click();
    await page.getByRole("option", { name: VI.allAccounts }).click();
    await expect(page.locator(".ledger-header .row-label")).toHaveText(VI.allAccounts);
    await expect(page.getByText("E2E-LEDGER-ALL-ACCS")).toBeVisible();
  });

  test("selects multiple transactions with checkboxes and bulk deletes them after confirmation", async ({ page, request }) => {
    const today = new Date().toISOString().slice(0, 10);
    await request.post(`${API}/financial-events`, {
      data: { event_type: "EXPENSE", transaction_date: today, entries: [{ account_id: 1, amount: "-2000" }], note: "E2E-BULK-1" },
    });
    await request.post(`${API}/financial-events`, {
      data: { event_type: "EXPENSE", transaction_date: today, entries: [{ account_id: 1, amount: "-3000" }], note: "E2E-BULK-2" },
    });

    await page.goto("/");
    await goToTab(page, "Sổ giao dịch");
    await expect(page.getByText("E2E-BULK-1")).toBeVisible();
    await expect(page.getByText("E2E-BULK-2")).toBeVisible();

    // Check checkboxes for E2E-BULK-1 and E2E-BULK-2
    const row1 = page.locator(".ledger-row", { hasText: "E2E-BULK-1" });
    const row2 = page.locator(".ledger-row", { hasText: "E2E-BULK-2" });
    await row1.locator(".ledger-checkbox").click();
    await row2.locator(".ledger-checkbox").click();

    // Verify toolbar shows delete selected button
    const deleteBtn = page.getByRole("button", { name: new RegExp(VI.deleteSelected) });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Confirmation dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(VI.confirmDelete)).toBeVisible();

    // Confirm deletion
    await dialog.getByRole("button", { name: VI.confirmDelete }).click();
    await expect(dialog).not.toBeVisible();

    // Rows are gone
    await expect(page.locator(".ledger-row", { hasText: "E2E-BULK-1" })).toHaveCount(0);
    await expect(page.locator(".ledger-row", { hasText: "E2E-BULK-2" })).toHaveCount(0);
  });

  test("selects all transactions with Select All and deletes all after confirmation", async ({ page, request }) => {
    const today = new Date().toISOString().slice(0, 10);
    await request.post(`${API}/financial-events`, {
      data: { event_type: "EXPENSE", transaction_date: today, entries: [{ account_id: 1, amount: "-5000" }], note: "E2E-DELALL-1" },
    });

    await page.goto("/");
    await goToTab(page, "Sổ giao dịch");
    await expect(page.getByText("E2E-DELALL-1")).toBeVisible();

    // Click "Xoá tất cả" directly from toolbar
    const deleteAllBtn = page.getByRole("button", { name: VI.deleteAll, exact: true });
    await expect(deleteAllBtn).toBeVisible();
    await deleteAllBtn.click();

    // Confirmation dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(VI.confirmDeleteAll)).toBeVisible();

    // Confirm deletion
    await dialog.getByRole("button", { name: VI.confirmDeleteAll }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.locator(".ledger-row", { hasText: "E2E-DELALL-1" })).toHaveCount(0);
  });
});
