# TASK-041 — Ràng buộc dữ liệu bắt buộc khi ghi nhận Chi tiêu/Thu nhập

## Yêu cầu gốc

> ràng buộc dữ liệu cho việc nhập chi tiêu, phải đầy đủ số tiền, ngày
> tháng, loại chi tiêu

## Vấn đề

Ở form ghi giao dịch một-dòng (composer chính, dùng cho Chi tiêu/Thu
nhập), ba trường lẽ ra phải có đều có thể bị bỏ trống mà không có cảnh
báo gì:

- **Tài khoản**: `AccountRow` là một popover tự viết (không phải
  `<select>` gốc), nên HTML `required` không áp dụng được. Nếu bấm "Ghi
  giao dịch" mà chưa chọn ví, `submit()` gửi thẳng `account_id: 0` lên
  server — server từ chối vì vi phạm khoá ngoại, nhưng hiển thị ra một lỗi
  kỹ thuật khó hiểu, không phải một thông báo rõ ràng cho người dùng.
- **Số tiền**: input số tiền không có `required`, nên có thể bỏ trống và
  gửi lên như đã sạch.
- **Hạng mục**: `CategoryPicker` cũng là popover tự viết, cùng lý do
  không có HTML `required`. Bỏ trống thì giao dịch vẫn được ghi bình
  thường nhưng không có hạng mục — không có cảnh báo, dễ quên mà không
  hay biết.

Riêng **ngày tháng đã luôn được đảm bảo có sẵn** từ trước — `dateRow`'s
`onChange` luôn có giá trị mặc định là hôm nay khi không chọn gì khác —
nên không cần thêm kiểm tra mới cho trường này.

## Vì sao ràng buộc này chỉ ở giao diện, không phải ở backend

Hạng mục (`category_id`) ở schema `FinancialEventCreate` **phải tiếp tục
để tùy chọn** (`int | None = None`) ở tầng API/backend — không được đổi
thành bắt buộc ở đó. Lý do: tính năng "đưa thẳng vào sổ giao dịch" vừa
hoàn thành ở TASK-040 (`moneylover_apply.py`) chủ động tạo ra giao dịch
Chi tiêu/Thu nhập **không có hạng mục** một cách hợp lệ, cho các dòng
Money Lover không khớp được với bất kỳ hạng mục chuẩn nào (115/212 dòng
thật của người dùng rơi vào trường hợp này). Nếu bắt buộc hạng mục ở tầng
backend, tính năng auto-apply vừa mới đưa vào sản xuất sẽ bị hỏng ngay.

Vì vậy ràng buộc "đầy đủ dữ liệu" của yêu cầu này được hiểu là: **khi
người dùng tự tay ghi một giao dịch qua form**, chứ không phải mọi giao
dịch trong hệ thống nói chung (giao dịch tạo tự động từ import là một
đường đi khác, có lý do riêng để cho phép thiếu hạng mục). Ràng buộc được
cài đặt hoàn toàn ở tầng giao diện (`submit()` trong `Transactions()`),
không đụng gì tới schema hay endpoint backend.

## Thiết kế

Thêm ba kiểm tra vào đầu `submit()`, chỉ áp dụng cho `type === "EXPENSE"`
hoặc `type === "INCOME"` (TRANSFER/CREDIT_CARD_PAYMENT không có khái niệm
hạng mục, đã có kiểm tra cặp-tài-khoản riêng từ trước):

1. Chưa chọn tài khoản → chặn lại, báo "Vui lòng chọn tài khoản".
2. Số tiền trống (sau khi trim) → chặn lại, báo "Vui lòng nhập số tiền".
3. Chưa chọn hạng mục, **nhưng chỉ khi có hạng mục để chọn**
   (`validCategories.length > 0`) → chặn lại, báo "Vui lòng chọn danh
   mục". Điều kiện `validCategories.length > 0` là chủ đích: nếu bắt buộc
   vô điều kiện, một người dùng đã tắt hết mọi hạng mục sẽ bị khoá hoàn
   toàn, không ghi được giao dịch nào nữa — một kiểu deadlock không đáng
   có. Giữ nguyên hành vi cũ (cho phép không hạng mục) cho trường hợp
   hiếm này.

State lỗi trước đây tên `pairError` (chỉ dùng cho kiểm tra cặp tài khoản
của TRANSFER/CREDIT_CARD_PAYMENT) được đổi tên thành `formError` cho đúng
với phạm vi rộng hơn bây giờ, và thêm một vị trí hiển thị lỗi mới trong
nhánh giao diện Chi tiêu/Thu nhập (trước đây nhánh này chưa từng hiển thị
lỗi gì).

## Kiểm thử

- Frontend: `npm run typecheck`, `npm run lint` sạch. 14/14 audit trước
  đó không đổi. Audit mới `task041-expense-data-required-audit.mjs` khoá
  lại: ba kiểm tra mới đúng phạm vi Chi tiêu/Thu nhập, kiểm tra hạng mục
  vẫn có điều kiện `validCategories.length > 0`, lỗi hiển thị đúng nhánh
  giao diện, `formError` được xoá ở đầu mỗi lần submit, đủ bản dịch tiếng
  Anh/Việt, và không còn sót tên biến cũ `pairError` ở đâu trong file.
- **Kiểm thử đầu-cuối bằng Playwright** (DB nháp riêng, đã seed đủ 69
  hạng mục mặc định + 1 tài khoản ZaloPay, để bài test thật sự đi qua
  đúng nhánh có hạng mục để chọn):
  1. Điền số tiền, bỏ trống tài khoản, bấm "Ghi giao dịch" → hiện lỗi
     "Vui lòng chọn tài khoản", **0 giao dịch** được tạo.
  2. Chọn tài khoản, bỏ trống hạng mục, bấm lại → hiện lỗi "Vui lòng chọn
     danh mục", vẫn **0 giao dịch** được tạo.
  3. Điền đủ tài khoản + số tiền + hạng mục, bấm lại → ghi thành công,
     giao dịch tạo ra có `category_id` thật sự được gán (không phải
     `null`) — xác nhận ràng buộc mới không chặn nhầm một lần ghi hợp lệ.
  4. Kiểm tra hồi quy: chuyển sang Chuyển tiền, không chọn đủ hai tài
     khoản, bấm "Ghi giao dịch" → vẫn hiện đúng lỗi "Hãy chọn hai tài
     khoản khác nhau" như trước khi đổi tên `pairError` → `formError`.

     Không có lỗi console trong suốt 4 bước.
- Trong lúc dựng bài test, phát hiện DB nháp ban đầu chưa seed hạng mục
  nào (seed mặc định không tự chạy, phải gọi lệnh CLI riêng) khiến bước 2
  "giả vờ pass" (vì `validCategories.length === 0` nên đúng-theo-thiết-kế
  bỏ qua kiểm tra hạng mục) — không phải lỗi của tính năng, mà là bài test
  chưa mô phỏng đúng điều kiện thật. Đã sửa lại việc dựng DB nháp (chạy
  migration đủ + seed hạng mục mặc định) rồi chạy lại, cả 4 bước đều đúng
  như mô tả ở trên.
- Nhân tiện phát hiện (nhưng **chưa sửa**, ngoài phạm vi yêu cầu này) một
  lỗi i18n có sẵn từ trước: cột "Chi tiết" ở bảng Giao dịch dùng
  `tr("None")` khi không có ghi chú/người nhận/chuyến đi, nhưng bản dịch
  tiếng Việt của `"None"` ở một chỗ khác trong file (dùng cho bộ chọn
  hạng mục cha) vô tình đè lên, khiến cột này hiển thị nhầm "Không có
  danh mục cha" thay vì "Không có". Không liên quan tới yêu cầu hiện tại
  nên để nguyên, chưa đụng vào.
