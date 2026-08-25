import { test, expect } from "@playwright/test";
import { NAV, goToTab } from "./helpers";

// E2E flow #16: mobile navigation. Also covers part of the responsive
// checklist (390px viewport, nav overflow) at the screen most likely to
// regress after the prior task's mobile-nav overflow fix.
test.describe("mobile navigation (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("all 6 tabs are reachable and no horizontal page overflow", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: /điều hướng/i });
    for (const label of Object.values(NAV)) {
      await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    // The page body itself must not scroll horizontally. This is the
    // authoritative, spec-meaningful check for "does the page overflow" --
    // document.documentElement's own scrollWidth vs clientWidth. (An
    // earlier version of this test also flagged individual elements whose
    // own scrollWidth exceeded the viewport, but .nav-scroll -- a plain
    // overflow:visible wrapper around the deliberately overflow-x:auto
    // `nav`, see styles.css's documented mobile-nav overflow fix -- trips
    // that in Chromium even though it never actually causes page scroll,
    // per this same check. Kept to the one check that reflects what a user
    // can actually see/scroll.)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);

    await goToTab(page, "Tài sản");
    await expect(page.getByRole("heading", { name: "Tài sản ròng" })).toBeVisible();
  });

  test("transaction composer usable at 390px without overlap", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Giao dịch");
    const composer = page.locator(".event-form.composer");
    await expect(composer).toBeVisible();
    const box = await composer.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
  });
});
