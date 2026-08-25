# Function Matrix — Personal Finance QA

Phạm vi: toàn bộ ứng dụng **trừ Ngân sách** (loại trừ theo yêu cầu). Trạng thái được xác nhận qua Playwright E2E (`apps/web/e2e/`, chạy trên `finance.test.db`), pytest backend (283 test), và đối soát dữ liệu thật chỉ-đọc (xem `QA_STATE.md`).

| # | Chức năng | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | Dashboard (Tài sản: net worth, accounts in scope, invested assets) | Pass | `e2e/01-dashboard.spec.ts`, đối soát SQL độc lập ở Giai đoạn C |
| 2 | Thêm giao dịch Thu nhập (INCOME) | Pass | `e2e/03-transactions-crud.spec.ts` (kiểm cả dấu (+) qua API) |
| 3 | Thêm giao dịch Chi tiêu (EXPENSE) | Pass | `e2e/03-transactions-crud.spec.ts` (kiểm cả dấu (–) qua API) |
| 4 | Sửa giao dịch | Pass | `e2e/03-transactions-crud.spec.ts` |
| 5 | Xoá giao dịch | Pass | `e2e/03-transactions-crud.spec.ts` |
| 6 | Tìm kiếm/lọc/sắp xếp/phân trang giao dịch | N/A | Không có UI này trên màn hình Giao dịch (đã xác nhận qua đọc mã nguồn `page.tsx`, không có ô tìm kiếm/bộ lọc/nút sắp xếp/phân trang nào) |
| 7 | Đổi kỳ báo cáo (report period) | N/A | Không tồn tại màn hình/route nào tính "tổng theo khoảng thời gian" trong toàn bộ ứng dụng |
| 8a | CRUD Tài khoản (thêm/sửa/deactivate–reactivate) | Pass | `e2e/04-accounts-crud.spec.ts`. Tài khoản không có xoá cứng theo thiết kế (chỉ deactivate), không phải bug |
| 8b | CRUD Danh mục (thêm/sửa/deactivate–reactivate/tìm kiếm/lọc nhóm) | Pass | `e2e/05-categories-crud.spec.ts`. Danh mục cũng không có xoá cứng theo thiết kế |
| 9a | Thêm tài sản: Kim loại quý | Pass | `e2e/06-assets-crud.spec.ts` |
| 9b | Thêm/Sửa tài sản: Tiết kiệm (savings) | Pass | `e2e/06-assets-crud.spec.ts` |
| 9c | Sửa/Xoá tài sản: Kim loại quý / Crypto | N/A | Không có UI sửa/xoá cho 2 loại này (`AssetSection` chỉ hiển thị đọc, xác nhận qua đọc mã nguồn) — chỉ Tiết kiệm có form sửa đầy đủ |
| 10 | Khoản nợ (Debt) như một entity riêng | N/A | Không tồn tại — chỉ có category "Trả nợ/Cho vay" trong cây danh mục |
| 11 | Net worth / Tài sản ròng | Pass | Đối soát SQL độc lập ở Giai đoạn C khớp công thức backend (40,621,642đ tại thời điểm đối soát) |
| 12 | Trạng thái rỗng (empty state) | Pass | `e2e/02-transactions-validation.spec.ts` ("Chưa có giao dịch nào.") |
| 13 | Validate form (bắt buộc tài khoản/số tiền/danh mục, 2 tài khoản khác nhau khi Transfer) | Pass | `e2e/02-transactions-validation.spec.ts` |
| 14 | Xử lý lỗi API / mất kết nối | Pass | `e2e/07-api-error.spec.ts` — hiển thị "Tải dữ liệu thất bại"; nút submit disable khi mutation đang chờ |
| 15 | Lưu trữ bền vững sau khi reload trang | Pass | `e2e/03-transactions-crud.spec.ts` |
| 16 | Điều hướng mobile (390px) | Pass | `e2e/08-mobile-nav.spec.ts` |
| 17 | Responsive 768/1366/1440px (Dashboard, Giao dịch + modal chi tiết) | Pass | `e2e/09-responsive.spec.ts` |
| 18 | Import/Đối soát (Money Lover, export CSV/XLSX) | Không kiểm thử sâu | Nằm trong phạm vi nhưng không có trong 16 luồng bắt buộc của prompt; route tồn tại và có test backend sẵn (không phát hiện regression trong pytest 283/283) |
| — | Ngân sách (Budget) | Loại trừ theo yêu cầu | Không kiểm thử, không sửa — xác nhận không có route/model Budget nào tồn tại trong backend |

**Tổng kết đếm**: Pass 16 · Fail 0 · Blocked 0 · N/A 5 (đã xác nhận có căn cứ mã nguồn, không phải bug) · Loại trừ theo yêu cầu 1 (Budget).
