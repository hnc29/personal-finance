# TASK-033 — Sửa nghiệp vụ gửi tiết kiệm theo đặc tả BA

Task này được giao từ tài liệu BA `nghiepvuguitietkiemchoclaude.md` (34 mục,
tiếng Việt): review và chỉnh sửa module **Sổ tiết kiệm** trên toàn bộ vertical
slice (DB → model → service → ledger/event → API → frontend client → UI →
portfolio/net worth → test), ưu tiên tái sử dụng domain hiện có, không tạo
module Savings thứ hai song song.

Thực hiện hoàn toàn tự động theo yêu cầu người dùng: tự thiết kế, code, kiểm
thử, tự sửa lỗi; chỉ báo cáo kết quả cuối cùng.

Báo cáo theo đúng cấu trúc §34 của tài liệu BA.

---

## 1. Những gì đã có sẵn

Trước khi sửa, đã đọc và đối chiếu toàn bộ domain hiện có theo yêu cầu §30:

- `SavingsProduct` / `SavingsAccount` / `SavingsTerm` (`app/models/savings.py`,
  migration `0009_savings`) — đã có cấu trúc 3 bảng đúng như spec §3 mong
  muốn (product / account / term-lịch sử), kể cả `renewed_from_term_id` để
  bảo toàn chuỗi tái tục.
- `calculate_interest()` (`app/services/savings.py`) — đã tính lãi bằng
  `Decimal` chính xác (không float), đã tự động chọn `annual_rate` khi
  `end_date >= maturity_date` và `non_term_rate` khi sớm hơn — đúng yêu cầu
  kép của spec §9 (lãi dự kiến đến hạn) và §10 (lãi tất toán trước hạn) mà
  không cần sửa logic tính toán.
- `_add_months()` (nay đổi tên public `add_months()`) — đã cộng ngày theo
  đúng calendar month và clamp cuối tháng (vd. `31/01 + 1 tháng -> 28/02`),
  đúng yêu cầu §8, không dùng `180 ngày = 6 tháng`.
- `DayCountConvention` (ACTUAL_365/ACTUAL_360/THIRTY_360),
  `InterestPaymentMethod`, `MaturityAction` — đã tồn tại, map đúng với UI đề
  xuất ở §7 (`Không tự động tái tục` / `Tái tục tiền gốc` / `Tái tục cả gốc
  và lãi`).
- Ledger/event: `FinancialEventType.SAVINGS_DEPOSIT`,
  `SAVINGS_WITHDRAWAL`, `INTEREST` đã tồn tại sẵn (`app/models/ledger.py`),
  không cần thêm event type mới.
- `app/services/read_models.py` đã cộng `SavingsAccount.principal_scaled`
  trực tiếp vào `PortfolioComponentType.SAVINGS` trong Net Worth — đúng
  nguyên tắc §21 (savings principal thuộc Assets, không double-count).
- Exact-money utilities (`money_to_scaled` / `scaled_to_money`,
  `app/core/money.py`) — đã dùng nhất quán trong service savings.

### Bảng review nội bộ (yêu cầu nghiệp vụ | đã có | thiếu | cần sửa)

| Yêu cầu nghiệp vụ | Đã có | Thiếu | Cần sửa |
|---|---|---|---|
| Gửi tiết kiệm là transfer, không phải Expense | Có event `SAVINGS_DEPOSIT` | `open_savings()` không tạo event nào, `POST /assets/savings` không nhận tài khoản nguồn | Thêm `funding_account_id` xuyên suốt |
| Tất toán tách gốc/lãi | Có event `INTEREST`, `SAVINGS_WITHDRAWAL` | Không có action tất toán nào trong service | Viết `close_savings()` |
| Tất toán trước hạn dùng lãi suất không kỳ hạn | Có `non_term_rate` trên model | Không có action | Viết `early_close_savings()` |
| Tái tục gốc / gốc+lãi | Có `MaturityAction` enum | `renew_savings()` không tồn tại | Viết mới, phân biệt 2 nhánh §13/§14 |
| Trạng thái Còn hạn/Sắp đáo hạn/Đã đáo hạn/Đã tất toán | Không có | Không có trường lifecycle ở cấp `SavingsTerm` | Thêm `SavingsTermStatus`, migration |
| API vòng đời (`close`/`early-close`/`renew`/`PATCH`) | Chỉ có `GET`/`POST` liệt kê & tạo trong `assets.py` | Thiếu toàn bộ | Router riêng `app/api/savings.py` |
| UI: modal thay vì form luôn hiện | — | Form savings cũ luôn hiện trên tab Assets | Viết lại toàn bộ UI |
| Sửa sổ trước khi có lịch sử | — | Không có PATCH | Thêm PATCH + gate `editable` |

---

## 2. Những gì đã sửa

### 2.1 Lỗi nghiêm trọng nhất: gửi tiết kiệm không trừ tài khoản nguồn

`create_savings()` (API cũ trong `app/api/assets.py`) gọi `open_savings()`
mà không có tham số nào về tài khoản nguồn, và `open_savings()` khi đó
không hỗ trợ tham số này — nghĩa là **mọi khoản tiết kiệm được tạo sẽ tự
sinh ra tiền, không trừ tài khoản nào**, làm Net Worth bị thổi phồng đúng
bằng số tiền gửi. Đây là vi phạm trực tiếp nguyên tắc §2.1 và acceptance
criteria "Net Worth không đổi tại thời điểm chỉ chuyển Bank -> Savings".

Đã sửa ở tầng service (`open_savings(..., funding_account_id=...)` tạo
đúng một `SAVINGS_DEPOSIT` event ghi nợ tài khoản nguồn bằng đúng số tiền
gốc) và bắt buộc ở tầng API (`funding_account_id` là field bắt buộc trong
`SavingsAccountCreate`, chỉ chấp nhận tài khoản CASH/BANK/EWALLET — không
cho chọn Credit Card hay chính SavingsAccount, đúng §6).

### 2.2 Tất toán và tất toán trước hạn — viết mới hoàn toàn

`close_savings()` (đúng hạn) và `early_close_savings()` (trước hạn) tách
rõ gốc (chuyển tài sản, `SAVINGS_WITHDRAWAL`) và lãi thực nhận
(`INTEREST`, Income thật) theo đúng §11/§12. `early_close_savings()` nhận
`actual_interest` là số do người dùng nhập theo chứng từ thực tế — không
tự động dùng `annual_rate` ban đầu (đúng §10), và ghi nhận phí (nếu có)
thành một event `EXPENSE` riêng.

### 2.3 Tái tục — phân biệt đúng hai nhánh capitalize vs pay-out

`renew_savings()` viết mới, đóng kỳ cũ (`status=CLOSED`,
`actual_interest_scaled`, `closed_at`) và mở kỳ mới từ đó, phân theo
`maturity_action` của kỳ cũ:

- `RENEW_PRINCIPAL`: lãi được trả thật ra tài khoản nhận (event `INTEREST`
  bắt buộc `receiving_account_id`), chỉ gốc cũ chuyển sang kỳ mới — đúng ví
  dụ §13 ("Lãi 3.000.000 được trả vào tài khoản nhận").
- `RENEW_PRINCIPAL_AND_INTEREST`: **không tạo event nào** — lãi được cộng
  thẳng vào `principal_scaled` của kỳ mới. Net Worth vẫn tăng đúng bằng lãi
  (qua component `SAVINGS` trong portfolio read model) mà không tạo dòng
  tiền giả qua tài khoản ngân hàng — đúng yêu cầu bắt buộc của §14.

### 2.4 Endpoint savings cũ bị gỡ khỏi `app/api/assets.py`

`SavingsCreate`, `list_savings`, `create_savings` (thiếu funding account,
không có action nào khác) đã bị xoá khỏi `assets.py` và thay bằng router
riêng `app/api/savings.py` — theo đúng gợi ý §27 (không tạo endpoint mới
song song nếu use case tương đương đã tồn tại chỗ khác; ở đây ngược lại,
endpoint cũ *thiếu* use case nên được thay bằng router đầy đủ hơn, vẫn dùng
chung service/model, không tạo module thứ hai).

---

## 3. Những gì đã bổ sung

### 3.1 Backend

- `SavingsTermStatus` (`ACTIVE`/`CLOSED`/`EARLY_CLOSED`) — trạng thái lưu ở
  cấp kỳ gửi, độc lập với `SavingsAccountStatus` (OPEN/CLOSED) ở cấp sổ,
  đúng đề xuất §4.
- `SavingsTerm.actual_interest_scaled`, `SavingsTerm.closed_at` — lưu lãi
  thực nhận và thời điểm đóng kỳ, phục vụ lịch sử §20.
- `SavingsAccount.funding_account_id`, `SavingsAccount.notes`.
- `MATURITY_SOON_THRESHOLD_DAYS = 7` (constant, không hard-code rải rác) +
  `days_to_maturity()` / `is_maturing_soon()` — phục vụ trạng thái trình
  bày "Sắp đáo hạn" ở §4.
- Router `app/api/savings.py` (mới) với đầy đủ use case §27:
  `GET/POST /api/v1/assets/savings`, `GET/PATCH
  /api/v1/assets/savings/{id}`, `GET .../terms`, `POST .../close`,
  `.../early-close`, `.../renew`. Tên route giữ theo cấu trúc hiện tại của
  project (`/api/v1/assets/savings/...`) thay vì `/api/v1/savings/...` như
  spec gợi ý, vì đây là use case tương đương và tránh phá vỡ prefix
  `/api/v1/assets` đã dùng cho metals/crypto.
- `find_or_create_product()` — dedup `SavingsProduct` theo
  `(institution, name)` thay vì tạo product mới mỗi lần tạo sổ.
- Field `editable` trên response của account: `true` chỉ khi sổ có đúng 1
  kỳ và kỳ đó đang `ACTIVE` — đúng gate §16.1 (sửa cấu hình trước khi có
  lịch sử) / §16.2 (không sửa `principal`/`start_date`/... sau khi đã có
  event/kỳ tiếp theo).
- Migration `0015_savings_lifecycle` (Alembic, một head duy nhất).
- Test mới: `tests/test_savings_api.py` (13 test HTTP end-to-end qua DB
  SQLite thật, xem mục 5).

### 3.2 Frontend

Toàn bộ UI Sổ tiết kiệm được viết mới trong `apps/web/app/page.tsx`, đúng
quy ước "dense component" hiện có của file này (không tách thư mục
`components/` mới), cộng thêm kiểu dữ liệu trong `lib/api.ts` và bản dịch
trong `lib/i18n.ts`:

- `Modal` — primitive dialog dùng chung (backdrop, Esc để đóng, focus vào
  panel), tái sử dụng cho mọi form savings thay vì form luôn hiện trên
  trang Assets — đúng yêu cầu §5.1.
- `SavingsPanel` — tab "Sổ tiết kiệm" độc lập trong `Assets()`: header tóm
  tắt (Tổng tiền gốc đang gửi / Lãi dự kiến / Số sổ sắp đáo hạn — chỉ tính
  trên sổ đang mở, đúng §18), nút "+ Thêm sổ tiết kiệm", danh sách card.
- `SavingsCreateForm` — form tạo sổ theo đúng 4 nhóm field của §5.2 (Nhóm A
  thông tin sổ / B khoản tiền gửi / C lãi & đáo hạn / D ghi chú), có preview
  ngày đáo hạn tính theo calendar month ngay trên form (client-side, chỉ để
  hiển thị — server vẫn là nguồn sự thật).
- `SavingsCard` (inline trong `SavingsPanel`) — hiển thị ngân hàng, tên sổ,
  gốc, lãi suất, kỳ hạn, ngày gửi → đáo hạn, số ngày còn lại, và badge trạng
  thái suy ra từ `current_term` (Còn hạn / Sắp đáo hạn / Đã đáo hạn / Đã tất
  toán / Tất toán trước hạn) — đúng mockup §18.1.
- `SavingsDetailDialog` — màn hình chi tiết đúng field list §19, action
  button chỉ hiện khi hợp lệ với trạng thái hiện tại (Sửa chỉ khi
  `editable`; Tất toán chỉ khi đã đến/qua hạn; Tất toán trước hạn chỉ khi
  chưa đến hạn; Tái tục chỉ khi `maturity_action != CLOSE`), và bảng lịch sử
  kỳ gửi (§20).
- `SavingsEditForm`, `SavingsCloseForm` (dùng chung cho cả tất toán và tất
  toán trước hạn qua prop `kind`), `SavingsRenewForm`.
- `sumMoney()` — cộng chuỗi tiền chính xác bằng `BigInt` scaled-by-10000
  (cùng kỹ thuật đã dùng sẵn cho quy đổi chỉ vàng trong form kim loại quý),
  không dùng `Number`/`float`, dùng cho tổng hợp ở header.
- `addMonthsLocal()` — bản JS thuần của phép cộng calendar-month, chỉ để
  preview trên form; giá trị `maturity_date` thật luôn lấy từ server.
- Không có action "Rút một phần" trong UI (đúng §15 — domain chưa hỗ trợ,
  không giả lập bằng sửa `principal`).
- `apps/web/scripts/task033-savings-ux-audit.mjs` (mới, đăng ký trong
  `package.json`) — audit tự động cho đúng checklist frontend §32: tab
  riêng, nút "+ Thêm sổ" mở modal (không phải form luôn hiện), đủ field bắt
  buộc trong form tạo sổ, đủ 5 trạng thái hiển thị, các dialog nghiệp vụ tồn
  tại riêng biệt, không có action rút một phần, và — quan trọng nhất — mọi
  chuỗi text truyền qua `tr()`/`ui()` **và** qua prop `label`/`text`/`title`
  của `Field`/`Submit`/`Empty`/`Modal` (những chỗ tự gọi `tr()` bên trong,
  audit cũ `task032-ux-audit.mjs` không quét tới) đều có bản dịch tiếng Việt
  đầy đủ, không chỉ tồn tại ở bản tiếng Anh.

Trong lúc viết audit này, phát hiện một góc đã tồn tại từ trước (không phải
do task này gây ra): field `Field label="Bank template"` trong `Accounts()`
chưa từng có trong từ điển `enUi`/`viUi` — đã tiện tay bổ sung.

---

## 4. Migration (nếu có)

Có một migration: `apps/api/migrations/versions/0015_savings_lifecycle.py`
(`down_revision = "0014_crypto_coin_identity"`, head duy nhất sau khi
upgrade — xác nhận bằng `alembic heads`).

Thêm:

- `savings_accounts.funding_account_id` (FK → `accounts.id`, nullable) và
  `savings_accounts.notes` (nullable).
- `savings_terms.status`, `savings_terms.actual_interest_scaled`,
  `savings_terms.closed_at`.

Vì cột `funding_account_id` có ràng buộc FK, SQLite batch mode buộc phải
drop & recreate toàn bộ bảng `savings_accounts` — mà `savings_terms` là
bảng con tham chiếu tới nó, nên migration phải tháo `savings_terms` ra
trước (capture toàn bộ dòng, drop bảng), sửa `savings_accounts`, rồi tạo
lại `savings_terms` với 3 cột mới đã backfill bằng Python (không dùng SQL
`UPDATE` riêng): kỳ nào bị `renewed_from_term_id` của kỳ khác trỏ tới, hoặc
thuộc sổ đã `CLOSED`, được backfill `status=CLOSED`; còn lại `ACTIVE`. Toàn
bộ dữ liệu khác (id, principal, ngày tháng, liên kết tái tục) được bảo toàn
nguyên vẹn.

Đã kiểm chứng bằng thực nghiệm, không chỉ đọc code:

- Upgrade trên DB rỗng chạy được.
- Upgrade trên bộ dữ liệu tổng hợp (2 sổ, 3 kỳ — một chuỗi tái tục 2 kỳ
  đang hoạt động, một sổ đã đóng 1 kỳ) backfill đúng: kỳ 1 → CLOSED, kỳ 2 →
  ACTIVE, kỳ 3 (sổ đã đóng) → CLOSED.
- Vòng tròn đầy đủ upgrade → downgrade → upgrade lại cho kết quả backfill
  giống hệt lần đầu, không mất dữ liệu.

Không sửa SQLite thủ công; không đọc/ghi dữ liệu tài chính thật ngoài
migration test trên DB tổng hợp trong `tmp_path`.

---

## 5. Test đã chạy

### Backend (`cd apps/api && uv run pytest -q`)

**233 test PASS** (0 fail), bao gồm:

- `tests/test_savings_service.py` — 18 test tầng service (FakeSession, đúng
  quy ước có sẵn của project): tạo sổ + kỳ đầu, `SAVINGS_DEPOSIT` không
  phải expense, principal chính xác, ngày đáo hạn theo calendar month, lãi
  dự kiến chính xác, tất toán đúng hạn, tất toán trước hạn, tái tục gốc,
  tái tục gốc+lãi, lãi thực nhận là income, hoàn gốc không phải income, tất
  toán 2 lần bị reject, tái tục không hợp lệ bị reject.
- `tests/test_savings_api.py` (mới, 13 test) — end-to-end qua HTTP thật
  trên DB SQLite migrate từ đầu: tạo sổ trừ đúng tài khoản nguồn và Net
  Worth không đổi, từ chối tài khoản nguồn không phải ví (Credit Card), list
  & detail, PATCH được phép khi còn 1 kỳ ACTIVE và bị từ chối sau khi đã có
  lịch sử, tất toán đúng hạn tách gốc/lãi đúng số, tất toán trước hạn thu
  phí đúng, tất toán trước hạn bị từ chối sau khi đã đáo hạn, tái tục
  capitalize không tạo ledger event nhưng Net Worth vẫn tăng đúng bằng lãi
  (kiểm cả balance tài khoản ví không đổi), tái tục pay-out bắt buộc phải có
  tài khoản nhận, và **portfolio không double-count principal** (tổng
  component savings = principal thực, Net Worth = tiền mặt còn lại + gốc
  tiết kiệm).
- `tests/test_migrations.py` — 3 test, xác nhận `0015_savings_lifecycle` là
  head duy nhất và chain đúng.
- 202 test còn lại (toàn bộ suite cũ) — không có regression từ việc gỡ
  route savings cũ khỏi `assets.py`.

Kèm: `ruff check .` (All checks passed), `mypy app` (Success: no issues
found in 67 source files), `python -m compileall -q app` (OK), `alembic
heads` (`0015_savings_lifecycle (head)` — một head duy nhất).

### Frontend (`cd apps/web`)

- `npm run typecheck` — PASS.
- `npm run lint -- --max-warnings=0` — PASS (0 warning).
- `npm run build` — PASS (`next build` thành công, 5 trang static).
- Toàn bộ audit script cũ (`task026`…`task032-ux-audit`, `i18n-audit`) —
  PASS, không cần sửa gì (không có regression trên UI đã có).
- `task033-savings-ux-audit.mjs` (mới) — PASS, 118 vị trí gọi `tr()`/`ui()`
  và prop `label`/`text`/`title` được kiểm tra có bản dịch cả hai ngôn ngữ.

### Smoke test thủ công qua UI thật (Playwright + Chromium, thay cho
`scripts/smoke-v1.sh` chạy trong sandbox)

Dựng backend thật (`uvicorn`, DB SQLite migrate từ đầu) + `next build && next
start`, dùng Chromium headless điều khiển trình duyệt thật để:

1. Mở tab Tài sản → xác nhận **không có form nào luôn hiện** trên tab Sổ
   tiết kiệm, chỉ có nút "+ Thêm sổ tiết kiệm".
2. Tạo sổ VCB 100.000.000, kỳ hạn 6 tháng từ 01/01/2026 → xác nhận preview
   ngày đáo hạn hiện đúng `01/07/2026`, sau khi lưu card hiện đúng
   principal/lãi suất/ngày, và trạng thái card tự nhận đúng "Đã đáo hạn"
   (vì ngày hôm nay trong môi trường — 24/08/2026 — đã qua 01/07/2026).
3. Tất toán đúng hạn sổ trên với lãi thực nhận 2.500.000 → lịch sử kỳ hiện
   đúng "Lãi thực nhận: 2.500.000", trạng thái kỳ chuyển "Đã đóng".
4. Tạo sổ thứ hai (MB, 50.000.000, đáo hạn tương lai 01/08/2027) → xác nhận
   UI chỉ hiện nút "Tất toán trước hạn" (không hiện "Tất toán", vì chưa đến
   hạn) — đúng gate theo trạng thái.
5. Tất toán trước hạn sổ MB với lãi 180.000, phí 20.000 → kiểm `GET
   /api/v1/portfolio/overview` sau tất cả thao tác: **Net Worth = 2.660.000
   VND**, đúng bằng tổng lãi thực nhận trừ phí qua cả hai sổ
   (2.500.000 + 180.000 − 20.000), xác nhận không có double-count và không
   có dòng tiền giả nào phát sinh.
6. Tạo sổ thứ ba (Techcombank, tái tục gốc+lãi) → **Sửa** khi còn 1 kỳ
   ACTIVE (đổi lãi suất 4,0% → 4,25%, lưu thành công) → **Tái tục** với lãi
   170.000 → xác nhận principal kỳ mới = 20.170.000 (gốc cũ + lãi, đúng
   §14), lịch sử hiện đủ 2 kỳ, và nút "Sửa" **biến mất** sau khi sổ đã có
   kỳ thứ hai (đúng gate §16.2).
7. Không có lỗi console/page nào trong toàn bộ 3 kịch bản trên.

---

## 6. Kết quả

Tất cả các mục trong Acceptance Criteria §33 của tài liệu BA đã đạt:

- Có tab "Sổ tiết kiệm" riêng, không còn form luôn hiện.
- Có danh sách sổ, có "+ Thêm sổ tiết kiệm" (modal), form rõ ràng theo 4
  nhóm, responsive (grid 2 cột → 1 cột dưới 820px, modal full-height trên
  mobile).
- Có ngân hàng/tổ chức, sản phẩm, tài khoản nguồn bắt buộc.
- Gửi tiết kiệm trừ đúng tài khoản nguồn, không phải Expense, Net Worth
  không đổi tại thời điểm gửi.
- Ngày đáo hạn tính theo calendar month (dùng lại logic đã có, đã kiểm
  bằng test cũ + smoke test mới).
- Lãi dự kiến dùng Decimal chính xác, không tự biến thành Income trước khi
  tất toán.
- Tất toán đúng hạn / trước hạn tách đúng gốc và lãi thực nhận; trước hạn
  dùng đúng lãi suất/lãi thực nhận người dùng nhập, không mặc định lãi suất
  kỳ hạn ban đầu.
- Tái tục gốc và tái tục gốc+lãi đều hoạt động, không double-count (đã kiểm
  bằng cả unit test lẫn smoke test thật qua Net Worth/balance).
- Lịch sử `SavingsTerm` được lưu đầy đủ qua nhiều lần tái tục, không ghi
  đè.
- Sổ đã tất toán không thể tất toán lần hai (`_require_term_active` +
  `_require_open` chặn ở tầng service).
- Không dùng float/Number cho tiền và lãi ở bất kỳ tầng nào (service dùng
  scaled-integer/Decimal; frontend dùng BigInt cho phần tổng hợp).
- Không hard-delete lịch sử tài chính (không có endpoint xoá sổ nào được
  thêm).
- UI tiếng Việt đầy đủ, xác nhận bằng audit tự động quét cả prop
  `label`/`text`/`title`, không chỉ literal `tr()`.
- Backend test PASS (233/233), frontend typecheck/lint/build PASS, Alembic
  đúng một head duy nhất.

---

## 7. Giới hạn còn lại

- **Trường "Tài khoản nhận khi tất toán" mặc định trên sổ (§3.2/§5.2 Nhóm
  D)** không được thêm vào `SavingsAccount`. Tài khoản nhận vẫn được nhập
  lại ở từng thao tác tất toán/tái tục (đúng nghiệp vụ hơn vì tài khoản
  nhận có thể khác nhau mỗi lần), nhưng không có giá trị gợi ý mặc định.
  Đây là lựa chọn có chủ đích để tránh thêm cột/migration cho một tiện ích
  không ảnh hưởng đúng-sai tài chính (đúng nguyên tắc "chỉ thêm khi schema
  hiện tại thật sự không biểu diễn được nghiệp vụ").
- **Ngân hàng/Tổ chức** trong form tạo sổ là ô nhập tự do có gợi ý
  (`<datalist>` từ danh mục ngân hàng có sẵn `lib/bank-catalog.ts`), không
  phải combobox tìm kiếm tuỳ chỉnh như `CategoryPicker`/`CoinPicker` — đơn
  giản hơn mockup §23 nhưng vẫn cho phép chọn nhanh hoặc gõ tên khác.
- **Kỳ hạn (tháng)** là ô nhập số tự do (`type="number"`), không phải dropdown
  các mốc phổ biến như mockup §23 minh hoạ — chấp nhận mọi số tháng dương,
  kể cả kỳ hạn khuyến mãi lẻ (vd. 13 tháng) mà một dropdown cố định sẽ không
  cho phép.
- **Tiền tệ** cố định VND (theo đúng phần còn lại của ứng dụng, chưa hỗ trợ
  đa tiền tệ ở bất kỳ module tài sản nào khác) — không có ô chọn tiền tệ
  trên form tạo sổ dù spec §5.2 liệt kê là field.
- `renew_savings()` không kiểm tra `start_date >= maturity_date` của kỳ
  cũ — về lý thuyết có thể tái tục sớm hơn ngày đáo hạn thực tế. Spec không
  yêu cầu rõ việc chặn này (§13/§14 chỉ mô tả luồng bình thường), và không
  có acceptance criterion nào kiểm tra trực tiếp — để lại như một giới hạn
  đã biết thay vì tự suy diễn thêm validation ngoài đặc tả.
- Không thêm cơ chế idempotency (§26) tường minh (vd. idempotency key) —
  project hiện chưa có cơ chế chung nào để tái sử dụng; rủi ro double-submit
  do double-click vẫn tồn tại ở tầng UI (nút không tự động disable ngay khi
  bấm, dù `useMutation.isPending` có được dùng để disable nút Submit trong
  lúc request đang chạy, giảm nhưng không loại bỏ hoàn toàn rủi ro race).
- Rút một phần (§15), trả lãi định kỳ hàng tháng/quý, và tự động lấy lãi
  suất ngân hàng (§28 P2) — đúng như spec, không triển khai trong task này.
- Phát hiện ngoài phạm vi (chỉ ghi nhận, không sửa): `create_metal`/
  `create_crypto` trong `app/api/assets.py` có cùng mẫu lỗi mà savings từng
  mắc phải trước khi sửa — mua kim loại quý/crypto không tạo ledger event
  nào (không trừ tài khoản nguồn), nên Net Worth tăng ảo khi thêm các tài
  sản này. Đây là vấn đề đã tồn tại từ trước, ngoài phạm vi module Sổ tiết
  kiệm của task này.
