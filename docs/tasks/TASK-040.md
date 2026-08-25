# TASK-040 — Đưa thẳng dữ liệu Money Lover đã tải lên vào sổ giao dịch

## Yêu cầu gốc

> [2 ảnh chụp trang "Xem lại nhập liệu & đối soát" cho thấy đợt nhập 212
> dòng từ TASK-038 vẫn nằm đó, chưa được dùng]
>
> dữ liệu tải lên nhưng không đưa vào data, hay thiết kế để đưa vào data,
> trước mắt chưa cần đối soát, hãy đưa thẳng các bản ghi vào tương ứng

## Vấn đề

Từ trước tới TASK-038, một lần tải file Money Lover lên chỉ tạo ra các
`RawImportRow` bất biến (dữ liệu thô, nguyên văn từng dòng) — chưa từng có
gì đọc và biến chúng thành `FinancialEvent` (giao dịch thật). Vì vậy 212
dòng đã nhập từ TASK-038 hoàn toàn không xuất hiện trong Giao dịch hay
Tài sản ròng, dù trang Xem lại đã hiển thị chúng.

Có sẵn một tính năng "đối soát" (`reconciliation_candidates`) trong hệ
thống nhưng đó là một khái niệm **khác** — so khớp một dòng nhập với một
giao dịch **đã tồn tại sẵn** (dùng cho sao kê ngân hàng, chống trùng lặp),
không phải việc tạo giao dịch mới từ dòng nhập. Người dùng đã nói rõ chưa
cần đối soát — yêu cầu ở đây là một đường đi thẳng, độc lập với đối soát.

## Thiết kế

### Khớp ví và hạng mục

- **Ví ("Ví")**: khớp theo tên chính xác với tài khoản đang hoạt động,
  không đoán mò, không tự tạo tài khoản mới. Xác nhận qua dữ liệu thật của
  người dùng (file 212 dòng, database thật, chỉ đọc): 20 tên ví xuất hiện
  trong file, khớp chính xác 100% với tên tài khoản thật — không cần logic
  khớp mờ (fuzzy).
- **Hạng mục ("Nhóm")**: khớp tốt-nhất-có-thể qua bảng dịch tiếng Việt →
  tên hạng mục chuẩn tiếng Anh (`moneylover_category_map.py`, chép lại
  đúng bản dịch đã dùng ở giao diện `defaultCategoryLabels`). Dữ liệu thật
  cho thấy phần lớn tên hạng mục trong Money Lover là chữ tự do người dùng
  đặt (vd. "Xăng cr", "Ck mẹ") — chỉ ~8/41 tên khớp được bản dịch chuẩn.
  Dòng không khớp vẫn được ghi nhận bình thường, chỉ là không có hạng mục
  (`category_id = None`) — không bao giờ chặn lại vì lý do này.

### Chuyển khoản nội bộ — vấn đề đếm trùng

Money Lover tự xuất một lần "chuyển tiền giữa các ví của tôi" thành **hai
dòng riêng**: một dòng "Tiền chuyển đi" trên ví nguồn, một dòng "Tiền
chuyển đến" trên ví đích, cả hai đều đánh dấu "Không tính vào báo cáo".
Trong file thật, 70/212 dòng (35 cặp) là loại này.

Nếu ghi thẳng từng dòng như một khoản Chi tiêu/Thu nhập bình thường (cách
đơn giản nhất, khớp sát nghĩa đen của yêu cầu), số tiền chuyển giữa hai ví
của chính người dùng sẽ bị tính là **vừa chi tiêu vừa thu nhập** — sai
lệch báo cáo thu/chi dù tài sản ròng không đổi. Đây là kiểu sai số tiền mà
kiến trúc ứng dụng luôn tránh tuyệt đối, nên đã chủ động đầu tư thêm để xử
lý đúng thay vì làm theo cách đơn giản nhất.

**Giải pháp**: Money Lover tự sinh ghi chú nêu tên ví đối ứng ("Gửi đến
{ví}" / "Nhận tiền từ {ví}") — dùng ghi chú này để ghép chính xác hai dòng
thành **một** giao dịch `TRANSFER` cân bằng (khớp theo: ví của mình + ví
đối ứng nêu trong ghi chú + số tiền tuyệt đối bằng nhau — không cần cùng
ngày). Đã kiểm chứng thuật toán này khớp đúng 100% (36/36 cặp) trên file
thật, kể cả một trường hợp trùng ngày-trùng-số-tiền được phân biệt đúng
nhờ đọc ghi chú.

Một cặp không ghép được trọn vẹn (một bên ví không khớp tài khoản thật) bị
bỏ qua ở bước ghép — bên khớp được vẫn đi qua đường Chi tiêu/Thu nhập
thường, không bị mất theo bên kia.

### Chống ghi trùng khi chạy lại

`FinancialEvent.raw_import_row_id` vốn đã là khoá ngoại `unique=True` tới
`raw_import_rows.id` — một dòng thô không thể sinh ra hai giao dịch. Thêm
migration `0018` để có cột thứ hai cùng kiểu, `raw_import_row_id_secondary`
(cũng `unique=True`), để một giao dịch `TRANSFER` ghép từ HAI dòng thô có
thể đánh dấu cả hai dòng đã xử lý — nếu không, chạy lại sẽ thấy dòng thứ
hai "chưa xử lý" và cố ghi thêm một lần nữa.

Nhờ vậy `apply_import_batch()` **chạy lại bao nhiêu lần cũng an toàn** —
dòng đã xử lý bị bỏ qua, chỉ dòng mới/còn thiếu mới được xử lý tiếp. Đây
là cách một đợt nhập cũ (như 212 dòng hiện có) hoặc một đợt có ví chưa
khớp lúc đầu (sau khi người dùng tạo thêm tài khoản) được xử lý tiếp mà
không cần tải lại file.

## Lỗi phát sinh trong lúc kiểm thử: định dạng ngày thật của Money Lover

Khi viết test dựa trên đúng khuôn dạng file thật (không phải chỉ đoán),
phát hiện: mọi ô ngày trong file Money Lover thật đều là **giờ Excel đầy
đủ lúc 0h** (`datetime`, không phải `date` thuần) — openpyxl đọc lại thành
`datetime.datetime`, và bước lưu dữ liệu thô hiện có (`_json_value`) gọi
`.isoformat()` trên đó, ra chuỗi `"2026-07-31T00:00:00"` thay vì
`"2026-07-31"`.

`date.fromisoformat()` (cả trong `normalize_moneylover_row()` có sẵn từ
trước lẫn trong service mới) **từ chối** khuôn dạng có giờ này. Nếu không
bắt được lỗi này trước khi chạm vào dữ liệu thật, toàn bộ 212 dòng thật
(đã lưu sẵn trên máy người dùng, đúng khuôn dạng "có giờ" này) sẽ bị báo
lỗi "invalid_rows" hàng loạt, và nhánh ghép chuyển khoản sẽ crash ngay khi
gặp cặp đầu tiên. Đã sửa bằng một hàm phân tích ngày dùng chung
(`parse_moneylover_date()`), thử `date.fromisoformat()` trước, nếu lỗi thì
thử `datetime.fromisoformat(...).date()` — xử lý đúng cả hai khuôn dạng,
không cần đụng tới dữ liệu thô đã lưu (vốn bất biến).

## Thay đổi API & giao diện

- Tải file lên (`POST /imports/money-lover`) giờ **tự động áp dụng** ngay
  trong cùng một request — không cần thao tác thủ công nào thêm cho lần
  tải mới. Kết quả áp dụng (số dòng đã ghi, số dòng ví chưa khớp, số dòng
  lỗi...) được trả về kèm và hiển thị ngay trên thông báo sau khi tải.
- Endpoint mới `POST /imports/{batch_id}/apply` — dùng cho đợt nhập cũ (đã
  tồn tại trước khi có tính năng này, như 212 dòng hiện có) hoặc đợt có ví
  chưa khớp lúc trước (sau khi đã sửa/tạo tài khoản). An toàn khi bấm lại
  nhiều lần.
- Trang "Xem lại nhập liệu & đối soát": mỗi đợt nhập hiển thị số dòng đã
  áp dụng / tổng số dòng, kèm nút "Đưa vào giao dịch" / "Đưa lại vào giao
  dịch".

## Kiểm thử

- Backend: 252/252 test pytest pass (7 test mới cho `apply_import_batch`:
  Chi tiêu/Thu nhập khớp ví+hạng mục, ví không khớp được báo cáo đúng,
  ghép chuyển khoản thành một giao dịch cân bằng, chạy lại không ghi
  trùng, trường hợp trùng ngày-trùng-số-tiền được phân biệt đúng nhờ ghi
  chú, dòng lỗi không chặn các dòng còn lại; cộng 3 test API mới: tự động
  áp dụng khi tải lên, endpoint thủ công 404 khi sai batch, áp dụng lại
  sau khi sửa ví thành công). `ruff check` và `mypy` sạch.
- Frontend: `npm run typecheck`, `npm run lint` sạch. 13/13 audit trước đó
  không đổi. Audit mới `task040-moneylover-apply-audit.mjs` khoá lại toàn
  bộ luồng (tự động áp dụng, làm mới dữ liệu sau khi áp dụng, nút Đưa
  vào/Đưa lại giao dịch, endpoint 404, và đặc biệt là bản vá lỗi định dạng
  ngày thật — tự kiểm chứng bằng cách tạm phá lại bản vá và xác nhận audit
  bắt được lỗi).
- **Kiểm thử đầu-cuối bằng Playwright** (DB nháp riêng, không đụng dữ liệu
  thật): tải lên file mô phỏng 4 dòng (1 Chi tiêu khớp ví, 1 cặp chuyển
  khoản khớp cả hai ví, 1 Chi tiêu ví chưa tồn tại) → xác nhận trạng thái
  sau tải hiển thị "3/4 đã đưa vào giao dịch; 1 dòng chưa khớp ví (Momo)"
  → tạo tài khoản Momo qua giao diện → bấm "Đưa lại vào giao dịch" → xác
  nhận đợt nhập hiển thị "Đã đưa vào giao dịch" (4/4) → gọi thẳng API xác
  nhận đúng 3 giao dịch được tạo (1 TRANSFER 2 dòng cân bằng + 2 EXPENSE),
  không phải 4 giao dịch riêng lẻ → số dư từng tài khoản đúng theo tính
  tay. Không có lỗi console.
- **Áp dụng trực tiếp lên đợt nhập 212 dòng thật của người dùng** (đã tải
  từ TASK-038, trên máy thật, database thật `data/finance.db`):
  1. Sao lưu `data/finance.db` trước khi đổi gì
     (`finance.db.bak-task040-20260825073312`).
  2. **Chạy thử trên một bản sao** của database thật trước — phát hiện
     migration `0018` bản đầu tiên (dùng `batch_alter_table`, cách SQLite
     "tái tạo bảng" khi ALTER) **lỗi thật sự trên dữ liệu thật**: bước tái
     tạo bảng `financial_events` cần `DROP TABLE` tạm thời, nhưng ứng dụng
     luôn bật `PRAGMA foreign_keys=ON`, nên bước xoá bị chặn bởi các dòng
     `account_entries` đang tham chiếu tới các giao dịch có thật. Lỗi này
     **không thể phát hiện được trên database rỗng** (mọi lần kiểm thử
     trước đó dùng DB nháp trống) — chỉ lộ ra khi chạy thử trên bản sao dữ
     liệu thật, đúng như quy trình thận trọng đã đặt ra. Đã viết lại
     migration theo đúng phong cách `op.add_column`/`op.drop_column` thẳng
     mà các migration trước (`0016`, `0017`) đã dùng — không tái tạo bảng,
     an toàn với dữ liệu thật, và tiện thể sửa luôn được cả chiều
     downgrade (trước đây biết là lỗi, giờ chạy sạch).
  3. Chạy thử lại migration + `apply_import_batch` trên bản sao dữ liệu
     thật — kết quả: 212/212 dòng áp dụng, 36 cặp chuyển khoản ghép đúng
     thành 36 giao dịch TRANSFER cân bằng (kiểm tra từng cặp: đúng 2 dòng,
     tổng bằng 0), 140 dòng Chi tiêu/Thu nhập, 25 dòng khớp hạng mục, 0 ví
     không khớp, 0 dòng lỗi.
  4. Chạy migration thật trên `data/finance.db` — `PRAGMA foreign_key_check`
     và `PRAGMA integrity_check` đều sạch sau khi chạy.
  5. Chạy `apply_import_batch` thật, commit — **kết quả khớp chính xác với
     lần chạy thử trên bản sao**: 212/212 dòng, 36 giao dịch TRANSFER cân
     bằng, 140 giao dịch Chi tiêu/Thu nhập (25 có hạng mục, 115 chưa có),
     0 ví chưa khớp, 0 dòng lỗi. Tổng số giao dịch trong sổ: 179 (3 giao
     dịch có sẵn từ trước + 176 giao dịch mới). Xác nhận lại lần cuối:
     không giao dịch TRANSFER nào lệch cân, không dòng thô nào của đợt
     nhập còn "chưa xử lý", tài sản ròng tính lại được bình thường
     (không lỗi).
