import { test, expect, APIRequestContext } from "@playwright/test";
import { goToTab, VI } from "./helpers";

const API = "http://127.0.0.1:8010/api/v1";

async function findEventByNote(request: APIRequestContext, note: string) {
  const res = await request.get(`${API}/financial-events`);
  const events = await res.json();
  return events.find((e: { note?: string }) => e.note === note);
}

// E2E flows #2 (add income), #3 (add expense), #4 (edit), #5 (delete),
// #15 (persistence after reload). Runs after 02-transactions-validation so
// the empty-state assertion there still sees zero rows. Signed-amount
// correctness is cross-checked against the API directly (not just the
// formatted UI string) per QA_STATE.md's Batch #1 finding on this exact
// EXPENSE/INCOME sign path.
test.describe.serial("transactions: add / edit / delete / persistence", () => {
  test("adds an INCOME transaction with correct positive sign", async ({ page, request }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await page.getByRole("group", { name: VI.type }).getByRole("button", { name: VI.income }).click();
    await page.getByRole("button", { name: VI.selectAccount }).click();
    await page.getByRole("option", { name: "E2E Bank" }).click();
    await page.locator(".amount-row .amount-input").fill("500000");
    await page.getByRole("button", { name: /Chọn danh mục/ }).click();
    await page.getByLabel("Tìm danh mục").fill("Lương");
    await page.getByRole("treeitem", { name: "Lương" }).click();
    await page.locator(".note-input").fill("E2E-CRUD-INCOME-1");
    await page.locator(".event-form.composer button.primary").click();
    await expect(page.getByText("E2E-CRUD-INCOME-1")).toBeVisible();

    const event = await findEventByNote(request, "E2E-CRUD-INCOME-1");
    expect(event).toBeTruthy();
    expect(event.event_type).toBe("INCOME");
    expect(Number(event.entries[0].amount)).toBeGreaterThan(0);
  });

  test("adds an EXPENSE transaction with correct negative sign", async ({ page, request }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    // EXPENSE is the composer's default type; no need to click it.
    await page.getByRole("button", { name: VI.selectAccount }).click();
    await page.getByRole("option", { name: "E2E Cash" }).click();
    await page.locator(".amount-row .amount-input").fill("45000");
    await page.getByRole("button", { name: /Chọn danh mục/ }).click();
    await page.getByLabel("Tìm danh mục").fill("Cà phê");
    await page.getByRole("treeitem", { name: "Cà phê & Đồ uống" }).click();
    await page.locator(".note-input").fill("E2E-CRUD-EXPENSE-1");
    await page.locator(".event-form.composer button.primary").click();
    await expect(page.getByText("E2E-CRUD-EXPENSE-1")).toBeVisible();

    const event = await findEventByNote(request, "E2E-CRUD-EXPENSE-1");
    expect(event).toBeTruthy();
    expect(event.event_type).toBe("EXPENSE");
    expect(Number(event.entries[0].amount)).toBeLessThan(0);
  });

  test("edits the expense transaction's amount", async ({ page, request }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await page.getByText("E2E-CRUD-EXPENSE-1").click();
    await page.getByRole("button", { name: VI.edit }).click();
    await page.locator(".amount-row .amount-input").fill("46500");
    await page.locator(".event-form.composer button.primary").click();
    await expect(page.locator(".editing-banner")).not.toBeVisible();

    const event = await findEventByNote(request, "E2E-CRUD-EXPENSE-1");
    expect(Number(event.entries[0].amount)).toBe(-46500);
  });

  test("deletes the income transaction", async ({ page, request }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await page.getByText("E2E-CRUD-INCOME-1").click();
    await page.getByRole("button", { name: VI.delete }).click();
    await page.getByRole("button", { name: VI.confirmDelete }).click();
    // Scope to the recent-transactions widget's row specifically (UI
    // redesign, 2026-08-26: the old full `.table` was replaced by the
    // right-column "20 most recent" list, see Transactions()): right after
    // delete, the closing detail modal can still be mid-transition, and
    // matching plain text would hit both the row and the modal's own copy.
    await expect(page.locator(".recent-row", { hasText: "E2E-CRUD-INCOME-1" })).toHaveCount(0);

    const event = await findEventByNote(request, "E2E-CRUD-INCOME-1");
    expect(event).toBeFalsy();
  });

  test("edited expense persists after a full page reload", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await page.reload();
    await goToTab(page, "Giao dịch");
    await expect(page.getByText("E2E-CRUD-EXPENSE-1")).toBeVisible();
  });
});
