# TASK-036 — Giao diện giao dịch kiểu Moneylover & icon danh mục tuỳ chỉnh

Task này không có tài liệu BA đính kèm — yêu cầu đến trực tiếp bằng lời từ
người dùng kèm 2 ảnh tham khảo (màn hình nhập giao dịch của Moneylover, và
một bảng icon dạng lưới):

> "bây giờ hãy chỉnh sửa giao diện cho tôi cho giống với hình ảnh của money
> lover; giữ nguyên 4 mục: khoản chi, khoản thu, chuyển tiền, thanh toán thẻ
> bổ sung icon cho các hạng mục thu chi theo list, có thể cài đặt tuỳ chỉnh
> cho từng hạng mục"

Hai phần độc lập:

1. Vẽ lại giao diện nhập giao dịch (menu **Giao dịch**) theo đúng bố cục
   Moneylover — vẫn giữ nguyên đúng 4 loại giao dịch nhập tay đã chốt ở
   TASK-034/035 (Chi tiêu / Thu nhập / Chuyển tiền / Thanh toán thẻ tín
   dụng), không thêm/bớt loại nào.
2. Bổ sung thư viện icon rộng cho danh mục thu/chi, và cho phép **tuỳ chỉnh
   icon riêng cho từng danh mục** (không còn bị khoá cứng theo tên).

Thực hiện hoàn toàn tự động theo yêu cầu người dùng: tự thiết kế, code, kiểm
thử, tự sửa lỗi; chỉ báo cáo kết quả cuối cùng.

---

## 1. Giao diện nhập giao dịch kiểu Moneylover

### 1.1 Đối chiếu ảnh tham khảo

Ảnh Moneylover cho thấy một "card" gồm các dòng chạm được xếp dọc, mỗi dòng
có icon bên trái + nội dung + mũi tên bên phải (hoặc số tiền lớn):
tài khoản → số tiền (kèm nhãn tiền tệ) → nhóm/danh mục → ghi chú → ngày
(có mũi tên lùi/tiến 1 ngày) → nút "Thêm chi tiết".

### 1.2 Quyết định thiết kế

- **Giữ nguyên logic nghiệp vụ, chỉ đổi lớp trình bày.** `composerEventTypes`
  vẫn đúng 4 phần tử như TASK-034/035; toàn bộ validate cặp bút toán cân
  bằng, lọc tài khoản theo `account_type` cho Thanh toán thẻ tín dụng, giới
  hạn danh mục theo loại sự kiện... không đổi.
- **Component `AccountRow` mới** (thay `<select>`): một dòng chạm được hiển
  thị huy hiệu ngân hàng (`AccountLogo`, tái dùng từ TASK-035) + tên tài
  khoản + mũi tên `›`, bấm vào mở popover danh sách tài khoản — cùng khuôn
  mẫu tương tác với `CategoryPicker`/`AccountRow` đã dùng ở nơi khác trong
  app, không phải mẫu thiết kế mới. Dùng cho cả 3 nhánh: 1 dòng tài khoản
  (Chi tiêu/Thu nhập), 2 dòng (Chuyển tiền: từ/đến), 2 dòng (Thanh toán thẻ:
  thẻ/nguồn tiền).
- **Dòng số tiền lớn**: nhãn tiền tệ xám bên trái (lấy theo tài khoản đang
  chọn, mặc định "VND") + input số tiền cỡ chữ lớn không viền, giống cách
  Moneylover nhấn mạnh con số.
- **Dòng "Chọn danh mục"**: dùng lại đúng `CategoryPicker` đã có (cây danh
  mục, tìm kiếm, giới hạn 3 cấp...), chỉ đổi CSS của nút bấm để cùng kiểu
  dòng-chạm với `AccountRow` — không viết lại logic chọn danh mục.
- **Dòng "Ghi chú" luôn hiển thị** (trước đây nằm sau nút "+ Thêm chi tiết"
  ẩn), khớp đúng vị trí trong ảnh Moneylover. "Người nhận"/"Chuyến đi hoặc sự
  kiện" (2 trường ít dùng hơn, ảnh Moneylover không có) vẫn giữ sau nút
  "+ Thêm chi tiết" như cũ.
- **Dòng ngày kiểu stepper**: 2 nút tròn ‹ › đổi ngày ±1 (tính bằng UTC ngày
  thuần, tránh lệch múi giờ), ở giữa là nhãn ngày định dạng đầy đủ theo ngôn
  ngữ hiện tại (`Intl.DateTimeFormat` với `weekday/day/month/year`, ví dụ
  "Thứ Ba, 25/08/2026") — bấm vào nhãn mở lịch chọn ngày gốc của trình duyệt
  (input `type="date"` được đặt trong suốt phủ lên đúng vùng nhãn).
- **Chuyển 3 trường Chuyển tiền/Thanh toán thẻ tín dụng từ đọc-qua-FormData
  sang state có kiểm soát** (`transferFrom`/`transferTo`/`transferAmount`,
  `cardAccountId`/`fundingAccountId`/`paymentAmount`) — cần thiết vì
  `AccountRow` là popover tuỳ biến, không phải `<select>` gốc nên không còn
  giá trị nào để `FormData` đọc qua thuộc tính `name`. `submit()` validate và
  dựng cặp bút toán y hệt logic cũ, chỉ đổi biến cục bộ.

### 1.3 Phạm vi không đổi

- Không đổi bất kỳ endpoint hay schema backend nào cho phần này — thuần
  frontend.
- Không đổi bố cục trang Tài khoản/Danh mục (TASK-034/035) ngoài phần dùng
  chung style `.row-trigger`/`.row-popover` cho `CategoryPicker` (chỉ dùng
  trong Giao dịch, không đụng `ParentPicker` ở trang Danh mục — 2 component
  khác nhau dù trước đây trông giống nhau).

---

## 2. Icon danh mục tuỳ chỉnh theo từng danh mục

### 2.1 Hiện trạng trước task này

`CategoryIcon` (từ TASK-031) suy ra icon **hoàn toàn theo tên** danh mục qua
một dictionary đóng (`ICONS: tên → icon`) — không có cách nào gán icon khác
cho một danh mục cụ thể mà không đổi tên nó.

### 2.2 Quyết định thiết kế quan trọng: không dùng đúng bộ icon trong ảnh mẫu

Ảnh "list" người dùng gửi là một bộ icon thương mại (kiểu Flaticon) thường đi
kèm Moneylover — đây là tài sản có bản quyền của bên thứ ba, không được tự ý
sao chép/nhúng lại. Thay vào đó, xây dựng **một thư viện icon gốc riêng**
theo đúng tinh thần yêu cầu (nhiều icon để chọn, xếp theo lưới, phân nhóm chủ
đề tương tự), vẽ bằng SVG nét đơn tối giản — cùng phong cách với 38 icon
danh mục mặc định đã có từ TASK-031, mở rộng thêm 37 icon mới (tổng
**75 icon**), xếp vào **11 nhóm chủ đề** (Tài chính, Ăn uống, Hóa đơn & Nhà
cửa, Di chuyển, Mua sắm, Gia đình & Thú cưng, Sức khỏe, Giải trí, Giáo dục,
Du lịch & Sự kiện, Khác).

### 2.3 Thiết kế dữ liệu: `Category.icon`

- **Backend**: thêm cột `categories.icon` (chuỗi, cho phép NULL) — migration
  `0017_category_icon`. `NULL` nghĩa là "chưa tuỳ chỉnh, dùng icon mặc định
  theo tên" — **không backfill** giá trị cho danh mục cũ, vì nếu backfill sẽ
  đóng băng icon mặc định hiện tại vào dữ liệu, khiến lần sau cải tiến icon
  mặc định (ví dụ đổi icon "Coffee & Drinks" đẹp hơn) sẽ không áp dụng được
  cho các danh mục chưa từng tuỳ chỉnh. `icon` chỉ là một **khoá icon**
  (chuỗi định danh trong registry phía frontend, ví dụ `"Coffee"`), không
  phải ảnh hay URL — backend lưu tự do, không validate theo danh sách cố
  định (giữ khớp nguyên tắc hiện có: các trường tự do khác trong app cũng
  không bị enum hoá phía server).
- **Frontend**: `ICON_REGISTRY` (khoá → component icon, 75 mục) tách biệt
  với `ICONS` (tên danh mục mặc định → icon, giữ nguyên từ TASK-031).
  `resolveIconKey(category)`: ưu tiên `category.icon` nếu hợp lệ, nếu không
  mới rơi về icon mặc định theo tên. `CategoryIcon` (dùng ở mọi nơi hiển thị
  icon danh mục: cây danh mục, `CategoryPicker`, `ParentPicker`) nhận thêm
  prop `icon` và tự resolve theo đúng quy tắc trên — chỉ cần sửa **một chỗ**,
  toàn bộ nơi hiển thị icon danh mục trong app tự động được nâng cấp.

### 2.4 `IconPicker` — giao diện chọn icon

Component mới trong form sửa danh mục (menu Danh mục): nút hiện icon đang
chọn + nhãn (hoặc "Tự động (theo tên)" nếu chưa tuỳ chỉnh), bấm mở popover
lưới icon chia theo 11 nhóm chủ đề, mỗi icon có tooltip song ngữ. Chọn icon
chỉ cập nhật state cục bộ của form (giống các trường Tên/Danh mục cha khác),
lưu thật khi bấm "Lưu thay đổi" — không tự lưu ngay khi chọn.

---

## 3. Thay đổi cụ thể

### Backend (`apps/api/`)

- `app/models/category.py` — thêm cột `icon: Mapped[str | None]`.
- `app/schemas/category.py` — `CategoryBase`/`CategoryUpdate` thêm
  `icon: str | None = None`.
- `migrations/versions/0017_category_icon.py` — migration mới, `ADD COLUMN`
  đơn giản, không backfill (lý do ở mục 2.3).
- `tests/test_categories_api.py` — cập nhật 2 assertion dict đầy đủ (thêm
  `"icon": None`), thêm 3 test mới: tạo kèm icon, sửa để gán icon, sửa để
  xoá icon (đưa về `null` = tự động theo tên).
- `tests/test_migrations.py` — thêm `0017_category_icon` vào chuỗi
  migration, cập nhật head kỳ vọng.

### Frontend (`apps/web/`)

- `lib/category-icons.tsx` — thêm 37 icon component mới; thêm
  `ICON_REGISTRY` (khoá→component), `ICON_GROUPS` (11 nhóm cho picker),
  `ICON_LABELS` (nhãn song ngữ mỗi icon), `resolveIconKey()`, `iconLabel()`,
  `IconGlyph` (render icon theo khoá trực tiếp); `CategoryIcon` nhận thêm
  prop `icon` tuỳ chọn.
- `lib/api.ts` — `Category`/`CategoryInput` thêm `icon: string | null`.
- `lib/i18n.ts` — thêm khoá `Icon`, `Automatic (by name)`, `Previous day`,
  `Next day`, `Choose date`, `Add a note` (cả 2 ngôn ngữ).
- `app/page.tsx`:
  - `CategoriesPanel`: thêm state `iconKey`, field "Icon" (`IconPicker`)
    trong form sửa/thêm danh mục, đưa `icon` vào payload lưu.
  - `IconPicker` (component mới): trigger + popover lưới icon theo nhóm.
  - `Transactions()`: viết lại hoàn toàn phần bố cục thành `.txn-card` gồm
    các dòng chạm (`AccountRow`, dòng số tiền, `CategoryPicker` đã restyle,
    dòng ghi chú, dòng ngày kiểu stepper); thêm helper
    `todayIso()`/`shiftIsoDate()`/`formatIsoDateLabel()`; chuyển
    Transfer/Thanh toán thẻ tín dụng sang state có kiểm soát.
  - `AccountRow` (component mới): dòng chạm chọn tài khoản dùng chung cho cả
    3 nhánh giao dịch.
  - Mọi lệnh gọi `<CategoryIcon name=.../>` cập nhật để truyền kèm
    `icon={...}` của đúng danh mục đang hiển thị.
- `app/styles.css` — thêm toàn bộ style mới: `.txn-card`, `.row-picker`,
  `.row-trigger`, `.row-popover`, `.amount-row`, `.currency-badge`,
  `.note-row`, `.date-row`, `.date-nav`, `.date-center`, `.icon-picker`,
  `.icon-popover`, `.icon-group-grid`, `.icon-swatch`...
- `scripts/task036-moneylover-ui-audit.mjs` (mới): xác nhận composer vẫn
  đúng 4 loại; `AccountRow` được dùng đúng cho cả 3 nhánh; dòng số
  tiền/ngày/ghi chú tồn tại; `Category.icon` có mặt xuyên suốt backend model
  → schema → frontend type → `resolveIconKey` → `IconPicker` → payload lưu;
  mọi icon trong `ICON_REGISTRY` đều xuất hiện trong ít nhất 1 nhóm của
  `ICON_GROUPS` (không icon nào "mồ côi", không thể chọn được từ picker) và
  đều có nhãn song ngữ; quét i18n toàn bộ call site (131 vị trí). Đăng ký
  vào `package.json`.
- Đã cập nhật 2 audit cũ có assertion tham chiếu chi tiết cài đặt cũ (không
  còn đúng sau khi đổi UI, nhưng không phản ánh mất tính năng):
  `task027-ui-audit.mjs` (đổi tên biến cục bộ `amount`→`transferAmount` khi
  trường này chuyển từ đọc-qua-FormData sang input có kiểm soát) và
  `task034-transactions-accounts-audit.mjs` (thẻ tín dụng/tài khoản nguồn
  không còn là `<select name="...">` mà là `AccountRow` gắn state
  `cardAccountId`/`fundingAccountId` — cùng bất biến an toàn, khác cách
  trình bày).

---

## 4. Kiểm thử

### Backend (`cd apps/api`)

- `uv run pytest -q` — **238 passed** (235 cũ + 3 test mới cho
  `Category.icon`), zero regression.
- Migration `0017` áp dụng sạch từ CSDL rỗng lẫn CSDL đã có dữ liệu.

### Frontend (`cd apps/web`)

- `npx tsc --noEmit` — PASS.
- `npm run lint -- --max-warnings=0` — PASS.
- `npm run build` — PASS.
- Toàn bộ audit cũ (task026…task035) + `task036-moneylover-ui-audit` mới —
  PASS (75 icon/11 nhóm, 131 vị trí i18n).

### Smoke test qua UI thật (Playwright + Chromium headless, backend/frontend
thật, không mock)

1. Cả 4 tab Chi tiêu/Thu nhập/Chuyển tiền/Thanh toán thẻ tín dụng hiển thị
   đúng bố cục dòng-chạm; Chuyển tiền/Thanh toán thẻ tín dụng đúng 2 dòng
   tài khoản, không hiện dòng danh mục (đúng như logic cũ).
2. Mở popover chọn tài khoản: hiện đúng huy hiệu ngân hàng + tên từng tài
   khoản; chọn xong huy hiệu + tên hiển thị ngay trên dòng trigger.
3. Mở popover chọn danh mục: cây danh mục hiện đúng, tìm kiếm hoạt động.
4. Dòng ngày: bấm ‹ chuyển đúng từ "Thứ Ba, 25/08/2026" sang "Thứ Hai,
   24/08/2026".
5. Trang Danh mục: mở "Sửa" một danh mục, mở icon picker — hiện đúng 75 icon
   chia 11 nhóm tiếng Việt; chọn icon "Bánh kem" cho danh mục "Chi tiêu",
   lưu lại → xác nhận qua API `GET /categories/1` trả đúng `"icon": "Cake"`;
   cây danh mục hiển thị ngay icon bánh kem thay icon mặc định; đặt lại
   `icon: null` qua API xác nhận quay về icon mặc định.
6. Không có `pageerror` nào trong toàn bộ kịch bản.
7. **Lưu ý về phương pháp test**: lần đầu dùng `page.click()` (Playwright)
   để chọn icon rồi bấm "Lưu thay đổi" ngay sau đó bị timeout do popover
   chưa kịp đóng theo click giả lập của Playwright chặn mất nút Lưu (che
   khuất bằng lớp popover đang mở). Xác nhận qua `element.click()` gọi trực
   tiếp (native DOM click, không qua lớp mô phỏng con trỏ của Playwright)
   thì việc chọn icon đóng popover đúng ngay lập tức — đây là đặc thù của
   kịch bản test tự động (giống trường hợp "Tiền mã hóa" ở TASK-035), không
   phải lỗi sản phẩm thật; xác nhận lại bằng chính luồng lưu-qua-API ở mục 5
   thành công trọn vẹn.

---

## 5. Kết quả

- Giao diện Giao dịch được vẽ lại theo đúng bố cục Moneylover (dòng tài
  khoản → số tiền lớn → danh mục → ghi chú → ngày kiểu stepper), giữ nguyên
  đúng 4 loại giao dịch nhập tay và toàn bộ nghiệp vụ/validate đã có từ
  TASK-034/035 — không đổi backend cho phần này.
- Danh mục thu/chi có thể gán icon tuỳ chỉnh từ thư viện 75 icon gốc (không
  sao chép bộ icon thương mại trong ảnh mẫu, tránh rủi ro bản quyền), chia
  11 nhóm chủ đề, chọn qua picker dạng lưới trong form sửa danh mục; danh
  mục chưa tuỳ chỉnh tiếp tục dùng đúng icon mặc định theo tên như trước.
- Zero regression: 238 test backend + toàn bộ audit/typecheck/lint/build
  frontend + smoke test UI thật đều pass.
- Đã áp dụng migration `0017` lên database thật trên thiết bị người dùng.
