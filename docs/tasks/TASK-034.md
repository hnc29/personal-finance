# TASK-034 — Thanh toán thẻ tín dụng & Điều chỉnh số dư tài khoản

Task này không có tài liệu BA đính kèm — yêu cầu đến trực tiếp bằng lời từ
người dùng, gồm hai phần độc lập:

1. Menu **Giao dịch**: bỏ lựa chọn "Loại giao dịch khác" (dropdown nâng cao
   lộ ra 7 loại sự kiện còn lại), thay bằng một chức năng **Thanh toán thẻ
   tín dụng** riêng, được thiết kế và xây dựng lại với cùng mức độ nghiêm
   túc như module Sổ tiết kiệm (TASK-033): đọc domain hiện có trước, chỉ sửa
   đúng chỗ cần, không viết đè logic đã đúng.
2. Menu **Tài khoản**: thêm chức năng điều chỉnh số dư cho từng tài khoản,
   với giao diện gồm danh sách tài khoản, số dư hiện tại, nút chỉnh sửa; nút
   "Thêm tài khoản" chuyển thành 1 nút bấm ở góc phải thay vì form luôn hiện.

Thực hiện hoàn toàn tự động theo yêu cầu người dùng: tự thiết kế, code, kiểm
thử, tự sửa lỗi; chỉ báo cáo kết quả cuối cùng.

---

## 1. Những gì đã có sẵn (đọc trước khi sửa)

Trước khi viết bất kỳ dòng code nào, đã đọc toàn bộ domain liên quan để xác
định chính xác cần sửa ở tầng nào.

- `FinancialEventType` (`app/models/ledger.py`) đã có sẵn giá trị
  `CREDIT_CARD_PAYMENT` trong số 10 loại sự kiện — không cần thêm enum mới,
  không cần migration.
- `create_financial_event()` (`app/services/ledger.py`) đã validate
  `CREDIT_CARD_PAYMENT` qua `_BALANCED_PAIR_EVENT_TYPES` (đúng 2 bút toán,
  2 tài khoản khác nhau, tổng bằng 0) **và** `_validate_credit_card_payment()`
  riêng (đúng một trong hai tài khoản phải là `CREDIT_CARD`, và bút toán của
  tài khoản đó phải dương — tức thanh toán làm giảm nợ, không phải tăng nợ).
  Đã có test `test_credit_card_payment_requires_card_credit_and_funding_debit`
  bao phủ đúng invariant này. **Kết luận: tầng nghiệp vụ backend đã đúng
  100%, khác với TASK-033 (không có bug nghiệp vụ nào ở đây)** — toàn bộ
  công việc của task này là dựng đúng UI/UX để không ai có thể tạo ra một
  `CREDIT_CARD_PAYMENT` sai cấu trúc từ giao diện.
- `app/models/credit_card.py` / `app/services/credit_card.py` /
  `app/schemas/credit_card.py` — một domain **đã viết đầy đủ nhưng chưa nối
  dây vào đâu cả**: `CreditCardProfile`, `CreditCardStatement` với vòng đời
  ISSUED/PARTIALLY_PAID/PAID/OVERDUE, `record_statement_payment()` chỉ sửa
  in-memory, không `db.commit()`, không sinh ledger event. Xác nhận qua
  `ls app/api/` rằng **không có `app/api/credit_card.py` — domain này chưa
  từng được expose qua API**.
- `ASSET_PURCHASE` / `ASSET_SALE` — grep toàn bộ `.py` xác nhận **không có
  nơi nào sinh ra hai loại sự kiện này** (zero live producer).
- `INTEREST` / `SAVINGS_DEPOSIT` / `SAVINGS_WITHDRAWAL` — từ TASK-033, ba
  loại này đã có action riêng thuộc module Sổ tiết kiệm
  (`open_savings()` / `close_savings()` / `early_close_savings()` /
  `renew_savings()`), luôn đi kèm đúng `SavingsTerm`/`principal` phía sau.
- Số dư tài khoản **không bao giờ được lưu trữ** — luôn tính từ
  `SUM(account_entries.amount_scaled)` qua `account_balance()` /
  `account_balance_scaled()` (`app/services/ledger.py`), đã có sẵn endpoint
  `GET /accounts/{id}/balance` (`AccountBalanceRead`), đã có test bao phủ.
- `AccountRead` (`app/schemas/account.py`) cố tình **không** có trường số
  dư — docstring ghi rõ "No balance is exposed; balances are derived from
  ledger entries elsewhere".

---

## 2. Quyết định thiết kế (vai trò BA)

### 2.1 Composer giao dịch: giới hạn còn đúng 4 loại nhập tay an toàn

Bỏ hoàn toàn dropdown "Loại giao dịch khác" (`eventTypes.slice(3)`), thay
`eventTypes` (10 loại) bằng `composerEventTypes` — đúng 4 loại:
**Chi tiêu, Thu nhập, Chuyển tiền, Thanh toán thẻ tín dụng**. Lý do loại bỏ
từng nhóm còn lại:

| Loại bị loại | Lý do |
|---|---|
| `INTEREST`, `SAVINGS_DEPOSIT`, `SAVINGS_WITHDRAWAL` | Đã có action riêng, đúng invariant, ở module Sổ tiết kiệm. Cho phép tạo tay từ composer sẽ sinh ra một event mồ côi, không có `SavingsTerm`/`principal` phía sau — phá vỡ chính bất biến vừa xây ở TASK-033. |
| `ASSET_PURCHASE`, `ASSET_SALE` | Không có nơi nào trong app sinh ra hai loại này — loại bỏ khỏi composer không gây mất chức năng nào đang hoạt động. |
| `CREDIT_CARD_PAYMENT` | Không loại bỏ — nâng cấp thành fieldset riêng có hướng dẫn (mục 2.2), thay vì để trong dropgroup "loại khác" dùng chung 2 ô nhập tài khoản/tiền không kiểm soát được loại tài khoản. |

### 2.2 Thanh toán thẻ tín dụng — fieldset riêng, không phải double-entry thô

Trước đây, muốn tạo `CREDIT_CARD_PAYMENT`, người dùng phải chọn loại này từ
dropdown "khác" rồi tự nhập 2 dòng bút toán tay (giống hệt giao diện dùng
cho `ADJUSTMENT`/`ASSET_PURCHASE`...), không có gợi ý tài khoản nào là thẻ,
tài khoản nào là nguồn tiền, dấu +/- rất dễ nhập sai (nếu nhập ngược dấu,
`_validate_credit_card_payment()` sẽ chặn ở server nhưng người dùng nhận
lỗi khó hiểu).

Thiết kế mới: fieldset "Thẻ tín dụng" độc lập với 3 trường:

- **Thẻ tín dụng** — `<select>` chỉ liệt kê tài khoản `account_type ===
  "CREDIT_CARD"` đang active.
- **Từ tài khoản** — `<select>` chỉ liệt kê tài khoản `account_type !==
  "CREDIT_CARD"` đang active (tiền mặt/ngân hàng/ví).
- **Số tiền thanh toán** — một ô nhập dương duy nhất.

Vì hai `<select>` được lọc theo `account_type` đối lập nhau, **không thể
chọn trùng tài khoản** — loại bỏ hẳn lớp lỗi "chọn 2 tài khoản giống nhau"
mà `TRANSFER` vẫn phải tự validate bằng tay. `submit()` tự dựng đúng cặp bút
toán cân bằng: tài khoản nguồn bị trừ (`-số tiền`), thẻ tín dụng được cộng
dương (`+số tiền`, đúng yêu cầu `_validate_credit_card_payment` rằng bút
toán thẻ phải dương = giảm nợ). Có hint "Chưa có thẻ tín dụng nào..."/"Chưa
có tài khoản ví nào..." khi danh sách tương ứng rỗng, tái sử dụng đúng câu
hint nguồn tiền đã có từ TRANSFER (TASK-033).

**Quyết định phạm vi:** không đụng vào `CreditCardProfile`/
`CreditCardStatement` — hai bảng này vẫn hoàn toàn không có API, việc thanh
toán ở đây chỉ tạo đúng một ledger event cân bằng, không cập nhật số dư sao
kê/trạng thái ISSUED-PAID nào (vì domain đó chưa tồn tại ở tầng API). Ghi
nhận đây là khoảng trống đã biết trước, giống cách TASK-033 đã ghi nhận
khoảng trống kim loại quý/crypto chưa nối ledger.

### 2.3 Điều chỉnh số dư tài khoản

Trang **Tài khoản** được viết lại hoàn toàn theo đúng pattern modal đã dùng
cho Sổ tiết kiệm (TASK-033) thay vì form luôn hiện:

- Nút **"+ Thêm tài khoản"** ở góc phải (thay cho form tạo luôn hiện phía
  trên danh sách) — mở modal `AccountFormDialog` dùng chung cho cả tạo mới
  và sửa (`Sửa` trên mỗi thẻ tài khoản mở cùng modal với dữ liệu điền sẵn).
- Mỗi thẻ tài khoản hiển thị **số dư hiện tại** (lấy qua
  `GET /accounts/{id}/balance`, gộp thành 1 hook `useAccountBalances()` fetch
  hàng loạt dưới 1 query key thay vì N query riêng lẻ).
- Nút **"Điều chỉnh số dư"** mở modal `AccountAdjustForm`: hiển thị số dư
  hiện tại, cho nhập **số dư mới**, tự tính và hiển thị **chênh lệch** bằng
  đúng phép trừ tiền chính xác (không dùng float — tái dùng `sumMoney()`
  dạng BigInt-scaled đã có từ TASK-033, cộng 2 helper mới `negateMoney()` /
  `isZeroMoney()`), khoá nút lưu khi chênh lệch bằng 0 ("Không có thay đổi
  để lưu"). Khi lưu, gửi đúng một event `ADJUSTMENT` với một bút toán duy
  nhất bằng đúng số chênh lệch vào tài khoản đang chỉnh — không phải
  `TRANSFER`, vì đây là một điều chỉnh thực (thay đổi Net Worth), không
  phải chuyển tiền giữa 2 tài khoản đã có trên bảng cân đối.

**Quyết định phạm vi:** không mở rộng `AccountRead`/`GET /accounts` để trả
kèm số dư, dù về lý thuyết gọn hơn ở client. Lý do: `AccountRead` hiện cố
tình không có trường số dư (docstring nêu rõ lý do), và test
`test_accounts_api.py` dùng `FakeAccountStore` — object giả không có thuộc
tính `.balance`, nếu thêm computed field vào `response_model` sẽ vỡ
serialization của toàn bộ test suite đó mà không mang lại giá trị tương
xứng. Dùng lại đúng endpoint `GET /accounts/{id}/balance` đã có sẵn và đã
test, an toàn hơn.

---

## 3. Thay đổi cụ thể

### Backend — **không thay đổi gì**

Đã xác nhận toàn bộ nghiệp vụ cần thiết (validate cặp cân bằng, validate thẻ
tín dụng, tính số dư, event `ADJUSTMENT`) đã tồn tại và đúng. Không có
migration nào trong task này (khác TASK-033 vốn cần `0015_savings_lifecycle`).

### Frontend (`apps/web/`)

- `lib/api.ts`: thêm `AccountBalance` type và `api.accounts.balance(id)`
  gọi `GET /accounts/{id}/balance`.
- `lib/i18n.ts`: bỏ 3 khoá gắn với dropdown "loại khác" cũ
  (`entryAmountHelp`, `otherTransactionType`, `entryHelp`) khỏi cả `enUi` và
  `viUi`; thêm ~10 khoá mới cho điều chỉnh số dư và thanh toán thẻ tín dụng
  (cả hai ngôn ngữ).
- `app/page.tsx`:
  - `eventTypes` (10 phần tử) → `composerEventTypes` (4 phần tử: EXPENSE,
    INCOME, TRANSFER, CREDIT_CARD_PAYMENT).
  - Thêm `negateMoney()`, `isZeroMoney()`, `useAccountBalances()`.
  - Viết lại `Transactions()`: bỏ segmented-control-nâng-cao, thêm fieldset
    "Thẻ tín dụng" riêng (mục 2.2), sửa `submit()` dựng đúng cặp bút toán
    cho `CREDIT_CARD_PAYMENT`.
  - Viết lại hoàn toàn `Accounts()` + 2 component mới
    `AccountFormDialog` (tạo/sửa, dùng chung modal) và `AccountAdjustForm`
    (điều chỉnh số dư, mục 2.3).
- `app/styles.css`: thêm `.account-balance`.
- `scripts/task032-ux-audit.mjs`: 3 assertion cũ đòi hỏi
  `eventTypes.slice(3)` / `eventTypes.slice(0, 3)` / `entryAmountHelp` sau
  `<details>` **đã lỗi thời theo đúng yêu cầu mới của người dùng** — thay
  bằng assertion mới xác nhận `composerEventTypes` được dùng,
  `CREDIT_CARD_PAYMENT` khả dụng, và không còn tham chiếu `eventTypes` cũ
  nào sót lại (đúng tiền lệ TASK-032 từng thay thế assertion lỗi thời của
  TASK-031).
- `scripts/task034-transactions-accounts-audit.mjs` (mới): xác nhận
  composer chỉ còn đúng 4 loại, không còn dropdown nâng cao; fieldset thẻ
  tín dụng có đủ 3 trường lọc đúng theo `account_type`; `submit()` dựng
  đúng cặp bút toán trừ nguồn/cộng thẻ; trang Tài khoản có nút "+" thay vì
  form luôn hiện, dùng `useAccountBalances`, có action điều chỉnh; điều
  chỉnh số dư dùng đúng `sumMoney`/`negateMoney` và chặn khi chênh lệch = 0;
  quét i18n toàn bộ call site `tr()`/`ui()`/prop `label`/`text`/`title`
  (128 vị trí) có bản dịch đủ cả hai ngôn ngữ. Đăng ký vào `package.json`.
- Trong lúc smoke test qua UI thật, phát hiện một lỗi nhỏ **có sẵn từ
  trước** (không phải do sửa đổi lần này gây ra, nhưng bị lộ ra khi test
  qua `CREDIT_CARD_PAYMENT`/`ADJUSTMENT` — hai loại giao dịch không mở
  "+ Thêm chi tiết"): dòng `payee_text: String(f.get("payee")).trim() ||
  undefined` khi input "payee" không tồn tại trong DOM (`detailsOpen ===
  false`) trả về `String(null)` = chuỗi `"null"` (truthy!) thay vì
  `undefined` — mọi giao dịch tạo mà không mở "Thêm chi tiết" sẽ lưu literal
  string `"null"` vào `payee_text`/`trip_event_text`/`note`. Đã sửa thành
  `String(f.get("payee") ?? "").trim() || undefined` cho cả 3 trường; xác
  nhận bằng smoke test qua `GET /financial-events` rằng các trường này giờ
  trả đúng `null` thay vì chuỗi `"null"`.

---

## 4. Kiểm thử

### Backend (`cd apps/api`)

- `uv run pytest -q` — **233 passed** (không có test nào sửa/thêm vì không
  đổi backend; chạy lại để xác nhận zero regression).

### Frontend (`cd apps/web`)

- `npm run typecheck` — PASS.
- `npm run lint -- --max-warnings=0` — PASS (0 warning).
- `npm run build` — PASS (`next build` thành công, 5 trang static).
- Toàn bộ audit cũ (`task026`…`task033-savings-ux-audit`, `i18n-audit`) —
  PASS sau khi cập nhật 3 assertion lỗi thời trong `task032-ux-audit.mjs`.
- `task034-transactions-accounts-audit.mjs` (mới) — PASS, 128 vị trí gọi
  `tr()`/`ui()`/prop `label`/`text`/`title` được kiểm tra có bản dịch cả
  hai ngôn ngữ.

### Smoke test qua UI thật (Playwright + Chromium headless, cùng phương
pháp TASK-033: backend `uvicorn` thật trên DB SQLite migrate từ đầu +
`next build && next start`, không phải mock)

Seed: tài khoản Vietcombank (BANK) = 10.000.000, VCB Visa (CREDIT_CARD) =
−3.000.000 (dư nợ), Net Worth = 7.000.000.

1. Mở tab Giao Dịch → xác nhận **không còn** control "Loại giao dịch khác"
   nào trên trang (quét toàn bộ text). Segmented control chỉ còn đúng 4 nút:
   Chi tiêu / Thu nhập / Chuyển tiền / Thanh toán thẻ tín dụng.
2. Chọn "Thanh toán thẻ tín dụng" → fieldset đúng như thiết kế: chọn VCB
   Visa làm thẻ, Vietcombank làm tài khoản nguồn, nhập 1.000.000 → Ghi giao
   dịch.
3. Kiểm `GET /accounts/{id}/balance`: Vietcombank 10.000.000 → **9.000.000**
   (đúng bị trừ), VCB Visa −3.000.000 → **−2.000.000** (đúng giảm nợ đúng
   1.000.000). `GET /portfolio/overview`: Net Worth **không đổi** (vẫn
   7.000.000 VND) — đúng vì đây là transfer giữa 2 tài khoản đã nằm trên
   bảng cân đối, không phải dòng tiền mới.
4. Chuyển sang tab Tài Khoản → xác nhận **không có form tạo tài khoản nào
   luôn hiện**, chỉ có nút "+ Thêm tài khoản" ở góc phải; mỗi thẻ tài khoản
   hiển thị đúng số dư mới (9.000.000 / −2.000.000) và có nút "Điều chỉnh
   số dư".
5. Bấm "Điều chỉnh số dư" trên Vietcombank → modal hiện đúng số dư hiện tại
   9.000.000, nhập số dư mới 9.500.000 → hiện đúng "Chênh lệch: 500000" →
   Lưu thay đổi.
6. Kiểm `GET /financial-events`: một event `ADJUSTMENT` mới, đúng 1 bút
   toán +500.000 vào Vietcombank, `payee_text`/`trip_event_text`/`note` đều
   là `null` thật (không phải chuỗi `"null"`, xác nhận fix ở mục 3). `GET
   /accounts/1/balance` = 9.500.000. `GET /portfolio/overview`: Net Worth
   7.000.000 → **7.500.000**, tăng đúng bằng 500.000 — đúng vì đây là điều
   chỉnh thực (không phải transfer), phải phản ánh vào Net Worth.
7. Không có `pageerror` nào trong toàn bộ kịch bản; một warning console
   `404` xác nhận là `favicon.ico` thiếu — lỗi thẩm mỹ có sẵn từ trước,
   không liên quan tính năng, không sửa trong task này.

Ảnh chụp màn hình từng bước đã lưu lại trong quá trình test (form thanh
toán thẻ tín dụng, modal điều chỉnh số dư, trang Tài khoản trước/sau).

---

## 5. Kết quả

- Menu Giao dịch không còn "Loại giao dịch khác"; Thanh toán thẻ tín dụng
  là một fieldset riêng, có hướng dẫn, không thể chọn trùng tài khoản do
  hai `<select>` lọc theo `account_type` đối lập nhau.
- Backend nghiệp vụ thanh toán thẻ tín dụng xác nhận đã đúng từ trước, không
  cần sửa — chỉ nâng cấp trải nghiệm nhập liệu ở frontend.
- Menu Tài khoản có danh sách tài khoản kèm số dư hiện tại (tính từ ledger,
  không lưu trữ riêng), có nút "Điều chỉnh số dư" per-account dùng đúng số
  học tiền chính xác (không float), và nút "Thêm tài khoản" đã chuyển thành
  1 nút góc phải thay cho form luôn hiện.
- Phát hiện và sửa một lỗi nhỏ có sẵn từ trước (chuỗi `"null"` bị lưu vào
  `payee_text`/`trip_event_text`/`note` khi không mở "Thêm chi tiết").
- Không thêm migration nào; không đổi bất kỳ file backend nào; zero
  regression đã xác nhận qua 233 test backend + toàn bộ audit/typecheck/
  lint/build frontend + smoke test UI thật qua Net Worth/balance.
- Không nối dây `CreditCardProfile`/`CreditCardStatement` (ghi nhận là
  khoảng trống đã biết, ngoài phạm vi task này, tương tự khoảng trống kim
  loại quý/crypto đã ghi nhận ở TASK-033).
