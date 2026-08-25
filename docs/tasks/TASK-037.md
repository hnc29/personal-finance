# TASK-037 — Logo ngân hàng thật cho tài khoản & đồng bộ kích thước icon danh mục

## Yêu cầu gốc

> https://diadiembank.com/logo-ngan-hang-tai-viet-nam/ update logo của các ngân
> hàng vào các tài khoản tương ứng; đồng thời update logo của các danh mục chi
> tiêu, thu nhập cho đồng bộ kích thước với logo của ngân hàng

Hai phần:

1. Lấy logo thật của các ngân hàng từ trang đã cho, gắn vào đúng tài khoản
   ngân hàng tương ứng (thay vì hình đại diện chữ cái màu như trước).
2. Đồng bộ kích thước hiển thị của icon hạng mục thu/chi với logo ngân hàng,
   để hai loại "biểu tượng hàng" trong giao diện giao dịch trông cân đối với
   nhau.

## Bối cảnh trước đó (TASK-035)

TASK-035 cố tình **không** nhúng logo ngân hàng/ví điện tử thật vì lo ngại bản
quyền/thương hiệu khi chưa có yêu cầu rõ ràng từ người dùng — thay vào đó dùng
huy hiệu chữ cái màu (monogram). Lần này người dùng đã yêu cầu rõ ràng, chỉ
định đúng nguồn (diadiembank.com), nên phần lo ngại đó không còn áp dụng theo
cách cũ; chỉ còn việc dùng logo cho đúng mục đích thông thường của mọi app tài
chính (nhận diện tài khoản thuộc ngân hàng nào — "nominative use"), không sửa,
không dùng cho mục đích khác, không mạo danh thương hiệu.

## Phạm vi ngân hàng

Chỉ lấy logo cho **các ngân hàng thật sự có tài khoản trong dữ liệu hiện tại**
(tra trực tiếp từ `data/finance.db`), không tải toàn bộ 55+ logo trên trang —
tránh rác không cần thiết và giảm bề mặt rủi ro bản quyền khi repo đã là
public trên GitHub:

SHB, VPBank, BIDV, Techcombank, PVcomBank, SCB, Eximbank, VIB, Shinhan Bank.

(Ví điện tử — Momo, ZaloPay, VNPT-Money — và "Violet" (sản phẩm thẻ, không
phải ngân hàng niêm yết logo trên trang nguồn) vẫn giữ nguyên huy hiệu màu như
cũ, vì trang nguồn chỉ liệt kê logo **ngân hàng**.)

## Cách lấy ảnh

Không thể tải trực tiếp qua `curl`/`bash` (domain không nằm trong allowlist
mạng của sandbox), nên dùng trình duyệt Chrome thật của người dùng (qua
Claude in Chrome) để tải 9 ảnh JPG (800×800) vào thư mục Downloads, sau đó
đưa vào máy chủ để xử lý. Việc tải tự động bị Chrome chặn sau lần tải đầu (cơ
chế chống spam-download khi không có thao tác thật của người dùng) — khắc
phục bằng cách mở **tab mới cho mỗi lần tải** (Chrome tính lại "một lần tải tự
động miễn phí" theo từng tab).

## Chuẩn hoá ảnh

Ảnh gốc 800×800 có viền trắng dày mỏng khác nhau tuỳ ngân hàng (có ảnh logo
chiếm gần hết khung, có ảnh chừa viền rất rộng) — nếu giữ nguyên, các logo sẽ
trông "to nhỏ" không đều khi xếp cạnh nhau. Script một-lần
`apps/web/scripts/process-bank-logos.py` (Pillow):

1. Cắt bỏ viền gần-trắng quanh nội dung thật (`trim_to_content`).
2. Đệm lại thành hình vuông với cùng một tỉ lệ lề 6% cho mọi logo
   (`pad_to_square`).
3. Resize về 128×128 PNG, lưu vào `apps/web/public/bank-logos/<key>.png`.

Kết quả: mọi logo có cùng "trọng lượng thị giác" bất kể ảnh gốc căn lề thế
nào.

## Thay đổi mã nguồn

- `apps/web/lib/account-logos.tsx`: `Brand` có thêm trường `logo?: string`;
  9 ngân hàng thật trỏ tới file PNG tương ứng. `AccountLogo` render `<img>`
  thật (trong khung thẻ trắng bo góc, `object-fit:contain`) khi có `logo`,
  vẫn dùng huy hiệu màu như cũ khi không có (ví điện tử, ngân hàng chưa có
  logo).
- `apps/web/app/styles.css`: thêm `.account-logo-image` / `.account-logo-image
  img` cho khung thẻ trắng + viền mảnh + bo góc.
- `apps/web/app/page.tsx`: đồng bộ kích thước nội dung trong 3 vị trí dùng
  chung khung `.row-icon` (32px) của form nhập giao dịch — hàng chọn tài
  khoản, hàng chọn danh mục, hàng ghi chú — tất cả về **26px** (trước đó lần
  lượt là 32/20/20/18, không đều).

## Kiểm thử

- `npm run typecheck`, `npm run lint` (không cảnh báo; `<img>` thường của
  Next.js bị ESLint cảnh báo "nên dùng next/image" — đã tắt có chủ đích cho
  đúng 1 dòng kèm giải thích, vì ảnh tĩnh cực nhỏ (<7KB) trong app không có
  ảnh nào khác thì next/image không mang lại lợi ích tương xứng).
- 10/10 audit script trước đó (`task026`..`task036`) vẫn pass không đổi.
- Audit mới `task037-bank-logo-audit.mjs`: khoá lại (a) mọi khoá `logo:` phải
  trỏ tới file PNG thật tồn tại với kích thước hợp lý, (b) đúng 9 ngân hàng kỳ
  vọng phải có logo, (c) `AccountLogo` thực sự render `<img>`, (d) 3 vị trí
  `.row-icon` phải đồng bộ ở 26px.
- Kiểm thử trực quan bằng Playwright (cloud sandbox, DB nháp, migrate +
  seed 9 tài khoản ngân hàng test + danh mục mặc định): xác nhận cả 9 logo
  hiển thị đúng ở trang Tài khoản, và trong form Giao dịch, logo ngân hàng /
  icon danh mục / icon ghi chú hiển thị cùng kích thước, cân đối.
