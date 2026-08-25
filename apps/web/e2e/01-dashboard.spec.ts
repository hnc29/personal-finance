import { test, expect } from "@playwright/test";
import { goToTab, expectNoConsoleErrors, VI } from "./helpers";

// E2E flow #1: open Dashboard (Tài sản tab, holds net worth after the
// Portfolio→Assets merge) and reconcile the headline KPIs render sane
// values with no console errors. App defaults to Vietnamese UI.
test("dashboard/assets tab shows net worth KPIs with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });

  await page.goto("/");
  await goToTab(page, "Tài sản");

  await expect(page.getByRole("heading", { name: VI.netWorth })).toBeVisible();
  await expect(page.getByRole("heading", { name: VI.accountsInScope })).toBeVisible();
  await expect(page.getByRole("heading", { name: VI.investedAssets })).toBeVisible();

  // Net worth must render a real money figure, not the "valuation
  // incomplete" fallback text, for the seeded E2E accounts (no invested
  // assets yet at this point in the suite, so valuation is always complete).
  const netWorthCard = page.getByRole("heading", { name: VI.netWorth }).locator("..");
  await expect(netWorthCard.locator(".metric")).not.toHaveText(VI.valuationIncomplete);

  await expectNoConsoleErrors(page, errors);
});
