# Test Report — Personal Finance QA

## Tóm tắt
- Backend: **283/283 pytest PASS** (281 baseline + 2 mới: sign-validation, purity-validation), `ruff check .` sạch, `mypy app` sạch.
- Frontend: `npm run lint` sạch, `tsc --noEmit` sạch, `npm run build` thành công (production build).
- E2E (Playwright, mới bootstrap trong task này): **33/33 PASS** trên `data/finance.test.db` (DB test riêng, không đụng DB thật).
- DB thật (`data/finance.db`): checksum `e5ddd2645798daafd672800e33937520a0a828797986ffc6048c38a823534f6c` xác nhận **không đổi** trước/sau toàn bộ quá trình QA.

## Lệnh đã chạy

Backend (cloud workspace, KHÔNG chạy trên máy người dùng vì `.venv` ở đó không hoạt động — shebang trỏ path macOS gốc):
```
cd apps/api && source .venv/bin/activate
export PF_DATABASE_PATH=<path>/data/finance.test.db
.venv/bin/ruff check .
.venv/bin/mypy app
.venv/bin/pytest -q
```
Kết quả: `283 passed`, ruff/mypy đều "All checks passed" / "no issues found".

Frontend:
```
cd apps/web
npm run lint        # eslint --max-warnings=0 -> sạch
npx tsc --noEmit     # sạch
npm run build        # next build -> thành công, 3 route static
```

E2E (Playwright, DB test reset sạch trước lần chạy cuối: xoá `finance.test.db` → `alembic upgrade head` → seed 69 category → tạo lại 2 account `E2E Cash`/`E2E Bank`):
```
cd apps/web
npx playwright test --reporter=list
```
Kết quả lần chạy cuối (DB sạch): **33 passed** trong 1.5 phút, 0 failed, 0 skipped.

## Danh sách 9 file E2E (33 test)
| File | Số test | Luồng bao phủ |
|---|---|---|
| `00-smoke.spec.ts` | 1 | Smoke: load app, đủ 6 tab |
| `01-dashboard.spec.ts` | 1 | #1 Dashboard/net worth |
| `02-transactions-validation.spec.ts` | 4 | #12 empty state, #13 validate |
| `03-transactions-crud.spec.ts` | 5 | #2,#3,#4,#5,#15 |
| `04-accounts-crud.spec.ts` | 3 | #8 CRUD tài khoản |
| `05-categories-crud.spec.ts` | 5 | #8 CRUD danh mục + search/filter |
| `06-assets-crud.spec.ts` | 3 | #9 CRUD tài sản (metal, savings) |
| `07-api-error.spec.ts` | 3 | #14 lỗi API/mất kết nối |
| `08-mobile-nav.spec.ts` | 2 | #16 mobile nav, 390px |
| `09-responsive.spec.ts` | 6 | Responsive 768/1366/1440px |

## Đối soát dữ liệu (Giai đoạn C, chỉ đọc DB thật)
Xem chi tiết đầy đủ trong `QA_STATE.md`. Tóm tắt: 0 vi phạm FK/orphan, 0 vi phạm cân bằng TRANSFER/CREDIT_CARD_PAYMENT/ADJUSTMENT/SAVINGS_DEPOSIT, 1 bản ghi EXPENSE có dấu sai (đã báo cáo, không tự sửa dữ liệu — xem `BUG_FIX_REPORT.md` Bug #1). Đối soát net worth bằng SQL độc lập khớp công thức `portfolio.calculate_net_worth`.

## Giới hạn đã biết
- Không kiểm thử sâu route Import/Đối soát Money Lover và Export CSV/XLSX qua E2E (nằm ngoài 16 luồng bắt buộc của prompt); có test backend sẵn từ trước, không phát hiện regression.
- Không visual-regression (screenshot pixel-diff) — theo đúng hướng dẫn của prompt, ưu tiên DOM assertion + kiểm tra overflow/kích thước phần tử.
- Test E2E của Xoá tài khoản/danh mục thực chất là Deactivate vì ứng dụng không có xoá cứng cho 2 entity này (theo thiết kế, xác nhận qua đọc mã nguồn — không phải giới hạn của việc kiểm thử).
