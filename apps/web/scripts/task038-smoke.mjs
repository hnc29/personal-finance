import { readFileSync } from "node:fs";
import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";

const FILE_PATH = "/mnt/user-data/uploads/Downloads/MoneyLover_Tổng cộng(Wallet)_Tất cả(Category)_01_07_2026-31_07_2026.xlsx";
const REAL_FILENAME = "MoneyLover_Tổng cộng(Wallet)_Tất cả(Category)_01_07_2026-31_07_2026.xlsx";

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("pageerror", err => consoleErrors.push(`pageerror: ${err.message}`));
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`); });

await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
// The app defaults to Vietnamese (lib/i18n.ts useLanguage initial state) --
// use the real default-locale labels, matching what the reporting user
// actually sees. Nav buttons are CSS text-transform:capitalize'd, which
// Chromium folds into the computed accessible name ("Dữ Liệu"), so match
// case-insensitively against the underlying DOM text ("Dữ liệu").
await page.getByRole("button", { name: /^dữ liệu$/i }).click();
await page.getByText("Nhập từ Money Lover").waitFor();

const fileInput = page.getByLabel("Chọn tệp");
// setInputFiles(path) derives the browser-side File.name from the OS path's
// basename via CDP, which mishandles this particular non-ASCII filename (a
// Playwright/CDP quirk, unrelated to the app) -- passing an explicit
// {name, buffer} object instead sets File.name to the exact real filename
// regardless of how it's staged on disk, which is what actually matters for
// reproducing the reported bug (the bug is about the filename reaching the
// browser's File object, not about the disk path).
await fileInput.setInputFiles({
  name: REAL_FILENAME,
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: readFileSync(FILE_PATH),
});

const uploadButton = page.getByRole("button", { name: "Tải lên để xem xét" });
await uploadButton.click();

// The fix shows an immediate "Uploading..." status/button state, then a
// final status once the request resolves -- wait for the final one.
await page.waitForFunction(() => {
  const el = document.querySelector('[role="status"]');
  // The in-flight status is the Vietnamese "Đang tải lên..." (not the
  // English literal "Uploading..."), since the app defaults to vi.
  return el && el.textContent && el.textContent !== "Đang tải lên...";
}, { timeout: 15000 });

const statusText = await page.locator('[role="status"]').textContent();
console.log("STATUS_TEXT:", statusText);
console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors));

await browser.close();

if (!statusText || !statusText.includes("Dòng đã nhập")) {
  console.error("FAIL: expected a 'Dòng đã nhập' (Imported rows) success status, got:", statusText);
  process.exit(1);
}
console.log("TASK-038 smoke test PASSED: real Money Lover filename with Vietnamese diacritics uploaded successfully via the UI.");
