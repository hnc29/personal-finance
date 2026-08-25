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
