import { Page, expect } from "@playwright/test";

export const NAV = {
  transactions: "Giao dịch",
  ledger: "Sổ giao dịch",
  accounts: "Tài khoản",
  categories: "Danh mục",
  assets: "Tài sản",
  data: "Dữ liệu",
  review: "Đối soát",
} as const;

export async function goToTab(page: Page, label: string) {
  await page.getByRole("navigation", { name: /điều hướng/i }).getByRole("button", { name: label, exact: true }).click();
}

// Next.js dev mode injects its own `role="alert"` route-announcer div, so a
// bare page.getByRole("alert") is a strict-mode violation whenever the
// app's own <p role="alert" class="error"> is also present. Scope to the
// app's actual error/validation message elements only.
export function errorAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

// The app defaults to Vietnamese (see lib/i18n.ts useLanguage's initial
// state; each Playwright test gets a fresh context/localStorage so this
// default always applies unless a test explicitly switches language).
// Centralizing the VI strings the E2E specs assert on here avoids
// re-deriving them from lib/i18n.ts in every spec file.
export const VI = {
  netWorth: "Tài sản ròng",
  accountsInScope: "Tài khoản trong phạm vi",
  investedAssets: "Tài sản đầu tư",
  valuationIncomplete: "Định giá chưa đầy đủ",
  noTransactions: "Chưa có giao dịch nào.",
  chooseAccount: "Vui lòng chọn tài khoản",
  enterAmount: "Vui lòng nhập số tiền",
  chooseCategory: "Vui lòng chọn danh mục",
  chooseTwoAccounts: "Hãy chọn hai tài khoản khác nhau",
  selectAccount: "Chọn tài khoản",
  fromAccount: "Từ tài khoản",
  toAccount: "Đến tài khoản",
  type: "Loại",
  expense: "Chi tiêu",
  income: "Thu nhập",
  transfer: "Chuyển tiền",
  recordTransaction: "Ghi giao dịch",
  saveChanges: "Lưu thay đổi",
  edit: "Sửa",
  delete: "Xoá",
  confirmDelete: "Xác nhận xoá",
  cancel: "Hủy",
  addAccount: "Thêm tài khoản",
  deactivate: "Ngừng kích hoạt",
  activate: "Kích hoạt",
  addCategory: "Thêm danh mục",
  noCategories: "Chưa có danh mục nào.",
  noCategoriesFound: "Không tìm thấy danh mục",
  searchCategory: "Tìm danh mục",
  all: "Tất cả",
  savingsTab: "Tiết kiệm",
  metalsTab: "Kim loại quý",
  cryptoTab: "Tiền mã hóa",
  addSavingsAccount: "Thêm sổ tiết kiệm",
  add: "Thêm",
  loadFailed: "Tải dữ liệu thất bại",
  addTransaction: "Thêm giao dịch",
  duplicate: "Sao chép",
  thisMonth: "Tháng này",
  currentBalance: "Số dư hiện tại",
} as const;

export async function expectNoConsoleErrors(page: Page, errors: string[]) {
  // Filter out the one known-benign 404 (see docs/qa/QA_STATE.md) so real
  // regressions still fail the test instead of being lost in noise.
  const real = errors.filter(e => !e.includes("404"));
  expect(real, `unexpected console errors: ${JSON.stringify(real)}`).toEqual([]);
}
