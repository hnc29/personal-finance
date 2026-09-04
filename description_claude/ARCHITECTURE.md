# Kiến trúc hệ thống

## Cấu trúc thư mục

```
apps/
  api/                       # Backend FastAPI
    app/
      core/                  # config.py, database.py, money.py — wiring & quy ước lõi
      models/                # SQLAlchemy 2 declarative models (1 file/domain)
      schemas/                # Pydantic request/response (không đủ cho mọi router — nhiều router định nghĩa BaseModel ngay trong file api/*.py)
      services/               # Business logic thuần, nhận Session làm tham số
      api/                    # FastAPI router — thin adapter gọi services
      importers/               # Parser file thô (Money Lover .xlsx, sao kê SHB/VPBank)
    migrations/versions/      # 19 file Alembic, 0001 → 0019
    tests/                     # pytest — models/services/api, dùng fixture tổng hợp
  web/
    app/page.tsx               # ~6000 dòng — gần như toàn bộ UI trong 1 file
    lib/                       # api.ts (HTTP client), i18n.ts, category-tree.ts,
                                #  bank-catalog.ts, account-logos.tsx, category-icons.tsx
    e2e/                       # Playwright, 13 file *.spec.ts
data/                          # finance.db thật — KHÔNG BAO GIỜ đọc/commit
docs/                          # BA-SPEC.md, tasks/, qa/
```

Không có `package.json` gốc — 2 app độc lập, không phải monorepo workspace
thật. Backend đồng bộ hoàn toàn (SQLAlchemy 2 *sync* ORM, không async/await
ở bất kỳ đâu trong `app/`).

## Quy ước tiền: `Decimal` + `MONEY_SCALE` (`app/core/money.py`)

Đây là quy ước **quan trọng nhất** của toàn dự án, áp dụng cho mọi cột tiền
trong schema (lãi suất, hạn mức thẻ, giá vốn vàng/crypto, báo giá, snapshot
portfolio...).

```python
MONEY_SCALE = 10_000          # scale 4 chữ số thập phân
MONEY_DECIMAL_PLACES = 4
```

- **Tầng ứng dụng/API**: `decimal.Decimal`.
- **Tầng lưu trữ**: `INTEGER` đã nhân `MONEY_SCALE` (cột `*_scaled`).
- `money_to_scaled(value: Decimal | str | int) -> int`:
  - Từ chối thẳng `float` và `bool` (kể cả `bool` là subclass của `int`).
  - Từ chối `Decimal` không hữu hạn (NaN/Infinity).
  - Từ chối giá trị có **quá 4 chữ số thập phân** — không bao giờ làm tròn
    ngầm, ném `InvalidMoneyValue`.
  - Scale bằng thao tác trên `Decimal.as_tuple()` (sign/digits/exponent),
    không qua phép nhân số thực nào — kết quả luôn chính xác tuyệt đối.
- `scaled_to_money(value: int) -> Decimal`: chiều ngược lại, cũng từ chối
  input không phải `int`.

Ngoại lệ có tỷ lệ riêng: **crypto quantity** dùng
`CRYPTO_QUANTITY_SCALE = 100_000_000` (8 chữ số thập phân, kiểu satoshi —
xem `app/models/crypto.py`), vì số lượng coin cần độ chính xác cao hơn
tiền VND 4 chữ số.

Model expose tiền qua Python `@property` getter/setter đọc/ghi cột
`*_scaled` (ví dụ `SavingsTerm.principal`, `CreditCardProfile.credit_limit`)
— code gọi model không bao giờ tự tay nhân/chia `MONEY_SCALE`.

## Database: SQLite + Alembic

`app/core/database.py` — engine SQLite với 4 PRAGMA bắt buộc bật trên
**mọi** kết nối (qua SQLAlchemy `event.listens_for(engine, "connect")`):

```
foreign_keys=ON      # có ảnh hưởng thực tế tới cách viết migration (xem dưới)
journal_mode=WAL
synchronous=NORMAL
busy_timeout=10000
```

**Alembic là nguồn xác thực schema duy nhất** — không bao giờ gọi
`Base.metadata.create_all()`, không sửa schema SQLite thủ công. Vì
`foreign_keys=ON` luôn bật kể cả khi Alembic chạy, các migration muộn
(0018, 0019) **tránh `op.batch_alter_table`** trên bảng đã có dữ liệu FK
tham chiếu thật — cơ chế batch của SQLite thực chất là DROP+CREATE+COPY,
sẽ vi phạm ràng buộc FK nếu có bảng con đang trỏ tới bảng bị recreate.
Thay vào đó dùng `op.execute()` ALTER trực tiếp hoặc `op.add_column()` đơn
giản (khi cột mới không phải FK). 19 migration theo thứ tự liệt kê đầy đủ
ở `API_AND_DATABASE_SCHEMA.md`.

`app/models/base.py`: `Base` chỉ là `DeclarativeBase` trần, không logic gì
khác — chỉ để nhắc lại quy tắc "Alembic là nguồn chân lý duy nhất" trong
docstring.

## Thiết kế sổ cái kép: `FinancialEvent` + `AccountEntry`

`app/models/ledger.py`. Đơn vị gốc của mọi giao dịch tiền là
`FinancialEvent` (bảng `financial_events`), gắn với một hoặc nhiều
`AccountEntry` (bảng `account_entries` — dòng chuyển động có dấu trên một
tài khoản).

- **Không có cột số dư lưu sẵn ở đâu trong schema.** `Account.balance`
  không tồn tại — số dư luôn tính động bằng
  `SUM(account_entries.amount_scaled)` cho tài khoản đó tại thời điểm
  truy vấn (`app/services/ledger.py::account_balance_scaled`).
- `amount_scaled`: âm = giảm tài khoản, dương = tăng tài khoản. Không bao
  giờ là float.
- `transaction_date` (ngày hạch toán, bắt buộc) tách biệt khỏi
  `occurred_at` (mốc thời gian chính xác, `NULL` được) — không bao giờ tự
  bịa nửa đêm cho nguồn chỉ có ngày.
- Quan hệ `FinancialEvent.entries` dùng `cascade="all, delete-orphan"` —
  **bắt buộc phải có**, nếu không thì xoá một event còn entry tham chiếu
  sẽ vi phạm FK dưới `PRAGMA foreign_keys=ON` (bug thật đã gặp ở TASK-042,
  xem `AGENT_PLAYBOOK.md`).
- Bất biến cân bằng (`_validate_balanced_pair` trong `services/ledger.py`):
  `TRANSFER` và `CREDIT_CARD_PAYMENT` bắt buộc đúng 2 entry trên 2 tài
  khoản khác nhau, tổng `amount_scaled` = 0 (đối nhau chính xác, tính hoàn
  toàn trên số nguyên — không sai số làm tròn). `EXPENSE`/`INCOME` bắt
  buộc đúng 1 entry với dấu đúng chiều (`_validate_signed_amount`).

Chi tiết 10 loại `FinancialEventType`, endpoint, và quy tắc sửa/xoá nằm ở
`BUSINESS_RULES.md`.

## Thiết kế báo giá append-only: `PricingInstrument` / `PricingProvider` / `PriceQuote`

`app/models/pricing.py` — hạ tầng giá dùng chung cho vàng và crypto, tách
biệt hoàn toàn nguồn giá khỏi tài sản đang nắm giữ:

- `PricingInstrument`: mã canonical (ví dụ `"BTMC_PLAIN_RING_9999"`,
  `"CRYPTO/BTC/USD"`).
- `PricingProvider`: một nguồn giá (`SJC`, `BTMC`, `COINGECKO`,
  `COINMARKETCAP`...).
- `PriceQuote`: một báo giá lịch sử — `buy_price_scaled`/
  `sell_price_scaled`, `state` (`LIVE`/`STALE`/`MANUAL`/`UNAVAILABLE`),
  `match_level`, `quoted_at` (thời điểm nguồn công bố) tách biệt
  `observed_at` (thời điểm app quan sát/lưu).
- **Append-only tuyệt đối**: SQLAlchemy event listener chặn cứng
  `before_update`/`before_delete` trên `PriceQuote`
  (`_reject_historical_quote_mutation`) — ném `ValueError` nếu code cố
  sửa/xoá một quote đã lưu. Lịch sử giá được giữ vĩnh viễn, chỉ có thể
  thêm dòng mới qua `append_quote()`.
- `valuation_price` (property trên `PriceQuote`): luôn là giá **mua vào**
  (buy) của dealer, không bao giờ giá bán ra — nguyên tắc thận trọng khi
  định giá tài sản đang nắm giữ (giá bán lại được, không phải giá phải
  trả để mua thêm). `None` nếu `state is UNAVAILABLE`.

Chi tiết quy tắc chọn nguồn giá theo thương hiệu (đặc biệt: **không có
fallback chéo thương hiệu**, khác với những gì `docs/BA-SPEC.md` mô tả)
nằm ở `BUSINESS_RULES.md` §Kim loại quý.

## Cách tính Net Worth (Portfolio)

`app/services/read_models.py::portfolio_overview()` — tính **trực tiếp,
thời gian thực** mỗi lần gọi API `GET /api/v1/portfolio/overview`, **không
phải** snapshot lưu sẵn (dù model `PortfolioSnapshot`/
`PortfolioSnapshotComponent`, migration 0013, đã tồn tại đầy đủ với hàm
`persist_daily_snapshot()` đã test — nhưng **không có nơi nào trong
`app/api/` gọi tới nó**, xem `BUSINESS_RULES.md` §Khoảng trống).

Với mỗi thành phần:
- Tài khoản (CASH/BANK/EWALLET/CREDIT_CARD): số dư sống qua
  `SUM(account_entries.amount_scaled)`.
- Sổ tiết kiệm đang `OPEN`: `principal` hiện tại (đọc trực tiếp, không suy
  ra từ ledger).
- Vàng/crypto có `is_net_worth=true`: `số lượng × giá định giá` nếu có
  báo giá hợp lệ; nếu không, fallback về `total_cost` của các lô đã mua và
  đánh dấu `valuation_complete=False`.

`calculate_net_worth()` (`app/services/portfolio.py`): cộng mọi thành phần
theo giá trị, **trừ** giá trị tuyệt đối của thành phần `CREDIT_CARD` (nợ
thẻ luôn làm giảm net worth).

**Nguyên tắc "không nói dối về Net Worth"**: nếu bất kỳ tài sản nào cần
định giá mà không có báo giá khả dụng, `valuation_complete=False` và cả
`net_worth` lẫn `invested_assets` trả về `None` trong response — không bao
giờ hiện một con số bị thiếu ngầm mà không cảnh báo.
