import { test, expect } from "@playwright/test";
import { goToTab, expectNoConsoleErrors, VI } from "./helpers";

// Responsive checklist (task prompt §11): 390/768/1366/1440px. 390px is
// already covered by 08-mobile-nav.spec.ts (touches the documented
// mobile-nav overflow fix specifically); this file covers the remaining
// three breakpoints on the two screens most likely to regress -- Dashboard
// (Tài sản, net worth + asset tabs) and Transactions (the composer + table,
// including a modal open/close) -- per the DOM-check-over-visual-regression
// guidance in the task prompt.
const VIEWPORTS = [
  { name: "768", width: 768, height: 1024 },
  { name: "1366", width: 1366, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`responsive at ${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("dashboard: no overflow, no console errors, KPIs visible", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(String(e)));
      page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });

      await page.goto("/");
      await goToTab(page, "Tài sản");
      await expect(page.getByRole("heading", { name: VI.netWorth })).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);

      await expectNoConsoleErrors(page, errors);
    });

    test("transactions: composer fits viewport and detail modal doesn't overlap/clip", async ({ page, request }) => {
      // Ensure at least one row exists so the detail modal can open.
      await request.post("http://127.0.0.1:8010/api/v1/financial-events", {
        data: {
          event_type: "EXPENSE",
          transaction_date: "2026-08-20",
          category_id: 5,
          note: `E2E-responsive-${viewport.name}`,
          entries: [{ account_id: 1, amount: "-1000" }],
        },
      });

      await page.goto("/");
      await goToTab(page, "Giao dịch");
      const composer = page.locator(".event-form.composer");
      await expect(composer).toBeVisible();
      const composerBox = await composer.boundingBox();
      expect(composerBox?.width).toBeLessThanOrEqual(viewport.width);

      // .last(): reruns against a non-reset test DB can leave a prior run's
      // same-named row behind; the freshest one is always what this run
      // itself just created via the API call above.
      await page.getByText(`E2E-responsive-${viewport.name}`).last().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox?.width).toBeLessThanOrEqual(viewport.width);
      // The close (×) control must stay reachable, not clipped off-viewport.
      await expect(dialog.getByRole("button", { name: "Đóng" })).toBeInViewport();
      await dialog.getByRole("button", { name: "Đóng" }).click();
      await expect(dialog).not.toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);
    });
  });
}
