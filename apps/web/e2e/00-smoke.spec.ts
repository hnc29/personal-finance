import { test, expect } from "@playwright/test";
import { NAV } from "./helpers";

test("app loads and shows the 6 nav tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tài chính cá nhân" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: /điều hướng/i });
  for (const label of Object.values(NAV)) {
    await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});
