import { test, expect } from "@playwright/test";
import { goToTab, VI, chooseAccount } from "./helpers";

const API = "http://127.0.0.1:8010/api/v1";

// User request, 2026-08-26 (verbatim): "Hãy thêm cho tôi tính năng không
// tính vào báo cáo đối với giao dịch nhập mới. ý nghĩa là với các báo cáo
// tổng hợp thu chi sẽ không tính các giao dịch này. Nút tích 'không tính
// vào báo cáo' này cũng áp dụng với việc thêm tài sản mới. Cho phép chỉnh
// sửa giá trị này ở các menu chỉnh sửa giao dịch, chỉnh sửa tài sàn" --
// covers: (1) the checkbox on new transactions, editable afterwards via the
// transaction-edit menu; (2) the same checkbox on new savings/metal/crypto
// assets, editable afterwards via each asset's own edit affordance.
async function findEventByNote(request: import("@playwright/test").APIRequestContext, note: string) {
  const res = await request.get(`${API}/financial-events`);
  const events = await res.json();
  return events.find((e: { note?: string }) => e.note === note);
}

test.describe.serial("exclude from reports: transactions", () => {
  test("a new transaction defaults to counted, and the checkbox opts it out", async ({ page, request }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await chooseAccount(page, "E2E Cash");
    await page.locator(".amount-row .amount-input").fill("12000");
    await page.getByRole("button", { name: /Chọn danh mục/ }).click();
    await page.getByLabel("Tìm danh mục").fill("Cà phê");
    await page.getByRole("treeitem", { name: "Cà phê & Đồ uống" }).click();
    await page.locator(".note-input").fill("E2E-EXCLUDE-EXPENSE-1");
    // The checkbox lives in the collapsible "+ Thêm chi tiết" section.
    await page.getByRole("button", { name: /Thêm chi tiết/ }).click();
    await page.getByText("Không tính vào báo cáo", { exact: true }).click();
    await page.locator(".event-form.composer button.primary").click();
    await expect(page.getByText("E2E-EXCLUDE-EXPENSE-1")).toBeVisible();

    const event = await findEventByNote(request, "E2E-EXCLUDE-EXPENSE-1");
    expect(event).toBeTruthy();
    expect(event.excluded_from_reports).toBe(true);
  });

  test("editing the transaction can turn the flag back off", async ({ page, request }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    await page.getByText("E2E-EXCLUDE-EXPENSE-1").click();
    await page.getByRole("button", { name: VI.edit }).click();
    await page.getByRole("button", { name: /Thêm chi tiết|Ẩn chi tiết/ }).click();
    const checkbox = page.locator('.event-details .checkbox-row input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await page.locator(".event-form.composer button.primary").click();
    await expect(page.locator(".editing-banner")).not.toBeVisible();

    const event = await findEventByNote(request, "E2E-EXCLUDE-EXPENSE-1");
    expect(event.excluded_from_reports).toBe(false);
  });
});

test.describe.serial("exclude from reports: assets", () => {
  test("a new precious metal purchase can be marked excluded, then toggled off from the asset row", async ({ page, request }) => {
    const before = await (await request.get(`${API}/assets/metals`)).json();

    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.metalsTab }).click();
    await page.locator('select[name="metal_type"]').selectOption("GOLD");
    await page.locator('select[name="product_type"]').selectOption("Trang sức");
    await page.locator('input[name="quantity"]').fill("1");
    await page.locator('input[name="price"]').fill("7500000");
    await page.locator('input[name="total"]').fill("7500000");
    await page.locator('input[name="date"]').fill("2026-08-20");
    await page.locator('.asset-form input[name="excluded_from_reports"]').check();
    await page.locator(".asset-form button.primary").click();

    await expect(page.locator(".asset-list").getByText("Trang sức", { exact: true }).first()).toBeVisible();
    const after = await (await request.get(`${API}/assets/metals`)).json();
    expect(after.length).toBe(before.length + 1);
    const created = after[after.length - 1];
    expect(created.excluded_from_reports).toBe(true);

    // The asset row's own inline checkbox is the only edit affordance for
    // metal holdings (no other edit form exists) -- uncheck it there and
    // confirm the change round-trips through the PATCH endpoint.
    const row = page.locator(".asset-row", { hasText: "Trang sức" }).first();
    const rowCheckbox = row.locator('input[type="checkbox"]');
    await expect(rowCheckbox).toBeChecked();
    // A plain .click() + auto-retrying assertion, not .uncheck() -- the
    // checkbox is bound to react-query cache state that only settles after
    // the PATCH round-trips (see the optimistic-update comment on
    // AssetSection's `toggle` mutation in page.tsx); .uncheck() samples the
    // DOM synchronously right after its own click and can catch it
    // mid-flight, which is a test-timing artifact, not a real user-facing
    // issue -- eventual consistency is what matters here.
    await rowCheckbox.click();
    await expect(rowCheckbox).not.toBeChecked();

    const patched = await (await request.get(`${API}/assets/metals`)).json();
    expect(patched.find((m: { id: number }) => m.id === created.id).excluded_from_reports).toBe(false);
  });

  test("a new savings account can be marked excluded, then toggled from its detail dialog", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.savingsTab }).click();
    await page.getByRole("button", { name: VI.addSavingsAccount }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Institution").or(dialog.locator('input[name="institution"]')).fill("E2E Exclude Bank");
    await dialog.locator('input[name="name"]').fill("E2E Savings Exclude");
    await dialog.locator('input[name="principal"]').fill("5000000");
    await dialog.locator('select[name="funding_account_id"]').selectOption({ label: "E2E Bank · Ngân hàng" });
    await dialog.locator('input[name="annual_rate"]').fill("4.5");
    await dialog.locator('input[name="excluded_from_reports"]').check();
    await dialog.getByRole("button", { name: "Lưu sổ" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E Savings Exclude", { exact: true })).toBeVisible();

    await page.getByText("E2E Savings Exclude", { exact: true }).click();
    const detail = page.getByRole("dialog");
    const toggle = detail.locator(".savings-detail > .checkbox-row input[type=\"checkbox\"]");
    await expect(toggle).toBeChecked();
    // Unlike every other savings field, this one must stay editable
    // regardless of lifecycle history -- exercised here on a still-editable
    // (no renewals/settlement yet) account, which is the common case; the
    // backend-level "editable even after history" behavior is covered by
    // apps/api/tests/test_savings_api.py's
    // test_patch_savings_can_set_excluded_from_reports_after_history_exists.
    // A plain .click() + auto-retrying assertion, not .uncheck() -- see the
    // comment on the equivalent metal-row toggle above for why.
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  });
});
