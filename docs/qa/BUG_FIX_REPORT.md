# Bug Fix Report — Personal Finance QA

Không đụng phân hệ Ngân sách trong bất kỳ sửa lỗi nào dưới đây. Mọi sửa lỗi đều tối thiểu, không đổi business logic (chỉ thêm ràng buộc/validate/hiển thị lỗi đúng theo behavior đã có), có regression test kèm theo.

## Bug #1 — EXPENSE/INCOME không được validate dấu tiền phía server
- **Phát hiện**: Giai đoạn C, đối soát dữ liệu thật (chỉ đọc). 1 bản ghi thật: event id=2, ngày 2026-08-25, danh mục "Coffee & Drinks", tài khoản "Zalopay", `amount_scaled=+400000000` (đáng lẽ âm vì là EXPENSE).
- **Nguyên nhân gốc**: `_build_and_validate_entries` (`apps/api/app/services/ledger.py`) không hề kiểm tra dấu tiền cho EXPENSE/INCOME đơn-bút-toán — chỉ tin dấu do client gửi lên. Phía frontend (`negateMoney`/`submit()` trong `page.tsx`) logic đúng, không tìm được đường nào qua UI hiện tại tạo ra bản ghi sai dấu — nghi ngờ đến từ lần gọi API/thao tác cũ trước khi ràng buộc composer hiện tại tồn tại.
- **Sửa**: Thêm `_validate_signed_amount()` trong `ledger.py`, gọi cho `EXPENSE`/`INCOME`: EXPENSE bắt buộc âm, INCOME bắt buộc dương, cả hai từ chối giá trị 0. Vi phạm → `InvalidEventEntriesError` → HTTP 400 (route đã map sẵn, không cần đổi route).
- **Dữ liệu thật**: **KHÔNG tự sửa** bản ghi id=2 theo đúng quy tắc của nhiệm vụ — chỉ báo cáo. Người dùng cần tự quyết định sửa thủ công hoặc để nguyên làm lịch sử.
- **File đổi**: `apps/api/app/services/ledger.py`, `apps/api/tests/test_ledger_service.py` (fixture cũ dùng amount dương cho EXPENSE được sửa lại cho đúng hành vi mới; thêm test `test_expense_and_income_reject_wrong_sign_and_zero`).
- **Verify**: `pytest tests/test_ledger_service.py` + full suite 282/282 (tại thời điểm đó) PASS, `ruff`/`mypy` sạch.

## Bug #2 — CategoryPicker/ParentPicker: danh mục khớp tìm kiếm hoặc đổi loại giao dịch không hiển thị
- **Phát hiện**: Viết E2E cho luồng #2/#3 (thêm giao dịch Thu nhập/Chi tiêu có chọn danh mục) — chọn danh mục "Lương" (con của "Thu nhập") sau khi đổi Type sang Thu nhập bị treo, và tìm "Cà phê" (cháu 3 cấp của "Chi tiêu") không hiện dù khớp tìm kiếm.
- **Nguyên nhân gốc**: state `expanded` (danh mục nào đang mở) của cả `CategoryPicker` (composer giao dịch) và `ParentPicker` (form danh mục) chỉ tính 1 lần lúc mount, không cập nhật khi đổi Type hoặc khi gõ tìm kiếm — `filterCategoryTree` đã lọc đúng ra node khớp + tổ tiên, nhưng bộ lọc hiển thị phía sau vẫn ẩn node nếu tổ tiên chưa từng được mở tay.
- **Sửa**:
  - `CategoryPicker`: thêm `key={type}` khi dùng trong composer để remount khi đổi loại giao dịch, đưa `expanded` về đúng root mới.
  - Cả `CategoryPicker` và `ParentPicker`: sửa điều kiện lọc `visible` — khi có `query` (đang tìm kiếm), bỏ qua điều kiện `expanded.has(...)`, hiển thị mọi node mà `filterCategoryTree` đã giữ lại (giống cách trang Danh mục chính đã làm đúng với `open = search ? true : expanded.has(...)`).
- **File đổi**: `apps/web/app/page.tsx`.
- **Verify**: `e2e/03-transactions-crud.spec.ts`, `e2e/05-categories-crud.spec.ts` (test "search box filters the category tree"), `e2e/07-api-error.spec.ts` — tất cả PASS. `tsc --noEmit`, `npm run lint`, `npm run build` sạch.

## Bug #3 — Form thêm Kim loại quý/Crypto không hiển thị lỗi khi submit bị từ chối
- **Phát hiện**: Cùng lúc với Bug #4 — submit form Kim loại quý bị backend từ chối (500, xem Bug #4) nhưng UI không phản hồi gì, nút bấm "im lặng".
- **Nguyên nhân gốc**: `Assets()` trong `page.tsx` không render `<Error error={...}/>` cho 2 form `metals`/`crypto` (form khác trong cùng file đều có).
- **Sửa**: Thêm `<Error error={metal.error}/>` và `<Error error={crypto.error}/>` vào 2 form tương ứng. Đồng thời sửa placeholder trường "Purity" thành ví dụ cụ thể "0.999" (trước đó chỉ là nhãn trống, dễ gây hiểu lầm — xem Bug #4).
- **File đổi**: `apps/web/app/page.tsx`.
- **Verify**: `e2e/06-assets-crud.spec.ts` PASS (test giờ có thể thấy lỗi rõ ràng nếu submit bị từ chối).

## Bug #4 — `POST /api/v1/assets/metals` crash 500 khi `purity` ngoài khoảng hợp lệ
- **Phát hiện**: Viết E2E cho luồng #9 (thêm tài sản Kim loại quý) — nhập độ tinh khiết theo cách viết tự nhiên tiếng Việt "999" (vàng 999) làm request trả về `500 Internal Server Error` thay vì lỗi validate rõ ràng.
- **Nguyên nhân gốc**: `purity` được lưu dưới dạng phân số (0,1] (`purity_scaled = purity × 10000`, ràng buộc CHECK `ck_precious_holding_purity_range` trong DB yêu cầu `0 < purity_scaled <= 10000`, tức `purity` phải ≤ 1) nhưng API không validate trước khi ghi — giá trị "999" tạo `purity_scaled = 9990000`, vi phạm CHECK constraint, ném `IntegrityError` không được bắt → 500 không rõ nghĩa.
- **Sửa**: Thêm `@field_validator("purity")` trong `MetalCreate` (`apps/api/app/api/assets.py`), bắt buộc `0 < purity <= 1`, trả `ValueError` → FastAPI tự chuyển thành `422` kèm thông báo rõ ràng. Không đổi ý nghĩa dữ liệu (không đổi những gì là giá trị hợp lệ), chỉ chặn sớm giá trị không hợp lệ bằng lỗi sạch thay vì để crash.
- **File đổi**: `apps/api/app/api/assets.py`, `apps/api/tests/test_assets_api.py` (thêm `test_create_metal_rejects_purity_outside_unit_range`).
- **Verify**: `pytest tests/test_assets_api.py tests/test_precious_metals.py` (6+15 passed), full suite backend 283/283, `ruff`/`mypy` sạch, `e2e/06-assets-crud.spec.ts` PASS.

## Tổng kết
4 bug được phát hiện và sửa (1 ở Giai đoạn C đối soát dữ liệu, 3 phát hiện khi viết/chạy E2E ở Giai đoạn D). Không có bug nào liên quan đến Ngân sách (đúng phạm vi loại trừ). Không có dữ liệu thật nào bị chỉnh sửa trong quá trình sửa lỗi hay kiểm thử.
