# TASK-042 — Xem chi tiết, chỉnh sửa, xoá giao dịch; hiển thị hạng mục ở cấp nhỏ nhất

## Yêu cầu gốc

> chi tiết giao dịch sẽ hiển thị theo đúng danh mục chi tiêu ở level nhỏ
> nhất ví dụ ăn sáng (trong level ăn uống) tương đương với trường thông
> tin nhóm trong file dữ liệu moneylover; thiết kế thêm tính năng xem chi
> tiết, chỉnh sửa, xoá giao dịch

Hai phần trong cùng một yêu cầu: (1) khi xây dựng màn hình chi tiết giao
dịch, hạng mục phải hiển thị đúng ở cấp cụ thể nhất (ví dụ "Ăn sáng" nằm
trong "Ăn uống"), giống cách trường "Nhóm" trong Money Lover hoạt động;
(2) trước đây trang Giao dịch chỉ có thể *tạo* giao dịch mới — không có
cách nào xem chi tiết, sửa, hay xoá một giao dịch đã ghi. Cả hai được làm
cùng lúc vì (1) là yêu cầu thiết kế cho đúng màn hình chi tiết ở (2).

## Xem chi tiết — hạng mục hiển thị đúng cấp nhỏ nhất

`category_id` của một giao dịch vốn đã lưu đúng hạng mục cụ thể nhất
người dùng chọn (ví dụ "Ăn ngoài", không phải "Ăn uống" chung chung) —
điều này không đổi. Nhưng trước đây danh sách giao dịch chỉ hiển thị tên
hạng mục trơn, không có ngữ cảnh cấp cha, nên "Ăn ngoài" đứng một mình
không rõ nó thuộc nhóm "Ăn uống" nào. Modal chi tiết mới hiển thị đường
dẫn đầy đủ từ gốc tới lá bằng hàm mới `categoryPath()`
(`apps/web/lib/category-tree.ts`), ví dụ **"Ăn uống › Ăn ngoài"** — đúng
tinh thần ví dụ "ăn sáng (trong level ăn uống)" của yêu cầu. Dòng gọn
trong bảng Giao dịch vẫn giữ nguyên chỉ hiện tên hạng mục (không đổi, để
không làm rối danh sách), breadcrumb đầy đủ chỉ xuất hiện khi mở chi
tiết.

## Xem chi tiết, chỉnh sửa, xoá giao dịch

### Xem chi tiết

Bấm vào một dòng bất kỳ trong bảng Giao dịch (chuột hoặc bàn phím
Enter/Space) mở modal hiển thị đầy đủ: ngày, loại, hạng mục (đường dẫn
đầy đủ như trên), người nhận, chuyến đi/sự kiện, ghi chú, và từng dòng
tài khoản kèm số tiền.

### Phạm vi được phép sửa/xoá — vì sao không phải mọi loại giao dịch

Modal chỉ hiện nút Sửa/Xoá cho đúng 4 loại giao dịch mà composer trang
Giao dịch tự tạo ra: **Chi tiêu, Thu nhập, Chuyển tiền, Thanh toán thẻ
tín dụng** (`composerEventTypes` — đã có sẵn từ trước, dùng để giới hạn
composer). Các loại còn lại — Điều chỉnh số dư, Tiền lãi, Gửi/Rút tiết
kiệm, Mua/Bán tài sản — do các trang khác (Tài khoản, Tiết kiệm, Tài sản)
tự sinh ra và **đồng bộ hoá dữ liệu riêng của chúng** cùng lúc (ví dụ:
tất toán một sổ tiết kiệm ghi luôn `actual_interest_scaled` lên chính sổ
đó, tách biệt khỏi giao dịch sổ cái). Nếu cho sửa/xoá các giao dịch này
qua màn hình chung này mà không đi qua đúng luồng nghiệp vụ đã sinh ra
chúng, dữ liệu của trang kia sẽ lệch khỏi sổ cái — đúng kiểu sai số tiền
mà kiến trúc ứng dụng luôn tránh tuyệt đối. Modal hiển thị ghi chú giải
thích và không có nút Sửa/Xoá cho các loại này.

Ranh giới này được chặn **ở cả hai tầng**, không chỉ ẩn nút trên giao
diện: backend (`EDITABLE_EVENT_TYPES` trong `app/services/ledger.py`) từ
chối sửa/xoá các loại bị bảo vệ bằng lỗi `ProtectedEventTypeError` (HTTP
409), vì phía máy khách không phải là ranh giới tin cậy — ai đó gọi thẳng
API cũng bị chặn như nhau.

### Chỉnh sửa

Bấm "Sửa" trong modal chi tiết đóng modal lại và điền sẵn form composer
(cùng một form dùng để tạo giao dịch mới) với dữ liệu hiện có — tài
khoản, số tiền, hạng mục, ngày, người nhận/chuyến đi/ghi chú nếu có. Với
Chuyển tiền/Thanh toán thẻ, chiều "từ"/"đến" được xác định lại đúng theo
dấu số tiền của từng dòng (âm = từ, dương = đến). Sửa xong bấm "Lưu thay
đổi" gửi `PATCH /financial-events/{id}` (thay toàn bộ, giống hệt luồng
tạo mới, không phải vá từng trường) — ràng buộc dữ liệu đầy đủ từ
TASK-041 (bắt buộc tài khoản/số tiền/hạng mục) áp dụng y hệt khi sửa vì
dùng chung một `submit()`. Có nút "Hủy" để thoát sửa mà không lưu.

### Xoá

Bấm "Xoá" trong modal yêu cầu bấm thêm lần "Xác nhận xoá" mới thực sự xoá
(không xoá ngay từ một cú bấm, vì đây là dữ liệu tài chính thật) — gửi
`DELETE /financial-events/{id}`.

## Hai lỗi backend phát hiện khi kiểm thử đầu-cuối (không phải chỉ đoán trước)

- **Xoá một giao dịch có nhiều dòng tài khoản (`account_entries`) sẽ vi
  phạm ràng buộc khoá ngoại**: ứng dụng luôn bật `PRAGMA foreign_keys=ON`,
  nên `DELETE FROM financial_events` trong khi vẫn còn dòng
  `account_entries` tham chiếu tới sẽ bị chặn — y hệt kiểu lỗi migration
  đã gặp ở TASK-040, chỉ khác là lần này xảy ra ngay ở logic xoá bình
  thường, không phải migration. Sửa bằng cách thêm
  `cascade="all, delete-orphan"` vào quan hệ `FinancialEvent.entries`
  (`app/models/ledger.py`) — SQLAlchemy tự xoá các dòng con trước, đúng
  thứ tự ràng buộc khoá ngoại yêu cầu. Đã kiểm chứng trực tiếp bằng test
  chạy trên schema thật (không phải mock) với `PRAGMA foreign_keys=ON`
  bật, xoá một giao dịch Thanh toán thẻ tín dụng (2 dòng tài khoản) và
  xác nhận `PRAGMA foreign_key_check` sạch sau khi xoá.
- **CORS chưa cho phép method DELETE**: `app/main.py`'s
  `allow_methods` chỉ có `GET, POST, PATCH, OPTIONS` — thiếu `DELETE` thì
  trình duyệt chặn ngay từ bước preflight, nút Xoá sẽ báo lỗi CORS khó
  hiểu chứ không chạm được tới server. Lỗi này giống hệt kiểu lỗi thiếu
  header `X-Filename` đã gặp ở TASK-038 — chỉ phát hiện được khi kiểm thử
  đầu-cuối bằng trình duyệt thật (Playwright), không lộ ra ở test backend
  thuần túy vì test đó gọi thẳng hàm Python, không qua trình duyệt/CORS.

## Kiểm thử

- Backend: 21 test mới cho `update_financial_event`/`delete_financial_event`
  chạy trên schema thật (Alembic, không mock) — sửa Chi tiêu (đổi tài
  khoản/số tiền/hạng mục, xác nhận dòng cũ thực sự biến mất khỏi bảng
  `account_entries`), sửa Chuyển tiền (thay cả hai dòng, không còn dòng
  thừa), sự kiện/tài khoản không tồn tại, entries không hợp lệ, và đặc
  biệt: xoá một giao dịch Thanh toán thẻ tín dụng dưới ràng buộc khoá
  ngoại thật — đúng phần lõi rủi ro nhất của tính năng này. Cộng 9 loại
  bị bảo vệ (Điều chỉnh, Tiền lãi, Gửi/Rút tiết kiệm, Mua/Bán tài sản) bị
  từ chối sửa/xoá đúng như thiết kế. Cộng 8 test API mới (map lỗi sang
  404/400/409 đúng). 281/281 test pytest pass, `ruff check` và `mypy`
  sạch.
- Frontend: `npm run typecheck`, `npm run lint` sạch. 16/16 audit trước
  đó không đổi. Audit mới `task042-transaction-detail-edit-delete-audit.mjs`
  khoá lại: breadcrumb hạng mục, phạm vi sửa/xoá đúng 4 loại ở cả frontend
  lẫn backend, cascade xoá an toàn, CORS cho phép DELETE, i18n — tự kiểm
  chứng bằng cách tạm phá lại bản vá CORS và bản vá cascade, xác nhận
  audit bắt được cả hai, rồi khôi phục.
- **Kiểm thử đầu-cuối bằng Playwright** (DB nháp riêng): ghi một giao
  dịch Chi tiêu với hạng mục lá thật sự lồng 3 cấp (Chi tiêu › Ăn uống ›
  Ăn ngoài) → mở chi tiết, xác nhận hiển thị đúng breadcrumb "Ăn uống ›
  Ăn ngoài" → mở chi tiết một giao dịch Điều chỉnh số dư, xác nhận không
  có nút Sửa và có ghi chú giải thích → sửa giao dịch Chi tiêu (đổi số
  tiền), xác nhận số giao dịch không đổi (không tạo thêm bản ghi mới) và
  số tiền mới thực sự được lưu → bấm Hủy giữa chừng khi đang sửa, xác
  nhận form quay lại trạng thái tạo mới → xoá giao dịch, xác nhận yêu cầu
  bấm xác nhận lần hai và số giao dịch giảm đúng 1 → ghi một giao dịch
  Chuyển tiền, sửa đổi chiều (đổi tài khoản nguồn/đích) và số tiền, xác
  nhận cả hai dòng tài khoản được cập nhật đúng chiều mới, không còn dòng
  cũ sót lại. Không có lỗi console trong suốt toàn bộ kịch bản.
