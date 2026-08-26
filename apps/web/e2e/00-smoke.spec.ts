import { test, expect } from "@playwright/test";
import { NAV } from "./helpers";

// UI redesign, 2026-08-26: the old h1 "Tài chính cá nhân" page title was
// removed (see docs/qa/QA_STATE.md) -- the sidebar's own nav is now the
// authoritative signal that the app loaded, so this just confirms every
// nav tab (now 7, including the new "Sổ giao dịch" tab) renders.
test("app loads and shows the 7 nav tabs", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: /điều hướng/i });
  for (const label of Object.values(NAV)) {
    await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});
