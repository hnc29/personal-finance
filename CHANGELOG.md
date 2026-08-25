# Changelog

Mọi thay đổi quan trọng của dự án được ghi lại tại đây. Mỗi lần backup lên
GitHub tương ứng với một mục dưới đây và một git tag `vX.YY` cùng tên.

Định dạng dựa theo [Keep a Changelog](https://keepachangelog.com/), phiên
bản đặt tên theo `vMAJOR.MINOR` (ví dụ `v1.00`, `v1.01`, `v2.00`).

## Quy ước phiên bản & backup

- **Database thực tế (`data/finance.db*`) không bao giờ được commit vào Git.**
  Bị chặn bởi `.gitignore` (`data/*.db`, `data/*.db-shm`, `data/*.db-wal`,
  `data/*.db.bak-*`, `data/*.bak*`). Bản backup của database thật được lưu
  riêng trên Google Drive, tách biệt hoàn toàn khỏi repo GitHub.
- Mỗi lần muốn "chốt" một mốc để backup:
  1. Cập nhật mục mới ở đầu file này, mô tả ngắn gọn các thay đổi kể từ lần
     backup trước (tính năng mới, sửa lỗi, thay đổi cấu trúc dữ liệu...).
  2. `git add -A && git commit -m "..."` (đã được `.gitignore` bảo vệ khỏi
     dữ liệu thật).
  3. Tăng số phiên bản: sửa lỗi/nhỏ → tăng MINOR (`v1.00` → `v1.01`); tính
     năng lớn/đổi kiến trúc → tăng MAJOR (`v1.xx` → `v2.00`).
  4. `git tag -a vX.YY -m "<ghi chú thay đổi>"` rồi `git push origin master
     --tags`.
  5. Nếu database thật có thay đổi cấu trúc quan trọng (chạy migration mới),
     backup file `data/finance.db` lên Google Drive với tên có kèm ngày/giờ.

## [1.00] - 2026-08-25

Mốc đầu tiên được đánh dấu phiên bản chính thức — tổng hợp toàn bộ công sức
từ TASK-001 đến TASK-036. Trạng thái hiện tại của ứng dụng quản lý tài chính
cá nhân:

### Nền tảng & dữ liệu
- Backend FastAPI + SQLAlchemy 2 + Alembic (17 migration), fixed-point money
  primitives (Decimal, không dùng float cho tiền).
- Mô hình tài khoản, hạng mục (cây phân cấp cha/con), sổ giao dịch
  (financial events + entries), sổ tiết kiệm, thẻ tín dụng, kim loại quý,
  tiền mã hoá, giá thị trường theo nhiều nguồn có fallback, snapshot tài sản
  ròng (net worth).

### Nhập liệu & đối soát
- Nhập dữ liệu thô từ Money Lover, chuẩn hoá, ghép giao dịch chuyển khoản,
  chống trùng lặp.
- Xuất dữ liệu theo định dạng MISA.
- Nhập sao kê ngân hàng (nhiều định dạng adapter) và engine đối soát ngân
  hàng.

### Giao diện người dùng
- Frontend Next.js/TypeScript, song ngữ Việt/Anh đầy đủ, PWA có khả năng
  backup và AI cục bộ.
- Trải nghiệm nhập giao dịch kiểu Money Lover: 4 loại (Khoản chi, Khoản thu,
  Chuyển tiền, Thanh toán thẻ), giao diện dạng "hàng chạm" (account/amount/
  category/note/date), bộ chọn ngày kiểu bước tới/lùi.
- Quản lý hạng mục dạng cây thật, tìm kiếm, sắp xếp tài khoản, logo ngân
  hàng đã xác thực, bootstrap tài khoản cục bộ.
- Thư viện icon gốc 75 icon (11 nhóm) cho hạng mục thu/chi, có thể tuỳ chỉnh
  icon riêng cho từng hạng mục thay vì chỉ suy ra theo tên.
- Sản phẩm tiết kiệm kiểu MISA, đơn vị chỉ cho kim loại quý, danh mục sản
  phẩm kim loại được quản lý, danh mục coin từ CoinGecko.
- Nghiệp vụ gửi tiết kiệm theo đặc tả BA (TASK-033), thanh toán thẻ tín
  dụng & điều chỉnh số dư tài khoản (TASK-034).

### Kiểm thử
- Bộ test pytest phía backend (238 test tại thời điểm này) và các script
  audit UI phía frontend (`task0XX-*-audit.mjs`) để khoá lại từng yêu cầu
  nghiệp vụ, tránh hồi quy khi các task sau chỉnh sửa cùng khu vực code.

### Backup
- Bắt đầu backup có phiên bản lên GitHub từ mốc này (`v1.00`), không bao
  gồm database thực tế. Database thực tế được backup riêng trên Google
  Drive.
