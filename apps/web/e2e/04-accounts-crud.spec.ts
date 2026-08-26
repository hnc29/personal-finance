import { test, expect } from "@playwright/test";
import { goToTab, VI } from "./helpers";

// E2E flow #8 (add/edit/delete account — accounts have no hard delete, only
// activate/deactivate, so that toggle stands in for "delete" here).
test.describe.serial("accounts: add / edit / deactivate / reactivate", () => {
  test("adds a new account", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài khoản");
    await page.getByRole("button", { name: "+ Thêm tài khoản" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên").fill("E2E New Wallet");
    await dialog.getByLabel("Loại").selectOption("EWALLET");
    await dialog.getByRole("button", { name: "Thêm tài khoản" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E New Wallet", { exact: true })).toBeVisible();
  });

  test("edits the new account's name", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài khoản");
    const card = page.locator("article").filter({ has: page.getByText("E2E New Wallet", { exact: true }) });
    await card.getByRole("button", { name: VI.edit }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên").fill("E2E New Wallet Renamed");
    await dialog.getByRole("button", { name: VI.saveChanges }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E New Wallet Renamed", { exact: true })).toBeVisible();
  });

  test("deactivates then reactivates the account", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài khoản");
    const card = page.locator("article").filter({ has: page.getByText("E2E New Wallet Renamed", { exact: true }) });
    await card.getByRole("button", { name: VI.deactivate }).click();
    await expect(card).toHaveClass(/inactive/);
    await card.getByRole("button", { name: VI.activate }).click();
    await expect(card).not.toHaveClass(/inactive/);
  });
});

// Regression coverage for the user report (2026-08-26): a new BANK/
// CREDIT_CARD account must have its bank chosen from a fixed list (no free
// typing), and an initial balance entered at creation time must show up as
// the account's current balance immediately (see AccountFormDialog's
// two-step create-then-ADJUSTMENT-event mutation in app/page.tsx).
test.describe.serial("accounts: bank account with a strict bank list + initial balance", () => {
  test("choosing a bank and an initial balance creates the account with that balance", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài khoản");
    await page.getByRole("button", { name: "+ Thêm tài khoản" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Loại").selectOption("BANK");
    // The bank field is a <select> now -- no text input exists for it at
    // all, so there is no way to type a bank name that isn't in the list.
    await expect(dialog.locator('input[name="name"]')).toHaveCount(0);
    await dialog.locator('select[name="bank_name"]').selectOption("Vietcombank");
    await dialog.locator('input[name="nickname"]').fill("E2E Lương");
    await dialog.locator('input[name="initial_balance"]').fill("15000000");
    await dialog.getByRole("button", { name: "Thêm tài khoản" }).click();
    await expect(dialog).not.toBeVisible();

    const card = page.locator("article").filter({ has: page.getByText("Vietcombank (E2E Lương)", { exact: true }) });
    await expect(card).toBeVisible();
    // UI redesign, 2026-08-26: money now displays with "." thousand
    // separators (fmtMoneyDisplay -- see docs/qa/QA_STATE.md), so
    // 15000000 renders as "15.000.000".
    await expect(card.getByText(/Số dư hiện tại:\s*15\.000\.000/)).toBeVisible();
  });
});
