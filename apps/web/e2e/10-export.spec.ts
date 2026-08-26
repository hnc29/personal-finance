import { test, expect } from "@playwright/test";
import { goToTab } from "./helpers";

const API = "http://127.0.0.1:8010/api/v1";

// Regression coverage for the user report (2026-08-26): "Chức năng xuất dữ
// liệu: Lựa chọn tài khoản, ngày bắt đầu, ngày kết thúc". Export used to be
// two bare links with no filtering at all (see app/api/data.py's
// _export_rows for the server-side filter, covered directly by
// apps/api/tests/test_exports_api.py); this exercises the filter UI wiring
// the export links to the right query string end to end.
test.describe.serial("data: export filters", () => {
  test("selecting an account and a date range updates the export link query string", async ({ page, request }) => {
    const account = await (
      await request.post(`${API}/accounts`, { data: { name: "E2E Export Account", account_type: "CASH", currency: "VND" } })
    ).json();

    await page.goto("/");
    await goToTab(page, "Dữ liệu");
    await page.locator("select").filter({ hasText: "E2E Export Account" }).selectOption(String(account.id));
    await page.locator('input[type="date"]').nth(0).fill("2026-01-01");
    await page.locator('input[type="date"]').nth(1).fill("2026-12-31");

    const csvHref = await page.getByRole("link", { name: "Xuất CSV" }).getAttribute("href");
    expect(csvHref).toContain(`account_id=${account.id}`);
    expect(csvHref).toContain("start_date=2026-01-01");
    expect(csvHref).toContain("end_date=2026-12-31");

    const xlsxHref = await page.getByRole("link", { name: "Xuất XLSX" }).getAttribute("href");
    expect(xlsxHref).toContain(`account_id=${account.id}`);
  });

  test("the filtered export only contains that account's entries", async ({ page, request }) => {
    const account = await (
      await request.post(`${API}/accounts`, { data: { name: "E2E Export Account 2", account_type: "CASH", currency: "VND" } })
    ).json();
    await request.post(`${API}/financial-events`, {
      data: { event_type: "EXPENSE", transaction_date: "2026-08-01", entries: [{ account_id: account.id, amount: "-50000.0000" }] },
    });

    await page.goto("/");
    await goToTab(page, "Dữ liệu");
    await page.locator("select").filter({ hasText: "E2E Export Account 2" }).selectOption(String(account.id));
    const href = await page.getByRole("link", { name: "Xuất CSV" }).getAttribute("href");
    expect(href).toBeTruthy();

    const csv = await (await request.get(href!)).text();
    const dataLines = csv.trim().split("\n").slice(1);
    expect(dataLines.length).toBe(1);
    expect(dataLines[0]).toContain(String(account.id));
  });
});
