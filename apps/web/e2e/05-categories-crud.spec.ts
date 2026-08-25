import { test, expect } from "@playwright/test";
import { goToTab, VI } from "./helpers";

// E2E flow #8 (add/edit/delete category — like accounts, categories have no
// hard delete, only activate/deactivate) plus the search/group-filter UI
// that only exists on this screen (Transactions has none, see QA_STATE.md).
test.describe.serial("categories: add / edit / deactivate / search+filter", () => {
  test("adds a new top-level category", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Danh mục");
    await page.getByLabel("Tên", { exact: true }).fill("E2E New Category");
    await page.getByRole("button", { name: VI.addCategory, exact: true }).click();
    await expect(page.getByText("E2E New Category", { exact: true })).toBeVisible();
  });

  test("edits the new category's name", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Danh mục");
    const row = page.locator(".category-tree-row", { hasText: "E2E New Category" }).first();
    await row.getByRole("button", { name: VI.edit }).click();
    await page.getByLabel("Tên", { exact: true }).fill("E2E Category Renamed");
    await page.getByRole("button", { name: VI.saveChanges }).click();
    await expect(page.getByText("E2E Category Renamed", { exact: true })).toBeVisible();
  });

  test("deactivates then reactivates the category", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Danh mục");
    const row = page.locator(".category-tree-row", { hasText: "E2E Category Renamed" }).first();
    await row.getByRole("button", { name: VI.deactivate }).click();
    await expect(row.getByText("Ngừng hoạt động")).toBeVisible();
    await row.getByRole("button", { name: VI.activate }).click();
    await expect(row.getByText("Đang hoạt động")).toBeVisible();
  });

  test("search box filters the category tree", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Danh mục");
    await page.getByLabel(VI.searchCategory, { exact: true }).fill("E2E Category Renamed");
    await expect(page.getByText("E2E Category Renamed", { exact: true })).toBeVisible();
    await expect(page.getByText("Ăn uống", { exact: true })).not.toBeVisible();

    await page.getByLabel(VI.searchCategory, { exact: true }).fill("no-such-category-xyz");
    await expect(page.getByText(VI.noCategoriesFound)).toBeVisible();
  });

  test("Income/Expense segmented filter narrows the tree", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Danh mục");
    await page.locator(".segmented").getByRole("button", { name: VI.income }).click();
    await expect(page.getByText("Lương", { exact: true })).toBeVisible();
    await expect(page.getByText("Ăn uống", { exact: true })).not.toBeVisible();
  });
});
