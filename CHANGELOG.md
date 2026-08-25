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

## [Unreleased]

Chưa có thay đổi nào kể từ mốc `v2.00`.

## [2.00] - 2026-08-25

Tổng hợp TASK-037 đến TASK-042 kể từ mốc `v1.00`. Thay đổi kiến trúc dữ
liệu đáng kể nhất trong đợt này: dữ liệu nhập từ Money Lover giờ được đưa
thẳng vào sổ giao dịch thay vì chỉ nằm dạng thô (migration `0018` +
`moneylover_apply.py`), và giao dịch giờ có thể xem chi tiết/sửa/xoá thay
vì chỉ tạo mới — đây là lý do tăng MAJOR thay vì MINOR.

### Tính năng mới
- Đưa thẳng dữ liệu Money Lover đã nhập vào sổ giao dịch, tự động ghép
  cặp chuyển khoản nội bộ thành một giao dịch cân bằng, tự động khớp ví
  và hạng mục tốt-nhất-có-thể (TASK-040).
- Xem chi tiết, chỉnh sửa, xoá giao dịch (Chi tiêu/Thu nhập/Chuyển tiền/
  Thanh toán thẻ) — trước đây chỉ tạo mới được; hạng mục trong màn hình
  chi tiết hiển thị đúng đường dẫn đầy đủ từ gốc tới lá (TASK-042).
- Logo ngân hàng thật cho 10 ngân hàng phổ biến (TASK-037).

### Sửa lỗi
- "Bấm tải lên không phản hồi" khi tên file Money Lover có dấu tiếng Việt
  (TASK-038).
- Ghi "Chi tiêu" bị cộng nhầm vào số dư thay vì trừ đi; bỏ hậu tố ".0000"
  thừa khi hiển thị tiền VND (TASK-039).
- Ràng buộc dữ liệu bắt buộc (tài khoản, số tiền, hạng mục) khi ghi Chi
  tiêu/Thu nhập qua form (TASK-041).

### Kiểm thử & vận hành
- 281 test pytest phía backend (từ 238 ở mốc v1.00), 16 audit script phía
  frontend (từ 3 ở mốc v1.00) khoá lại từng yêu cầu nghiệp vụ.
- Thiết lập quy trình bắt buộc trước khi chạm vào dữ liệu thật: sao lưu +
  chạy thử trên bản sao trước khi áp dụng migration/thay đổi dữ liệu lên
  `data/finance.db` thật (rút ra từ sự cố migration `0018` ở TASK-040).

Chi tiết đầy đủ từng task nằm ở `docs/tasks/TASK-037.md` đến
`docs/tasks/TASK-042.md` và các mục dưới đây (giữ nguyên từ bản ghi gốc
lúc thực hiện):

- **TASK-037**: logo ngân hàng thật (SHB, VPBank, BIDV, Techcombank,
  PVcomBank, SCB, Eximbank, VIB, Shinhan) cho các tài khoản tương ứng;
  đồng bộ kích thước icon hạng mục/ghi chú/tài khoản trong form giao dịch
  về cùng 26px.
- **TASK-038**: sửa lỗi "bấm tải lên không phản hồi" khi nhập file Money
  Lover có tên chứa dấu tiếng Việt — hai nguyên nhân độc lập: (1) tên file
  có dấu làm `fetch()` ném lỗi đồng bộ khi tạo `Headers` (không có
  try/catch nên không hiển thị gì), (2) cấu hình CORS backend chưa cho
  phép header `X-Filename`, chặn preflight cho mọi lần tải lên. Đã sửa cả
  hai, thêm 4 test HTTP-layer mới, và kiểm thử đầu-cuối thành công với
  chính file thật của người dùng (212 dòng nhập được). Nhân tiện sửa luôn
  một lỗ hổng i18n có sẵn (tiêu đề trang "Dữ liệu" trước đó luôn hiển thị
  tiếng Anh dù đang ở giao diện tiếng Việt).
- **TASK-039**: sửa lỗi ghi "Chi tiêu" bị cộng thêm vào số dư thay vì trừ
  đi (composer một-dòng gửi số tiền không dấu lên server; giờ nút Chi
  tiêu/Thu nhập tự ép dấu đúng). Bỏ hậu tố ".0000" thừa khi hiển thị tiền
  VND ở 11 vị trí (số dư tài khoản, dòng giao dịch, sổ tiết kiệm, tài sản
  ròng...) qua hàm `fmtMoney()` mới, dùng số nguyên chính xác chứ không
  làm tròn nên vẫn giữ đủ phần lẻ thật nếu có (vd. lãi tiết kiệm tính theo
  ngày). Kiểm thử đầu-cuối bằng đúng kịch bản người dùng báo cáo (ví
  ZaloPay, chi tiêu 150.000): số dư 500.000 → 350.000, đúng bị trừ.
- **TASK-040**: dữ liệu Money Lover tải lên giờ được đưa **thẳng vào sổ
  giao dịch** thay vì chỉ nằm dạng thô chưa dùng tới — không qua bước đối
  soát thủ công (đối soát là một tính năng khác, độc lập, dùng cho sao kê
  ngân hàng). Ví khớp chính xác theo tên tài khoản; hạng mục khớp tốt-nhất-
  có-thể theo bản dịch tiếng Việt có sẵn, dòng không khớp hạng mục vẫn được
  ghi (chỉ thiếu hạng mục). Chuyển khoản nội bộ giữa các ví của chính người
  dùng (Money Lover xuất thành 2 dòng riêng) được ghép lại đúng thành MỘT
  giao dịch Chuyển tiền cân bằng dựa trên ghi chú tự động của Money Lover
  — tránh đếm trùng vào báo cáo thu/chi. Tải file lên tự động áp dụng luôn
  trong cùng một lần; trang Xem lại nhập liệu có thêm nút "Đưa vào giao
  dịch"/"Đưa lại vào giao dịch" cho đợt nhập cũ hoặc có ví chưa khớp lúc
  trước, chạy lại bao nhiêu lần cũng an toàn (không ghi trùng).
  Trong lúc kiểm thử trên bản sao dữ liệu thật (trước khi đụng vào dữ liệu
  thật), phát hiện và sửa 2 lỗi: (1) migration ban đầu dùng cách "tái tạo
  bảng" của SQLite bị lỗi ràng buộc khoá ngoại trên database có dữ liệu
  thật (không lộ ra trên DB rỗng) — viết lại theo cách thêm/xoá cột trực
  tiếp, an toàn hơn, tiện sửa luôn được cả chiều downgrade; (2) ngày trong
  file Money Lover thật luôn ở dạng giờ Excel đầy đủ mà hàm đọc ngày cũ
  không xử lý được — nếu không sửa, toàn bộ dữ liệu thật sẽ bị báo lỗi
  hàng loạt. Đã áp dụng thành công lên đúng đợt nhập 212 dòng thật của
  người dùng: **212/212 dòng**, 36 giao dịch Chuyển tiền (cân bằng, không
  giao dịch nào lệch), 140 giao dịch Chi tiêu/Thu nhập (25 có hạng mục),
  0 ví chưa khớp, 0 dòng lỗi — đã sao lưu database trước khi đổi, kiểm tra
  toàn vẹn dữ liệu sạch sau khi xong. Chi tiết đầy đủ ở
  `docs/tasks/TASK-040.md`.
- **TASK-041**: form ghi giao dịch Chi tiêu/Thu nhập giờ bắt buộc phải có
  đủ tài khoản, số tiền, và hạng mục (nếu có hạng mục để chọn) trước khi
  cho ghi — trước đây cả ba đều có thể bỏ trống mà không cảnh báo (thiếu
  tài khoản trước đó gửi thẳng lên server và ra lỗi kỹ thuật khó hiểu,
  thiếu hạng mục thì ghi luôn không hạng mục mà không hay biết). Ngày
  tháng không cần thêm ràng buộc vì đã luôn có sẵn giá trị mặc định là
  hôm nay. Ràng buộc hạng mục **chỉ ở tầng giao diện**, không đổi ở
  backend — vì tính năng auto-apply từ TASK-040 vẫn cần tạo được giao
  dịch không hạng mục cho các dòng Money Lover không khớp hạng mục nào.
  Kiểm thử đầu-cuối: thiếu tài khoản/hạng mục đều bị chặn đúng với 0 giao
  dịch tạo ra, ghi đủ dữ liệu thì thành công và hạng mục được lưu đúng,
  kiểm tra cặp tài khoản của Chuyển tiền không bị ảnh hưởng. Chi tiết đầy
  đủ ở `docs/tasks/TASK-041.md`.
- **TASK-042**: thêm tính năng **xem chi tiết, chỉnh sửa, xoá giao dịch**
  ở trang Giao dịch — trước đây chỉ có thể tạo mới, không có cách nào sửa
  hay xoá một giao dịch đã ghi. Bấm vào một dòng mở modal chi tiết, trong
  đó hạng mục hiển thị **đúng đường dẫn đầy đủ từ gốc tới lá** (ví dụ "Ăn
  uống › Ăn ngoài") thay vì chỉ tên hạng mục trơn như ở bảng danh sách —
  đúng yêu cầu "hiển thị theo đúng danh mục chi tiêu ở level nhỏ nhất".
  Sửa/xoá chỉ áp dụng cho 4 loại giao dịch composer tự tạo (Chi tiêu, Thu
  nhập, Chuyển tiền, Thanh toán thẻ tín dụng) — các loại do trang Tiết
  kiệm/Tài sản tự sinh (Điều chỉnh, Tiền lãi, Gửi/Rút tiết kiệm, Mua/Bán
  tài sản) hiển thị chi tiết nhưng không cho sửa/xoá ở đây, vì chúng đồng
  bộ dữ liệu riêng ở trang gốc — ranh giới này được chặn cả ở backend
  (409) chứ không chỉ ẩn nút trên giao diện. Sửa dùng lại đúng form tạo
  mới (điền sẵn dữ liệu), xoá yêu cầu bấm xác nhận hai lần.
  Kiểm thử đầu-cuối phát hiện và sửa 2 lỗi backend: (1) xoá một giao dịch
  có nhiều dòng tài khoản vi phạm ràng buộc khoá ngoại SQLite — sửa bằng
  cascade xoá đúng thứ tự ở tầng ORM, kiểm chứng trên schema thật (không
  mock); (2) CORS chưa cho phép method DELETE, chặn nút Xoá ngay từ bước
  preflight của trình duyệt — giống lỗi CORS thiếu header đã gặp ở
  TASK-038. Chi tiết đầy đủ ở `docs/tasks/TASK-042.md`.

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
