# Quy tắc nghiệp vụ

Mọi quy tắc dưới đây được đối chiếu trực tiếp với mã nguồn (đường dẫn cụ
thể trong ngoặc). Ở những chỗ mã nguồn hiện tại **khác** với
`docs/BA-SPEC.md` (đặc tả gốc, mốc `v2.00`, 2026-08-25) hoặc
`CHANGELOG.md`, ghi chú rõ khác biệt đó — vì các tài liệu này đã bị code
đi vượt qua ở vài điểm.

## 1. Tài khoản & thẻ tín dụng

`app/models/account.py`, `app/models/credit_card.py`, `app/services/account.py`.

- 4 loại `AccountType`: `CASH`, `BANK`, `CREDIT_CARD`, `EWALLET`. Không có
  cột số dư lưu sẵn — luôn tính động (xem `ARCHITECTURE.md`).
  Không bao giờ hard-delete — chỉ `is_active=false`.
- `Account.sort_order`: thứ tự người dùng tự sắp, cũng là thứ tự hiển thị
  khi ghi giao dịch (migration 0016).
- `CreditCardProfile` (1-1 với 1 `Account` loại `CREDIT_CARD`): hạn mức,
  `statement_day`, `payment_due_day`, `payment_due_month_offset`.
  `calculate_due_date()` tính ngày đến hạn từ ngày sao kê + offset tháng.
- `CreditCardStatement`: từng kỳ sao kê, ràng buộc DB
  `paid_scaled <= balance_due_scaled` — không bao giờ trả thừa.
  `refresh_status()`: máy trạng thái PAID/OVERDUE/PARTIALLY_PAID/ISSUED.
- **Khoảng trống đã biết**: `app/api/` **không có router riêng cho thẻ tín
  dụng** — `CreditCardProfile`/`CreditCardStatement` chỉ tồn tại ở tầng
  model+service, chưa expose HTTP. Thanh toán thẻ vào sổ cái
  (`CREDIT_CARD_PAYMENT`, mục 5 dưới) được validate hoàn toàn độc lập ở
  tầng `ledger` service — **không liên kết** với billing-cycle
  (`balance_due`/`paid`), hai hệ thống không tự đối chiếu nhau.
- Khởi tạo hàng loạt tài khoản từ nguồn ngoài: `services/account_bootstrap.py`
  — nhận diện ~19 ngân hàng VN qua alias exact-match (không fuzzy), chỉ
  tạo khi tên khớp **duy nhất một** ngân hàng, không tự tạo tài khoản
  trùng tên đã có.

## 2. Sổ cái / giao dịch (`FinancialEvent`)

`app/models/ledger.py`, `app/services/ledger.py`, `app/api/financial_events.py`.

10 giá trị `FinancialEventType`:

| Loại | Số entry | Ai tạo | Sửa/xoá qua composer chung? |
|---|---|---|---|
| `EXPENSE` | 1 (âm) | Composer Giao dịch; import Money Lover | Có |
| `INCOME` | 1 (dương) | Composer Giao dịch; import Money Lover | Có |
| `TRANSFER` | 2 (cân bằng) | Composer; ghép cặp Money Lover | Có |
| `CREDIT_CARD_PAYMENT` | 2 (cân bằng, 1 vế phải là thẻ) | Chỉ qua `POST /financial-events` | Có |
| `INTEREST` | 1 (dương) | `savings.py`: tất toán/tái tục | Không |
| `SAVINGS_DEPOSIT` | 1 (âm) | `savings.py`: mở sổ/nạp thêm | Không |
| `SAVINGS_WITHDRAWAL` | 1 (dương) | `savings.py`: rút/tất toán | Không |
| `ASSET_PURCHASE` | — | **Chưa có luồng nào tạo ra trong code thật** | Không |
| `ASSET_SALE` | — | **Chưa có luồng nào tạo ra trong code thật** | Không |
| `ADJUSTMENT` | 1 (± delta) | Form điều chỉnh số dư (trang Tài khoản) → `POST /financial-events` | Không |

`EDITABLE_EVENT_TYPES` (`app/services/ledger.py`) = đúng 4 loại
`{EXPENSE, INCOME, TRANSFER, CREDIT_CARD_PAYMENT}`. Ranh giới này được
chặn ở **cả hai tầng**: frontend ẩn nút Sửa/Xoá cho loại khác
(`composerEventTypes` trong `page.tsx`), backend ném
`ProtectedEventTypeError` → HTTP 409 — vì client không phải ranh giới tin
cậy.

**Khoảng trống thật, không phải cố ý bỏ**: `ASSET_PURCHASE`/`ASSET_SALE`
tồn tại như enum, được `EDITABLE_EVENT_TYPES` loại trừ, model `CryptoLot`
có sẵn field `financial_event_id`/`funding_account_id` để liên kết —
nhưng **không có service/endpoint nào thực sự tạo ra event loại này**.
Mua vàng/crypto qua `POST /api/v1/assets/metals|crypto` hiện tại **không
ghi sổ cái, không trừ số dư tài khoản nguồn tiền nào** (đã xác nhận trong
`apps/api/app/api/assets.py::create_metal`/`create_crypto` — không có
`FinancialEvent` nào được tạo ở đó).

`PATCH /financial-events/{id}` là **thay toàn bộ** (không phải patch từng
trường), khớp với cách composer frontend luôn re-submit cả form khi Sửa.
`DELETE` có tham số `force=True` để bypass `ProtectedEventTypeError` (dùng
khi xoá cả sổ tiết kiệm kèm giao dịch liên quan — xem UI "Delete
asset-related transactions as well").

Danh mục (`category_id`) không bắt buộc chọn lá — DB không giới hạn độ
sâu, nhưng tầng ứng dụng giới hạn **tối đa 3 cấp**
(`Category` service `_depths()`).

## 3. Cờ `excluded_from_reports`

Migration `0019` (2026-08-26), thêm cột Boolean `excluded_from_reports`
(mặc định `false`) vào **4 bảng**: `financial_events`,
`precious_metal_holdings`, `crypto_holdings`, `savings_accounts` — **không**
áp dụng cho `accounts` (ví tiền mặt/ngân hàng không phải "tài sản" theo
nghĩa tab Tài sản).

- Độc lập với `is_net_worth` (đã có sẵn trên vàng/crypto): một tài sản có
  thể vẫn tính Net Worth mà vẫn bị loại khỏi báo cáo — hai cột tách biệt,
  không dùng chung.
- Đặt cờ **không ảnh hưởng gì** tới ledger/số dư/Net Worth — chỉ là một
  bit để lọc ở tầng báo cáo.
- Sổ tiết kiệm: cờ này **luôn sửa được** qua `PATCH` kể cả sau khi sổ đã
  có lịch sử/gia hạn (khác mọi field khác của sổ, vốn bị khoá sau thao
  tác vòng đời đầu tiên) — xử lý riêng trong `services/savings.py`.
- **Khác biệt quan trọng với `CHANGELOG.md`**: mục `v3.00` ghi "app hiện
  chưa có trang báo cáo tổng hợp thu chi nào để thực sự lọc theo cờ này"
  — **điều này không còn đúng ở code hiện tại**. `Reports()` (component
  trong `apps/web/app/page.tsx`, tab "Báo cáo" trong `navItems`) đã tồn
  tại và **đã lọc** theo `excluded_from_reports` (dòng
  `if (e.excluded_from_reports) return false;` trong `Reports()`). Trang
  Báo cáo được thêm ở commit sau đó (`7063e72`, sau commit đã ghi
  changelog `v3.00`), nên `CHANGELOG.md` chưa được cập nhật theo — hãy tin
  code, không tin changelog, cho tính năng này.

## 4. Sổ tiết kiệm (`savings.py`)

`app/models/savings.py`, `app/services/savings.py`, `app/api/savings.py`.

Mô hình 3 tầng: `SavingsProduct` (sản phẩm/ngân hàng) →
`SavingsAccount` (`principal_scaled` sống, `status` OPEN/CLOSED) →
`SavingsTerm` (một kỳ hạn trong chuỗi tái tục, `status` riêng
ACTIVE/CLOSED/EARLY_CLOSED qua `renewed_from_term_id`).

**Nguyên tắc cốt lõi**: gửi/rút gốc **không bao giờ là Income/Expense** —
chỉ là chuyển tài sản (Bank → Savings), Net Worth không đổi. **Chỉ lãi
mới là Income thật** (`INTEREST`). Khi `RENEW_PRINCIPAL_AND_INTEREST`
(gộp lãi vào gốc), **không tạo ledger event nào** — lãi được ghi nhận
thuần bằng cách tăng `principal_scaled` của kỳ mới; Net Worth vẫn tăng
đúng bằng lãi vì đọc trực tiếp `principal`, tránh bịa dòng tiền gửi giả.

Công thức tính lãi dự phóng (`calculate_interest()`, hàm thuần, không ghi
DB):

```
interest = principal × rate/100 × days/denominator
```
làm tròn `ROUND_HALF_UP` 4 chữ số thập phân. `denominator` = 360
(`ACTUAL_360`, `THIRTY_360`) hoặc 365 (`ACTUAL_365`). Dùng `annual_rate`
nếu `end_date >= maturity_date`, tự động chuyển sang `non_term_rate` (lãi
suất không kỳ hạn) nếu tất toán trước hạn — không cần caller tự branching.

`actual_interest_scaled` trên `SavingsTerm` là **bản ghi lịch sử thực tế
đã trả**, tách biệt khỏi `calculate_interest()` — vì lãi ngân hàng trả
thật có thể khác công thức lý thuyết (làm tròn, ưu đãi...).

Thao tác vòng đời (đều qua `_asset_movement()` — luôn 1 entry đơn lẻ lên
một tài khoản ví thật CASH/BANK/EWALLET, không bao giờ CREDIT_CARD hay sổ
tiết kiệm khác):

- **Mở sổ / nạp thêm** (`open_savings`, `add_to_savings`): `SAVINGS_DEPOSIT`.
- **Rút một phần** (`partial_withdraw`): giảm gốc, không tất toán lãi —
  **chưa lên UI ở bản V1**, chỉ dùng được ở tầng service.
- **Tất toán đúng hạn** (`close_savings`): bắt buộc
  `closed_date >= maturity_date`. Ghi `SAVINGS_WITHDRAWAL` (toàn bộ gốc)
  **và riêng** `INTEREST` (lãi thực nhận, `actual_interest` do caller
  cung cấp — BA spec §10 cấm giả định dùng lãi lý thuyết).
- **Tất toán trước hạn** (`early_close_savings`): bắt buộc
  `closed_date < maturity_date`. Cùng cặp `SAVINGS_WITHDRAWAL`+`INTEREST`,
  cộng phí phạt tuỳ chọn ghi là `EXPENSE` âm (không có loại riêng cho phí
  phạt).
- **Tái tục** (`renew_savings`): nếu `maturity_action=RENEW_PRINCIPAL` →
  lãi trả thật bằng `INTEREST` event (cần `receiving_account_id`), chỉ
  gốc ban đầu chuyển sang kỳ mới; nếu
  `RENEW_PRINCIPAL_AND_INTEREST` → gộp lãi vào gốc, không ledger event.

Bất biến: không rút quá gốc; không tất toán đúng hạn trước ngày đáo hạn;
không tất toán sớm sau ngày đáo hạn; không tái tục kỳ có
`maturity_action=CLOSE`; chỉ `PATCH` trực tiếp các field của sổ khi sổ mới
có đúng 1 kỳ hạn và kỳ đó còn ACTIVE (trừ riêng `excluded_from_reports`,
xem mục 3).

## 5. Kim loại quý (vàng/bạc)

`app/models/precious_metal.py`, `app/services/pricing.py`,
`app/services/metal_price_adapters.py`, `app/services/metal_price_reference.py`.

- `PreciousMetalHolding`: loại (`GOLD`/`SILVER`), thương hiệu
  (`SJC`/`BTMC`/`BTMH`/`DOJI`/`PNJ`/`RAW`), `purity_scaled` (vd 9999 =
  99.99%), `pricing_instrument` (mã tra giá, có thể override thủ công).
- `PreciousMetalLot`: số lượng + đơn vị
  (`GRAM`/`CHI`/`LUONG`/`KILOGRAM` — quy đổi qua `GRAMS_PER_UNIT`:
  1 / 3.75 / 37.5 / 1000), luôn canonical hoá về gram (`grams_scaled`),
  `total_cost_scaled` (tổng tiền đã trả thực tế — **không** suy ra từ
  giá×lượng, để chứa phí/làm tròn thật), `funding_account_id` tồn tại
  trên model **nhưng endpoint tạo hiện tại không set nó và không tạo
  `FinancialEvent`** — mua vàng qua API hiện tại không ảnh hưởng số dư sổ
  cái (giống crypto, xem mục 2).

### Chọn nguồn giá — quy tắc **không fallback chéo thương hiệu**

`resolve_metal_instrument(brand, product_type, purity)`
(`app/services/pricing.py`) suy ra mã instrument canonical từ brand +
loại sản phẩm (nhẫn/miếng/trang sức/nguyên liệu) + độ tinh khiết (hậu tố
`999` hoặc `9999`), ví dụ `"BTMC_PLAIN_RING_9999"`.

`select_metal_quote()` — thứ tự ưu tiên **nghiêm ngặt cho ĐÚNG MỘT
instrument đó**, docstring gọi rõ là "Rule 5 & 6":

1. Báo giá LIVE từ provider **đúng thương hiệu** của chính holding, khớp
   `match_level=EXACT`.
2. Báo giá STALE từ lịch sử cache **đúng instrument đó**.
3. Báo giá MANUAL đúng instrument đó.
4. `UNAVAILABLE` — **"never return price=0, never fallback cross-brand"**
   (nguyên văn comment trong code).

`tests/test_pricing.py::test_selection_never_cross_brand_falls_back_when_own_brand_fails`
xác nhận: nếu provider SJC lỗi, hệ thống **không** thử DOJI hay BTMC thay
thế.

> **Khác biệt với `docs/BA-SPEC.md`**: BA-SPEC §5.1 mô tả một "chuỗi ưu
> tiên nhà cung cấp: BTMC → BTMH → DOJI → SJC" nghe như fallback chéo
> thương hiệu. Mã nguồn hiện tại **và test đi kèm cố tình không làm vậy**
> — không bao giờ dùng giá của thương hiệu B để định giá holding thương
> hiệu A. Tin code + test, không tin câu chữ đó trong BA-SPEC.

### Quy tắc giá tham chiếu BTMC (mới nhất, 2026-08-27 — `metal_price_reference.py`)

Yêu cầu người dùng (nguyên văn, đã áp dụng): *"giá vàng ở btmc làm tham
chiếu, các loại nhẫn và miếng của BTMH/BTMC/DOJI coi giá bằng nhau, vàng
miếng SJC lấy trên bảng giá, vàng nguyên liệu cũng lấy trên bảng giá"*.

Cách triển khai (không đụng `resolve_metal_instrument()`/
`select_metal_quote()` ở trên — vẫn giữ mã instrument riêng biệt theo
thương hiệu; chỉ **một adapter** (`BtmcPriceAdapter`, luôn fetch
`https://btmc.vn/`) được cấu hình trả lời cho **nhiều mã instrument khác
nhau**, tất cả trỏ về cùng một dòng thật trên trang btmc.vn):

- `BTMC_PLAIN_RING_*`, `BTMH_PLAIN_RING_*`, `DOJI_PLAIN_RING_*`,
  `BTMC_GOLD_BAR_*`, `BTMH_GOLD_BAR_*`, `DOJI_GOLD_BAR_*`,
  `PNJ_PLAIN_RING_*`, `DOJI_JEWELRY_*` → cùng trỏ dòng **"NHẪN TRÒN TRƠN
  BẢO TÍN MINH CHÂU"** trên btmc.vn (⇒ tự động "coi giá bằng nhau").
- `SJC_GOLD_BAR_*` → dòng **"VÀNG MIẾNG SJC"** trên btmc.vn.
- `RAW_*` (mọi hình dạng) → dòng **"VÀNG NGUYÊN LIỆU"** trên btmc.vn.
- Trang sức thường (không phải DOJI) và PNJ (ngoài nhẫn) **cố tình không**
  nằm trong quy tắc này — vẫn `UNAVAILABLE` trừ khi có báo giá MANUAL.

`get_or_refresh_metal_quote()`: đọc cache DB trước, chỉ fetch lại nếu
cache cũ hơn `REFRESH_INTERVAL = 30 phút`. **Không bao giờ raise** — lỗi
mạng/parse → dùng cache cũ (có thể `None`), lỗi persist do trùng unique
constraint → rollback rồi đọc lại bản ghi đã tồn tại. Một site chập chờn
không bao giờ làm sập cả trang portfolio.

Giá hiển thị trên btmc.vn là **giá cho 1 chỉ**, cần nhân 1000 mới ra giá
trị thật (`unit_scale=Decimal(1000)` khi khởi tạo adapter) — nếu quên
nhân, mọi giá parse ra sẽ sai 1000 lần.

`baotinmanhhai.vn` và `banggia.doji.vn` **có adapter đã viết + test
riêng** (`BtmhPriceAdapter`, `DojiPriceAdapter` trong
`metal_price_adapters.py`) nhưng **không có provider nào thật sự gọi tới
chúng** trong `metal_price_reference.py` — 2 site này không fetch được
trong môi trường sandbox lúc phát triển (SSL/robots.txt lỗi với
baotinmanhhai; banggia.doji.vn render JS phía client, không có bảng giá
trong HTML server-render). Chỉ btmc.vn được nối dây thật.

**Trước batch này, toàn bộ pipeline `append_quote`/`current_quote` là
scaffolding chết** — không API/service nào gọi tới, nên `portfolio_overview()`
luôn hiện kim loại quý `UNAVAILABLE` dù model/adapter/test đã có đủ. Batch
BTMC (2026-08-27) là lần đầu nối dây thật (`read_models.py` đổi
`current_quote()` → `get_or_refresh_metal_quote()`).

## 6. Crypto

`app/models/crypto.py`, `app/services/crypto_coin_catalog.py`,
`app/services/crypto_pricing.py`, `app/services/fx_rate.py`.

- `CryptoHolding.coingecko_id` là **khoá danh tính chính** (không phải
  symbol — vì symbol có thể trùng giữa nhiều coin khác nhau).
- `CryptoLot.quantity_scaled` dùng `CRYPTO_QUANTITY_SCALE = 100_000_000`
  (8 chữ số thập phân), khác tỷ lệ tiền 4 chữ số.
- `CryptoLot` có sẵn cả `funding_account_id` **và** `financial_event_id`
  để liên kết ngược sổ cái — nhưng **cùng khoảng trống như vàng**:
  `POST /api/v1/assets/crypto` chỉ tạo holding+lot, không set các field
  này, không tạo `FinancialEvent`.
- Mua bằng USD tự quy đổi VND theo tỷ giá thời gian thực
  (`GET /api/v1/fx/usd-vnd`, `UsdVndRateProvider` gọi
  `open.er-api.com`, cache trong bộ nhớ 1 giờ, fallback về rate cũ nếu
  nguồn lỗi).

### Hai nguồn giá crypto khác nhau — cần phân biệt rõ (đã kiểm chứng qua source, không suy đoán)

Có **hai** adapter riêng biệt trong `crypto_pricing.py`, phục vụ hai mục
đích khác nhau — dễ nhầm lẫn nếu chỉ đọc `config.py`:

1. **CoinGecko** (`app/services/crypto_coin_catalog.py`,
   `CoinGeckoCoinListProvider`, dùng
   `settings.coingecko_coins_url = "https://api.coingecko.com/api/v3/coins/list"`):
   chỉ phục vụ **tra cứu danh tính coin** — endpoint
   `GET /api/v1/assets/crypto/coins?q=...` để tìm `coingecko_id` khi
   người dùng nhập tay. Cache 6 giờ. **Không dùng để lấy giá.**
   (`CoinGeckoPriceAdapter` cũng tồn tại trong file nhưng **không có nơi
   nào import/gọi nó** — code chết.)
2. **CoinMarketCap** (`CoinMarketCapPriceAdapter`,
   `sync_crypto_holdings_prices()`): đây mới là adapter **thật sự được
   gọi** khi định giá — endpoint `POST /api/v1/assets/crypto/sync-prices`
   (nút "đồng bộ giá" trên UI) gọi thẳng
   `sync_crypto_holdings_prices()`, fetch endpoint listing **không chính
   thức** của CoinMarketCap
   (`api.coinmarketcap.com/data-api/v3/cryptocurrency/listing`), quy đổi
   USD→VND qua `open.er-api.com` (fallback rate cứng
   `26000.0000` nếu tỷ giá cũng lỗi), rồi ghi `PriceQuote` cho từng
   holding khớp theo symbol/display_name/coingecko_id. Giá dùng để định
   giá Net Worth trong `portfolio_overview()` (qua `current_quote()`, đọc
   `PriceQuote` mới nhất đã lưu — **không** tự fetch lại tại thời điểm
   xem, khác cơ chế 30-phút-refresh của vàng) chính là giá đến từ nguồn
   này.

Nói cách khác: **`description_gemini/` không hoàn toàn sai khi nói giá
crypto đến từ CoinMarketCap** — endpoint sync-prices thật sự dùng
CoinMarketCap. Nhưng nói "CoinGecko" cũng không sai hoàn toàn — CoinGecko
là nguồn cho catalog tra cứu id/symbol/tên coin. Kết luận chính xác nhất:
**định giá (pricing) dùng CoinMarketCap; tra cứu danh tính coin (identity
lookup) dùng CoinGecko** — hai việc khác nhau, hai nguồn khác nhau, cùng
tồn tại trong `crypto_pricing.py`/`crypto_coin_catalog.py`. Bất kỳ ai sửa
mảng crypto tiếp theo nên xác nhận lại yêu cầu người dùng trước khi giả
định chỉ có một nguồn giá.

## 7. Nhập Money Lover — pipeline 4 bước

`app/importers/moneylover.py`, `app/services/moneylover_import.py`,
`moneylover_normalize.py`, `moneylover_category_map.py`,
`moneylover_apply.py`.

1. **Nhập thô** (`import_moneylover`): parse `.xlsx` (sheet "Sổ giao
   dịch"). Dedup theo **toàn file** bằng SHA-256 (không phải từng dòng).
   Mỗi dòng gốc → một `RawImportRow` bất biến (JSON verbatim).
2. **Chuẩn hoá** (`normalize_moneylover_row`): số tiền dương → `INCOME`,
   âm → `EXPENSE`; số tiền = 0 bị từ chối, không ghi sổ.
3. **Ánh xạ danh mục** (`VI_LABEL_TO_CANONICAL_NAME` trong
   `moneylover_category_map.py`): bảng tra cứu tay, khớp chuỗi chính xác
   (không fuzzy) từ nhãn tiếng Việt gốc của Money Lover sang tên category
   canonical (tiếng Anh) của hệ thống. Phần lớn danh mục người dùng tự đặt
   sẽ **không khớp** và bị để trống (`category_id=None`), không đoán bừa.
4. **Áp dụng** (`apply_import_batch`, TASK-040) — ghi thật vào sổ cái:
   - Idempotent: dòng đã áp dụng (theo `raw_import_row_id` hoặc
     `_secondary`) bị bỏ qua khi chạy lại.
   - Khớp ví: `"Ví"` phải khớp **chính xác** (case-insensitive) tên một
     `Account` đang active — không tự tạo tài khoản.
   - **Ghép cặp TRANSFER**: Money Lover xuất 1 lần chuyển nội bộ thành 2
     dòng riêng ("Tiền chuyển đi"/"Tiền chuyển đến"). Thuật toán khớp
     dòng đi↔đến qua (ví nguồn/đích chéo nhau trong ghi chú dạng "Gửi đến
     X"/"Nhận tiền từ Y", cùng số tiền) → ghép thành **một**
     `FinancialEvent` TRANSFER cân bằng, tránh đếm trùng cùng dòng tiền
     là vừa chi vừa thu. Cả 2 dòng gốc được lưu
     (`raw_import_row_id`+`_secondary`) để lần áp dụng sau nhận ra cả hai
     vế đã xong.
   - Dòng lỗi (JSON hỏng, thiếu ngày/tiền) vào `invalid_rows`, không làm
     hỏng cả batch.
5. `POST /api/v1/imports/money-lover` gọi nhập+áp dụng **trong cùng một
   request/transaction** — file tải lên hiện ngay trong sổ giao dịch.
   Giới hạn 10MB, chỉ `.csv`/`.xlsx` (CSV được chuyển sang XLSX trong bộ
   nhớ trước khi qua cùng pipeline).

## 8. Nhập sao kê ngân hàng, đối soát, xuất MISA

- **Sao kê ngân hàng** (`app/importers/bank_statement.py`, `shb.py`,
  `vpbank.py`): adapter parse XLSX riêng cho SHB và VPBank, đã viết và
  test đầy đủ, nhưng **chưa có endpoint API nào gọi tới** — chỉ tồn tại ở
  tầng parser, chưa nối lên UI.
- **Đối soát** (`app/services/reconciliation.py`,
  `app/models/reconciliation.py`): so khớp dòng sao kê đã nhập với
  `FinancialEvent` có sẵn (khác logic ghép TRANSFER ở mục 7). Số tiền
  phải khớp tuyệt đối (bắt buộc), chênh lệch ngày tối đa 7 ngày, tính
  điểm theo khoảng cách ngày + khớp mã tham chiếu + độ tương đồng văn bản
  (Jaccard token, đã bỏ dấu). Tự động khớp (`AUTO_MATCHED`) chỉ khi điểm
  ≥ 85 và cách biệt ứng viên thứ hai ≥ 15, hoặc khớp mã tham chiếu duy
  nhất. **Chỉ có endpoint đọc** (`GET /api/v1/reconciliation-candidates`),
  chưa có endpoint xác nhận/ghi quyết định đối soát.
- **Xuất MISA** (`app/services/misa_export.py`, `app/models/misa_export.py`):
  đầy đủ model + service + test (`tests/test_misa_export.py`) để xuất
  workbook Excel định dạng MISA (sheet "Bank statement", cột cố định
  tiếng Việt) — một event chỉ xuất được nếu **toàn bộ** tài khoản trong
  entries của nó đã ánh xạ trong cấu hình xuất. Có unique constraint DB
  chống xuất trùng. **Nhưng: không có router nào trong `app/api/` include
  nó, và không có `main.py` nào gọi `misa_export_router`** — đã xác nhận
  bằng grep toàn bộ `app/api/*.py`, `main.py`, và `apps/web/`: đây là một
  tính năng **hoàn chỉnh ở backend nhưng hoàn toàn không reachable** qua
  HTTP hay UI ở thời điểm viết tài liệu này.

## 9. Bài học kiểm thử quan trọng (TASK-042, để không lặp lại)

Hai lỗi chỉ lộ ra khi kiểm thử đầu-cuối bằng trình duyệt thật (Playwright),
không lộ ra ở test Python thuần:

1. Xoá một event nhiều-entry vi phạm FK dưới `PRAGMA foreign_keys=ON` —
   phải thêm `cascade="all, delete-orphan"` vào `FinancialEvent.entries`.
2. CORS thiếu method `DELETE` trong `allow_methods` của `app/main.py` —
   trình duyệt chặn ngay preflight; test gọi thẳng hàm Python không đi
   qua CORS nên không phát hiện được. `main.py` hiện có comment giải
   thích rõ y hệt bug class này lặp lại lần 2 ở TASK-038 (thiếu header
   `X-Filename` trong `allow_headers` cho upload Money Lover).

**Kết luận cho agent tiếp theo**: bất kỳ tính năng mutation nào có thao
tác nhiều bước qua UI (đặc biệt sửa/xoá) cần kiểm thử bằng trình duyệt
thật trước khi coi là xong, không chỉ test tầng service/API bằng Python.

## 10. Tổng hợp khoảng trống nghiệp vụ đã biết

1. `ASSET_PURCHASE`/`ASSET_SALE` không có luồng tạo ra thật (mục 2).
2. Mua vàng/crypto không set `funding_account_id`/`financial_event_id`,
   số dư tài khoản nguồn tiền không bị trừ khi mua tài sản (mục 5, 6).
3. `PortfolioSnapshot`/`persist_daily_snapshot()` xây xong, test đầy đủ,
   không nơi nào gọi — chưa có lịch sử Net Worth theo ngày (`ARCHITECTURE.md`).
4. Chưa có API router cho thẻ tín dụng; không liên kết billing-cycle với
   ledger thật (mục 1).
5. Adapter SHB/VPBank chưa nối API (mục 8).
6. Đối soát chỉ có endpoint đọc (mục 8).
7. Xuất MISA hoàn chỉnh ở backend nhưng không reachable qua HTTP/UI (mục 8).
8. `partial_withdraw` (rút một phần tiết kiệm) chưa lên UI (mục 4).
9. Danh mục có thể chọn ở bất kỳ cấp nào khi gán cho giao dịch — không bắt
   buộc chọn lá.

Đây là các điểm "đã có model/schema/enum nhưng chưa có luồng nghiệp vụ
hoàn chỉnh" — xác nhận trực tiếp từ tìm kiếm không thấy nơi gọi trong
toàn bộ mã nguồn, không phải suy đoán.
