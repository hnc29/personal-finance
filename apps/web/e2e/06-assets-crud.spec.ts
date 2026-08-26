import { test, expect } from "@playwright/test";
import { goToTab, VI } from "./helpers";

const API = "http://127.0.0.1:8010/api/v1";

// E2E flow #9 (add/edit asset). Metals/crypto rows have no edit/delete UI
// at all in AssetSection (read-only display, see app/page.tsx) so only
// "add" is exercised for metals; Savings is the only asset kind with a
// true edit form, so it covers "edit".
test.describe.serial("assets: add metal, add + edit savings account", () => {
  test("adds a precious metal purchase", async ({ page, request }) => {
    const before = await (await request.get(`${API}/assets/metals`)).json();

    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.metalsTab }).click();
    await page.locator('select[name="metal_type"]').selectOption("GOLD");
    // Product is a fixed 3-option select (user report, 2026-08-26: "Sản
    // phẩm: chọn theo: Nhẫn, miếng, Trang sức") -- no free text anymore.
    // The option *value* is the Vietnamese label itself, not an internal
    // code (see the BUGFIX comment on that <select> in app/page.tsx) since
    // AssetSection displays product_type verbatim as the holding's name.
    await page.locator('select[name="product_type"]').selectOption("Nhẫn");
    await page.locator('input[name="quantity"]').fill("1");
    // Purity is now optional (server default 0.9999) and entered as a
    // percentage in the UI (converted to the (0,1] fraction the API stores
    // -- see app/api/assets.py MetalCreate.purity_in_unit_range and
    // page.tsx's percentToFraction()); leaving it blank exercises the
    // 99.99% default end to end.
    await page.locator('input[name="price"]').fill("7500000");
    await page.locator('input[name="total"]').fill("7500000");
    await page.locator('input[name="date"]').fill("2026-08-20");
    await page.locator(".asset-form button.primary").click();

    await expect(page.locator(".asset-list").getByText("Nhẫn", { exact: true }).first()).toBeVisible();
    const after = await (await request.get(`${API}/assets/metals`)).json();
    expect(after.length).toBe(before.length + 1);
  });

  test("accepts a Vietnamese decimal comma in quantity and an explicit purity percentage", async ({ page, request }) => {
    // Regression test (user report, 2026-08-26: "Vàng ... Chức năng chưa
    // hoạt động, nhấn thêm không phản hồi"): typing a comma decimal (as
    // Vietnamese numbers are naturally written) used to throw an uncaught
    // BigInt parsing exception inside the submit handler before the
    // mutation ever ran -- no request, no error, the button just did
    // nothing. See the BUGFIX comment above normDecimal() in app/page.tsx.
    const before = await (await request.get(`${API}/assets/metals`)).json();

    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.metalsTab }).click();
    await page.locator('select[name="metal_type"]').selectOption("GOLD");
    await page.locator('select[name="product_type"]').selectOption("Miếng");
    await page.locator('input[name="quantity"]').fill("1,5");
    await page.locator('input[name="purity"]').fill("99,99");
    await page.locator('input[name="price"]').fill("7500000");
    await page.locator('input[name="total"]').fill("11250000");
    await page.locator('input[name="date"]').fill("2026-08-20");
    await page.locator(".asset-form button.primary").click();
    // Wait for the new row to actually land before reading it back over the
    // API -- clicking submit and immediately hitting the API via the raw
    // `request` fixture races ahead of the browser's own in-flight POST
    // otherwise (this is a test-timing fix, not a product behavior check).
    await expect(page.locator(".asset-list").getByText("Miếng", { exact: true }).first()).toBeVisible();

    const after = await (await request.get(`${API}/assets/metals`)).json();
    expect(after.length).toBe(before.length + 1);
    // 1.5 chỉ * 3.75 g/chỉ = 5.625 g -- confirms the comma was accepted by
    // the same BigInt arithmetic as a dot, not silently dropped.
    expect(after[after.length - 1].quantity_grams).toBe("5.6250");
  });

  test("adds a savings account", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.savingsTab }).click();
    await page.getByRole("button", { name: VI.addSavingsAccount }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Institution").or(dialog.locator('input[name="institution"]')).fill("E2E Bank Savings Co");
    await dialog.locator('input[name="name"]').fill("E2E Savings 1");
    await dialog.locator('input[name="principal"]').fill("10000000");
    await dialog.locator('select[name="funding_account_id"]').selectOption({ label: "E2E Bank · Ngân hàng" });
    await dialog.locator('input[name="annual_rate"]').fill("5.5");
    await dialog.getByRole("button", { name: "Lưu sổ" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E Savings 1", { exact: true })).toBeVisible();
  });

  test("edits the savings account's name", async ({ page }) => {
    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.savingsTab }).click();
    await page.getByText("E2E Savings 1", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: VI.edit }).click();
    await dialog.locator('input[name="name"]').fill("E2E Savings Renamed");
    await dialog.getByRole("button", { name: VI.saveChanges }).click();
    // Saving an edit returns to the read-only detail view inside the same
    // dialog (SavingsDetailDialog's afterAction() clears `action` but
    // doesn't call onClose) -- it doesn't close the modal. Confirm the
    // updated name shows in the still-open detail view, then close it and
    // confirm the card list behind it picked up the rename too.
    await expect(dialog.getByRole("heading", { name: "E2E Savings Renamed" })).toBeVisible();
    await dialog.getByRole("button", { name: "Đóng" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("E2E Savings Renamed", { exact: true })).toBeVisible();
  });
});

// Regression coverage for the user report (2026-08-26): "với giá mua sẽ
// cho lựa chọn mua bằng USD hoặc VND. Tổng chi phí sẽ tính bằng giá mua
// nhân với số lượng, nếu mua bằng usd thì sẽ tự động nhân và chuyển sang
// vnd (tỷ giá sẽ tự động cập nhật)", corrected (2026-08-26): "sai rồi, tôi
// muốn được tự nhập mã của coin. chỉ tham chiếu giá của coin khi tính giá
// trị tài sản" -- the coin code is now typed by hand into a plain input,
// not picked from a search popover; the coin-catalog endpoint is only
// consulted in the background (see resolveCryptoIdentity() in page.tsx).
// Coin search and the live FX rate are both mocked -- the real
// CoinGecko/open.er-api.com endpoints aren't reachable from this sandbox
// (see docs/qa/QA_STATE.md), and a test shouldn't depend on a live
// external rate anyway.
test.describe.serial("crypto: purchase price in VND or USD auto-computes the total", () => {
  test("VND: total cost is computed (price * quantity), no longer typed by hand", async ({ page, request }) => {
    await page.route("**/api/v1/assets/crypto/coins**", route =>
      route.fulfill({ json: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] })
    );
    const before = await (await request.get(`${API}/assets/crypto`)).json();

    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.cryptoTab }).click();
    await page.locator('input[name="symbol"]').fill("BTC");
    await page.locator('input[name="quantity"]').fill("2");
    await page.locator('input[name="price"]').fill("50000000");
    // Total cost is now a read-only field driven by cryptoPurchaseTotals(),
    // not user input -- 2 * 50,000,000 = 100,000,000. UI redesign,
    // 2026-08-26: this display value now goes through fmtMoneyDisplay too
    // (it's a readOnly/disabled echo field, not an editable input), so it
    // renders with "." thousand separators.
    await expect(page.locator('input[name="total"]')).toHaveValue("100.000.000");
    await page.locator('input[name="date"]').fill("2026-08-20");
    await page.locator(".asset-form button.primary").click();

    await expect(page.locator(".asset-list").getByText("Bitcoin", { exact: true }).first()).toBeVisible();
    const after = await (await request.get(`${API}/assets/crypto`)).json();
    expect(after.length).toBe(before.length + 1);
  });

  test("USD: total cost converts to VND using the live rate, shown to the user before submit", async ({ page, request }) => {
    await page.route("**/api/v1/assets/crypto/coins**", route =>
      route.fulfill({ json: [{ id: "ethereum", symbol: "eth", name: "Ethereum" }] })
    );
    await page.route("**/api/v1/fx/usd-vnd", route =>
      route.fulfill({ json: { rate: "26000", as_of: "2026-08-26T00:00:00Z", source: "test" } })
    );
    const before = await (await request.get(`${API}/assets/crypto`)).json();

    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.cryptoTab }).click();
    await page.locator('input[name="symbol"]').fill("ETH");
    await page.locator('input[name="quantity"]').fill("1");
    await page.locator('input[name="price"]').fill("100");
    await page.locator('select[name="purchase_currency"]').selectOption("USD");

    // The live rate is shown so the conversion isn't a black box. UI
    // redesign, 2026-08-26: fmtMoneyDisplay now groups this too.
    await expect(page.getByText("1 USD ≈ 26.000 VND")).toBeVisible();
    // 100 USD/unit * 26000 = 2,600,000 VND/unit; total = 2,600,000 * 1.
    await expect(page.locator('input[name="total"]')).toHaveValue("2.600.000");

    await page.locator('input[name="date"]').fill("2026-08-20");
    await page.locator(".asset-form button.primary").click();

    await expect(page.locator(".asset-list").getByText("Ethereum", { exact: true }).first()).toBeVisible();
    const after = await (await request.get(`${API}/assets/crypto`)).json();
    expect(after.length).toBe(before.length + 1);
  });

  test("USD: Add is disabled until the exchange rate has loaded", async ({ page }) => {
    await page.route("**/api/v1/assets/crypto/coins**", route =>
      route.fulfill({ json: [{ id: "solana", symbol: "sol", name: "Solana" }] })
    );
    // Hold the FX response so the loading state is observable rather than
    // racing past it.
    let releaseFx: () => void = () => {};
    const fxGate = new Promise<void>(resolve => { releaseFx = resolve; });
    await page.route("**/api/v1/fx/usd-vnd", async route => {
      await fxGate;
      await route.fulfill({ json: { rate: "26000", as_of: "2026-08-26T00:00:00Z", source: "test" } });
    });

    await page.goto("/");
    await goToTab(page, "Tài sản");
    await page.getByRole("tab", { name: VI.cryptoTab }).click();
    await page.locator('input[name="symbol"]').fill("SOL");
    await page.locator('input[name="quantity"]').fill("1");
    await page.locator('input[name="price"]').fill("100");
    await page.locator('select[name="purchase_currency"]').selectOption("USD");

    await expect(page.getByText("Đang tải tỷ giá…")).toBeVisible();
    await expect(page.locator(".asset-form button.primary")).toBeDisabled();

    releaseFx();
    // UI redesign, 2026-08-26: fmtMoneyDisplay groups this too.
    await expect(page.getByText("1 USD ≈ 26.000 VND")).toBeVisible();
    await expect(page.locator(".asset-form button.primary")).toBeEnabled();
  });
});
