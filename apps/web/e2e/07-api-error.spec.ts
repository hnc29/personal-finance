import { test, expect } from "@playwright/test";
import { goToTab, VI, errorAlert } from "./helpers";

// E2E flow #14: API error / offline handling. Simulates a backend failure
// by aborting the relevant fetch and checks the app surfaces the generic
// "Load failed" error state instead of crashing or showing nothing.
// TanStack Query's default QueryClient (app/query-provider.tsx sets no
// custom retry config) retries a failed query 3x with exponential backoff
// before settling into an error state, which can take several seconds --
// give these a longer timeout than the default 5s instead of racing it.
test("shows a load-failed message when the events API call fails", async ({ page }) => {
  await page.route("**/api/v1/financial-events", route => route.abort("failed"));
  await page.goto("/");
  await goToTab(page, "Giao dịch");
  await expect(errorAlert(page).filter({ hasText: VI.loadFailed })).toBeVisible({ timeout: 15000 });
});

test("shows a load-failed message when the accounts API call fails", async ({ page }) => {
  await page.route("**/api/v1/accounts", route => route.abort("failed"));
  await page.goto("/");
  await goToTab(page, "Tài khoản");
  await expect(errorAlert(page).filter({ hasText: VI.loadFailed })).toBeVisible({ timeout: 15000 });
});

test("submit is disabled while the mutation is pending (slow network)", async ({ page }) => {
  await page.goto("/");
  await goToTab(page, "Giao dịch");
  await page.route("**/api/v1/financial-events", async route => {
    if (route.request().method() === "POST") {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    await route.continue();
  });
  await page.getByRole("button", { name: VI.selectAccount }).click();
  await page.getByRole("option", { name: "E2E Cash" }).click();
  await page.locator(".amount-row .amount-input").fill("1000");
  await page.getByRole("button", { name: /Chọn danh mục/ }).click();
  await page.getByLabel("Tìm danh mục").fill("Cà phê");
  await page.getByRole("treeitem", { name: "Cà phê & Đồ uống" }).click();
  const submit = page.locator(".event-form.composer button.primary");
  await submit.click();
  await expect(submit).toBeDisabled();
});
