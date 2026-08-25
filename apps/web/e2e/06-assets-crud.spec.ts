import { test, expect } from "@playwright/test";
import { goToTab, VI } from "./helpers";

const API = "http://127.0.0.1:8010/api/v1";

// E2E flow #9 (add/edit asset). Metals/crypto rows have no edit/delete UI
// at all in AssetSection (read-only display, see app/page.tsx) so only
// "add" is exercised for metals; Savings is the only asset kind with a
// true edit form, so it covers "edit".
test.describe.serial("assets: add metal, add + edit savings account", () => {
  test("adds a precious metal purchase", async ({ page, request }) => {
    const before = await (await request.get(`${API}/assets/metals`)).json();

    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.metalsTab }).click();
    await page.locator('select[name="metal_type"]').selectOption("GOLD");
    await page.locator('input[name="product_type"]').fill("Nhẫn tròn trơn E2E");
    await page.locator('input[name="quantity"]').fill("1");
    // Purity is stored as a (0, 1] fraction server-side (see
    // app/api/assets.py MetalCreate.purity_in_unit_range) -- 0.999 is the
    // "999" (99.9%) gold the product name implies.
    await page.locator('input[name="purity"]').fill("0.999");
    await page.locator('input[name="price"]').fill("7500000");
    await page.locator('input[name="total"]').fill("7500000");
    await page.locator('input[name="date"]').fill("2026-08-20");
    await page.locator(".asset-form button.primary").click();

    await expect(page.getByText("Nhẫn tròn trơn E2E")).toBeVisible();
    const after = await (await request.get(`${API}/assets/metals`)).json();
    expect(after.length).toBe(before.length + 1);
  });

  test("adds a savings account", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.savingsTab }).click();
    await page.getByRole("button", { name: VI.addSavingsAccount }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Institution").or(dialog.locator('input[name="institution"]')).fill("E2E Bank Savings Co");
    await dialog.locator('input[name="name"]').fill("E2E Savings 1");
    await dialog.locator('input[name="principal"]').fill("10000000");
    await dialog.locator('select[name="funding_account_id"]').selectOption({ label: "E2E Bank · Ngân hàng" });
    await dialog.locator('input[name="annual_rate"]').fill("5.5");
    await dialog.getByRole("button", { name: "Lưu sổ" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E Savings 1", { exact: true })).toBeVisible();
  });

  test("edits the savings account's name", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.savingsTab }).click();
    await page.getByText("E2E Savings 1", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: VI.edit }).click();
    await dialog.locator('input[name="name"]').fill("E2E Savings Renamed");
    await dialog.getByRole("button", { name: VI.saveChanges }).click();
    // Saving an edit returns to the read-only detail view inside the same
    // dialog (SavingsDetailDialog's afterAction() clears `action` but
    // doesn't call onClose) -- it doesn't close the modal. Confirm the
    // updated name shows in the still-open detail view, then close it and
    // confirm the card list behind it picked up the rename too.
    await expect(dialog.getByRole("heading", { name: "E2E Savings Renamed" })).toBeVisible();
    await dialog.getByRole("button", { name: "Đóng" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E Savings Renamed", { exact: true })).toBeVisible();
  });
});
