# Đặc tả nghiệp vụ & kỹ thuật — Personal Finance Webapp

**Phiên bản tài liệu**: đi kèm mốc `v2.00` (2026-08-25), tổng hợp TASK-001 đến TASK-042.
**Mục đích**: tài liệu này được viết để bàn giao cho một AI model khác (hoặc một lập trình viên mới) tiếp tục phát triển dự án mà không cần đọc lại toàn bộ mã nguồn trước. Nó mô tả nghiệp vụ, kiến trúc, schema database, và các quy ước bắt buộc của dự án. Mọi thông tin dưới đây được đối chiếu trực tiếp với mã nguồn tại thời điểm viết — nơi nào có khoảng trống hoặc mã chưa hoàn thiện, tài liệu nói rõ thay vì mô tả như đã xong.

---

## 1. Tổng quan dự án

Đây là một webapp quản lý tài chính cá nhân cho một hộ gia đình Việt Nam, gồm: sổ giao dịch (chi/thu/chuyển tiền/thanh toán thẻ), quản lý tài sản đầu tư (vàng, sổ tiết kiệm, crypto), nhập dữ liệu từ Money Lover (app quản lý chi tiêu phổ biến tại Việt Nam), đối soát sao kê ngân hàng, và xuất dữ liệu sang phần mềm kế toán MISA.

Nguyên tắc thiết kế xuyên suốt, quan trọng nhất để hiểu toàn bộ hệ thống:

- **Sổ cái kép (double-entry ledger)**: mọi giao dịch tiền là một `FinancialEvent` gắn với một hoặc nhiều `AccountEntry` (dòng tài khoản có dấu). Số dư tài khoản **không bao giờ được lưu trực tiếp** — luôn được tính bằng `SUM(amount_scaled)` trên các entries của tài khoản đó tại thời điểm truy vấn.
- **Tiền tuyệt đối chính xác**: không bao giờ dùng `float` cho tiền. Tầng ứng dụng dùng `Decimal`, tầng lưu trữ dùng số nguyên đã nhân tỷ lệ (`*_scaled`, tỷ lệ `MONEY_SCALE = 10_000` — 4 chữ số thập phân). Giá trị vượt quá 4 chữ số thập phân bị từ chối thẳng, không làm tròn ngầm.
- **Alembic là nguồn chân lý schema duy nhất** — không bao giờ gọi `Base.metadata.create_all()`, không sửa schema SQLite thủ công.
- **Không đọc dữ liệu thật khi không được phép** — quy tắc dự án (`CLAUDE.md`) cấm đọc `data/**`, `.env`, sao kê ngân hàng, file Money Lover, file MISA, backup, hay credentials trừ khi task hiện tại yêu cầu rõ ràng; test luôn dùng fixture tổng hợp/ẩn danh.
- **Trước khi đụng vào dữ liệu thật**: luôn backup, luôn dry-run thao tác chính xác đó trên một bản sao trước.

---

## 2. Kiến trúc & công nghệ

### Backend — `apps/api`

- Python `>=3.12,<3.13`, quản lý dependency bằng **`uv`** (có `uv.lock`, không có `requirements.txt`).
- **FastAPI** `0.141.1` — REST API đồng bộ (không async).
- **SQLAlchemy 2.0.52** — ORM đồng bộ (typed declarative, `Mapped[...]`).
- **Alembic 1.19.1** — migration, là nguồn chân lý schema duy nhất.
- **Pydantic 2.13.4** (+ `pydantic-settings 2.15.0`) — schema request/response và cấu hình.
- **SQLite** ở chế độ **WAL**, với các PRAGMA bắt buộc bật trên mọi kết nối (`app/core/database.py`): `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=10000`. `foreign_keys=ON` có ảnh hưởng thực tế đến cách viết migration (không dùng `batch_alter_table` trên bảng có FK con đã có dữ liệu — xem mục 3).
- `openpyxl 3.1.5` — đọc/ghi Excel (import Money Lover/sao kê ngân hàng, export CSV/XLSX/MISA).
- `uvicorn[standard] 0.52.4`.
- Dev/test: `pytest 9.1.1`, `ruff 0.16.4`, `mypy 2.3.1`, `httpx 0.28.1`. Lệnh bắt buộc trước khi coi một task là xong: `uv run pytest -v`, `uv run ruff check .`, `uv run mypy app` — cả ba phải sạch.
- Tích hợp AI cục bộ tuỳ chọn: **Ollama** (`ollama_enabled`, `ollama_base_url`, `ollama_model` trong settings) — AI trên cloud phải luôn là tuỳ chọn, không bắt buộc.

### Frontend — `apps/web`

- **Next.js** `^15.1.7`, **React** `^19.0.0`, **TypeScript** `^5.7.3`.
- **TanStack Query** `^5.66.8` cho data-fetching/cache.
- ESLint `^9.19.0` (+ `eslint-config-next`) — `npm run lint` chạy `eslint . --max-warnings=0`; `npm run typecheck` chạy `tsc --noEmit`.
- Không có thư viện UI ngoài — component tự viết trong `apps/web/app/page.tsx` (file lớn, gồm gần như toàn bộ UI Giao dịch/Tài khoản/Tài sản) và các file `lib/*.ts`.
- **Quy ước audit**: mỗi task quan trọng có một script `apps/web/scripts/taskNNN-*-audit.mjs` (khoá lại các yêu cầu nghiệp vụ bằng kiểm tra regex/tĩnh trên mã nguồn đã build, không phải test đơn vị thông thường) — đăng ký trong `package.json`, tính đến v2.00 có 16 audit script tích luỹ qua các task. Các tính năng có thao tác người dùng nhiều bước (sửa/xoá) còn được kiểm thử đầu-cuối bằng Playwright trước khi coi là xong — kỷ luật này bắt đầu từ TASK-042 sau khi phát hiện một lỗi CORS mà test Python thuần không thể phát hiện được (xem mục 4.9).

### Tài liệu & quy trình

- Không có `README.md` gốc. Tài liệu kiến trúc/quy ước tập trung ở **`CLAUDE.md`** (nguồn chân lý cho mọi quy tắc bắt buộc — nên đọc file này trước tiên).
- Mỗi task lớn có một file `docs/tasks/TASK-NNN.md` viết theo phong cách BA (mô tả yêu cầu gốc, quyết định thiết kế, lỗi phát hiện được khi test, kết quả kiểm thử) — hiện có TASK-001 đến TASK-042.
- `CHANGELOG.md` ở gốc repo theo mốc phiên bản `vX.YY` (MAJOR tăng khi có tính năng lớn/đổi kiến trúc, MINOR khi sửa lỗi nhỏ), có quy ước backup đi kèm mỗi mốc: cập nhật changelog → `git commit` → bump version + `git tag` → `git push --tags` → nếu schema DB thật thay đổi, backup `data/finance.db` lên Google Drive.

---

## 3. Cơ sở dữ liệu

18 migration Alembic (`apps/api/migrations/versions/0001` → `0018`), theo thứ tự:

| Rev | Nội dung |
|---|---|
| 0001 | `accounts` (loại: CASH/BANK/CREDIT_CARD/EWALLET), `categories` (cây phân cấp qua `parent_id` tự tham chiếu) |
| 0002 | `financial_events` + `account_entries` — lõi sổ cái kép |
| 0003 | `import_batches`, `raw_import_rows` — hạ tầng nhập file thô |
| 0004 | Thêm `financial_events.raw_import_row_id` — liên kết event ↔ dòng nhập thô |
| 0005 | Hạ tầng export MISA (`misa_export_configurations`, `misa_account_mappings`, `misa_export_runs`, `misa_exported_events`) |
| 0006 | `reconciliation_candidates` — đối soát sao kê ngân hàng ↔ sổ cái |
| 0007 | `credit_card_profiles` — cấu hình chu kỳ sao kê thẻ tín dụng |
| 0008 | `credit_card_statements` — từng kỳ sao kê thẻ |
| 0009 | Toàn bộ domain sổ tiết kiệm: `savings_products`, `savings_accounts`, `savings_terms` (chuỗi tái tục qua `renewed_from_term_id`) |
| 0010 | `precious_metal_holdings` + `precious_metal_lots` — vàng/kim loại quý, theo lô mua |
| 0011 | `crypto_holdings` + `crypto_lots` (ban đầu chỉ hỗ trợ `BTC` qua enum đóng) |
| 0012 | Hạ tầng giá chung: `pricing_instruments`, `pricing_providers`, `price_quotes` — tách nguồn giá khỏi tài sản |
| 0013 | `portfolio_snapshots` + `portfolio_snapshot_components` — lịch sử net worth theo ngày (đã tạo model nhưng **chưa có nơi nào gọi** — xem mục 8) |
| 0014 | Thay `crypto_holdings.asset` (enum đóng, chỉ BTC) bằng danh tính mở `coingecko_id`/`symbol`/`display_name` — vì ký hiệu coin có thể trùng giữa nhiều coin khác nhau, `coingecko_id` mới là khoá chính danh |
| 0015 | Thêm vòng đời cho `savings_terms` (`status` riêng theo từng kỳ hạn, `actual_interest_scaled`, `closed_at`) và `savings_accounts.funding_account_id`, `.notes` |
| 0016 | Thêm `accounts.sort_order` (backfill theo thứ tự id hiện có, không đổi thứ tự hiển thị khi migrate) |
| 0017 | Thêm `categories.icon` (khoá icon tuỳ chọn, `NULL` = dùng icon suy ra từ tên; cố tình không backfill) |
| 0018 | Thêm `financial_events.raw_import_row_id_secondary` — liên kết thứ hai cần thiết để một giao dịch TRANSFER ghép từ 2 dòng Money Lover được nhận diện đã áp dụng đầy đủ ở cả hai vế khi chạy lại apply |

Ghi chú kỹ thuật quan trọng: một vài migration muộn (đặc biệt 0018) tránh dùng `op.batch_alter_table` trên bảng đã có dữ liệu FK tham chiếu thật, vì cơ chế batch của SQLite thực chất là `DROP TABLE` + tạo lại + copy dữ liệu, và việc này sẽ vi phạm `PRAGMA foreign_keys=ON` (luôn bật, kể cả khi Alembic chạy) nếu có bảng con đang tham chiếu tới bảng bị recreate. Các migration này dùng `op.execute()` ALTER trực tiếp thay thế, và với 0018 cụ thể, có ghi chú trong file là đã dry-run trên bản sao dữ liệu thật trước khi áp dụng thật.

`Base` (`app/models/base.py`) chỉ là `DeclarativeBase` trần — không có logic gì khác; docstring nhắc lại quy tắc "Alembic là nguồn chân lý schema duy nhất."

---

## 4. Nghiệp vụ giao dịch (sổ cái)

### 4.1 Mô hình dữ liệu lõi

`FinancialEvent` (bảng `financial_events`) là đơn vị gốc — mọi giao dịch tiền đều là một event. Trường quan trọng:

- `event_type`: 10 giá trị enum (chi tiết mục 4.4).
- `transaction_date` (ngày hạch toán, bắt buộc) tách biệt khỏi `occurred_at` (mốc thời gian chính xác, có thể `NULL`) — **không bao giờ tự bịa nửa đêm** cho các nguồn chỉ có ngày, không giờ.
- `category_id`: FK tới `categories.id`, có thể `NULL`. **Không có kiểm tra tồn tại ở tầng service** — chỉ có ràng buộc khoá ngoại ở tầng DB chặn id không tồn tại; và **không có ràng buộc bắt phải chọn danh mục lá** — người dùng có thể chọn cả danh mục cấp trung gian (ví dụ "Ăn uống") thay vì bắt buộc chọn lá (ví dụ "Ăn ngoài"). Cây danh mục hỗ trợ hiển thị breadcrumb đầy đủ khi xem chi tiết, nhưng không ép chọn lá lúc nhập.
- `raw_import_row_id` / `raw_import_row_id_secondary`: liên kết ngược tới dòng dữ liệu thô đã import (dùng cho idempotency khi áp dụng lại một batch import — xem mục 6.1).
- Quan hệ `entries` dùng `cascade="all, delete-orphan"` — bắt buộc phải có, nếu không thì xoá một `FinancialEvent` còn `AccountEntry` tham chiếu sẽ vi phạm ràng buộc khoá ngoại dưới `PRAGMA foreign_keys=ON`.

`AccountEntry` (bảng `account_entries`) — một dòng chuyển động có dấu trên một tài khoản: `amount_scaled` âm = giảm tài khoản, dương = tăng tài khoản. Không bao giờ là số thực (float).

`Account` (`app/models/account.py`): 4 loại (`CASH`, `BANK`, `CREDIT_CARD`, `EWALLET`). **Không có cột số dư lưu sẵn** — số dư luôn tính động bằng `SUM(account_entries.amount_scaled)` cho tài khoản đó.

### 4.2 Tiền tệ chính xác tuyệt đối (`app/core/money.py`)

`MONEY_SCALE = 10_000` (4 chữ số thập phân). `money_to_scaled()` nhận `Decimal`/`str`/`int`, **từ chối thẳng `float` và `bool`**, từ chối giá trị không hữu hạn (NaN/Infinity), từ chối giá trị có quá 4 chữ số thập phân — không làm tròn ngầm bao giờ. `scaled_to_money()` là chiều ngược lại, cũng từ chối input không phải `int`. Quy ước này áp dụng nhất quán cho mọi cột `*_scaled` trong toàn bộ schema (lãi suất tiết kiệm, hạn mức thẻ, giá vốn vàng/crypto, snapshot portfolio, báo giá...). Riêng số lượng crypto dùng tỷ lệ khác, chi tiết hơn: `CRYPTO_QUANTITY_SCALE = 100_000_000` (8 chữ số thập phân, kiểu satoshi).

### 4.3 Bất biến số dư cân bằng (double-entry)

Với `TRANSFER` và `CREDIT_CARD_PAYMENT` (gọi là `_BALANCED_PAIR_EVENT_TYPES`), `_validate_balanced_pair()` bắt buộc: đúng 2 dòng entry, trên 2 tài khoản khác nhau, và tổng `amount_scaled` của 2 dòng phải bằng 0 (đối nhau chính xác) — tính hoàn toàn trên số nguyên đã scale, không có sai số làm tròn. Riêng `CREDIT_CARD_PAYMENT` có thêm ràng buộc: đúng một trong hai tài khoản phải là loại `CREDIT_CARD`, và dòng của tài khoản thẻ phải dương (thanh toán làm giảm dư nợ, tức tăng balance ở quy ước dấu của hệ thống). Các loại event còn lại không có ràng buộc cân bằng — thường chỉ có 1 dòng entry (chuyển động một chiều trên một tài khoản ví), dù schema không giới hạn cứng số lượng entry cho các loại đó (chỉ bắt buộc "ít nhất 1 entry").

### 4.4 Mười loại `FinancialEventType` — chi tiết từng loại

| Loại | Số entry | Ai tạo ra | Sửa/xoá qua composer chung? | Trạng thái denormalize riêng |
|---|---|---|---|---|
| `EXPENSE` | 1 (âm) | Composer Giao dịch; import Money Lover | Có | — |
| `INCOME` | 1 (dương) | Composer Giao dịch; import Money Lover | Có | — |
| `TRANSFER` | 2 (cân bằng) | Composer Giao dịch; ghép cặp dòng import Money Lover | Có | — |
| `CREDIT_CARD_PAYMENT` | 2 (cân bằng, 1 vế phải là thẻ) | Chỉ qua composer (`POST /financial-events`) | Có | — |
| `INTEREST` | 1 (dương) | `savings.py`: tất toán đúng hạn / trước hạn / tái tục | **Không** | `SavingsTerm.actual_interest_scaled` |
| `SAVINGS_DEPOSIT` | 1 (âm) | `savings.py`: mở sổ / nạp thêm | **Không** | `SavingsAccount.principal_scaled` |
| `SAVINGS_WITHDRAWAL` | 1 (dương) | `savings.py`: rút một phần / tất toán / tất toán trước hạn | **Không** | `SavingsAccount.principal_scaled`, `.status`; `SavingsTerm.status` |
| `ASSET_PURCHASE` | — | **Chưa có luồng nào tạo ra trong code thật** | **Không** | (dự kiến `CryptoLot`, chưa triển khai) |
| `ASSET_SALE` | — | **Chưa có luồng nào tạo ra trong code thật** | **Không** | (chưa triển khai) |
| `ADJUSTMENT` | 1 (± delta) | Form điều chỉnh số dư ở trang Tài khoản → gọi thẳng `POST /financial-events` | **Không** | — |

**`EDITABLE_EVENT_TYPES`** (`app/services/ledger.py`) = đúng 4 loại `{EXPENSE, INCOME, TRANSFER, CREDIT_CARD_PAYMENT}` — khớp với `composerEventTypes` phía frontend. Sáu loại còn lại do các luồng nghiệp vụ riêng (Tiết kiệm, form điều chỉnh) tạo ra và/hoặc gắn liền với trạng thái denormalize ở nơi khác; nếu cho sửa/xoá qua màn hình chung mà không qua đúng luồng đã sinh ra chúng, dữ liệu domain kia sẽ lệch khỏi sổ cái. **Ranh giới này được chặn ở cả hai tầng** (frontend ẩn nút, backend trả `ProtectedEventTypeError` → HTTP 409) vì phía client không phải là ranh giới tin cậy.

Chú ý quan trọng cho model tiếp theo phát triển: `ADJUSTMENT` **được tạo qua cùng một endpoint chung** (`POST /financial-events`) mà composer dùng — không có service riêng cho nó. Thứ duy nhất phân biệt nó là "domain-owned" chỉ là (a) frontend chỉ hiện tuỳ chọn này ở trang Tài khoản, không ở composer Giao dịch, và (b) backend từ chối sửa/xoá nó sau khi tạo.

**`ASSET_PURCHASE`/`ASSET_SALE` là khoảng trống thật sự, không phải đã cố ý bỏ**: enum tồn tại, `EDITABLE_EVENT_TYPES` loại trừ chúng, model `CryptoLot` có sẵn field `financial_event_id`/`funding_account_id` để liên kết — nhưng không có service hay endpoint nào thực sự tạo ra một event loại này. Việc mua vàng/crypto hiện tại (mục 5) **không** ghi nhận vào sổ cái, không ảnh hưởng số dư tài khoản nguồn tiền.

### 4.5 Endpoint REST (`app/api/financial_events.py`)

Base path `/api/v1/financial-events`:

- `GET ""` — danh sách tất cả (kèm entries).
- `GET "/{id}"` — chi tiết một event; 404 nếu không tồn tại.
- `POST ""` — tạo mới; lỗi tài khoản không tồn tại → 404; vi phạm bất biến → 400.
- `PATCH "/{id}"` — **thay toàn bộ** (không phải patch từng trường) — cùng shape với create; loại bị bảo vệ → 409; tài khoản/entries không hợp lệ → 400/404; event không tồn tại → 404. Kiểm tra loại bị bảo vệ chạy **trước** khi validate entries, nên một request sửa loại bị bảo vệ trả 409 ngay cả khi payload cũng có lỗi khác.
- `DELETE "/{id}"` — loại bị bảo vệ → 409; không tồn tại → 404; thành công trả `{id, deleted: true}` (200, không phải 204 rỗng).

### 4.6 Cây danh mục (categories)

Mô hình adjacency-list qua `parent_id` tự tham chiếu — **DB không giới hạn độ sâu**, nhưng **tầng ứng dụng giới hạn tối đa 3 cấp** (`_depths()` trong `app/services/category.py`, và phía frontend `category-tree.ts` kiểm tra lại). Danh mục không bao giờ bị xoá cứng — chỉ có `is_active=false`. Bộ danh mục mặc định (`default_categories.py`) có 2 gốc "Expenses"/"Income", mỗi gốc có danh mục cấp 2, một số có thêm cấp 3 — vừa đúng giới hạn 3 cấp.

Phía frontend, việc chọn danh mục nào hiển thị trong composer phụ thuộc gốc khớp với loại giao dịch: `EXPENSE`→gốc "Expenses", `INCOME`/`INTEREST`→gốc "Income", `ADJUSTMENT`→cả hai gốc, `TRANSFER`/`CREDIT_CARD_PAYMENT`→không hiện picker danh mục (mảng rỗng).

`categoryPath()` (`apps/web/lib/category-tree.ts`, thêm ở TASK-042) dựng breadcrumb gốc→lá (ví dụ "Ăn uống › Ăn ngoài") — **chỉ dùng để hiển thị** ở modal chi tiết giao dịch, không dùng để ràng buộc lựa chọn.

### 4.7 Nhập, sửa, xoá giao dịch — luồng người dùng

Composer trang Giao dịch tạo/sửa cả 4 loại được phép qua một form dùng chung. Sửa gửi `PATCH` (thay toàn bộ, không phải vá từng trường) — với `TRANSFER`/`CREDIT_CARD_PAYMENT`, chiều "từ"/"đến" khi mở lại để sửa được xác định lại theo dấu số tiền (âm = từ/nguồn, dương = đến/đích). Xoá yêu cầu xác nhận hai bước (bấm "Xoá" → "Xác nhận xoá") vì đây là dữ liệu tài chính thật, không cho xoá nhầm bằng một cú bấm.

Modal xem chi tiết một giao dịch hiển thị breadcrumb danh mục đầy đủ (mục 4.6), toàn bộ trường, và từng dòng tài khoản; nút Sửa/Xoá chỉ hiện với 4 loại thuộc `composerEventTypes`.

### 4.8 Tính số dư

`account_balance_scaled()`: `SUM(amount_scaled)` trên toàn bộ entries của tài khoản, `COALESCE(..., 0)`. `account_balance()`: trả `None` nếu tài khoản không tồn tại (để API trả 404), ngược lại trả `Decimal` đã chuyển đổi. Không có cột số dư lưu sẵn ở bất kỳ đâu trong schema.

### 4.9 Bài học kiểm thử quan trọng (để model sau không lặp lại)

Khi xây tính năng xem/sửa/xoá giao dịch (TASK-042), có 2 lỗi chỉ lộ ra khi kiểm thử đầu-cuối bằng trình duyệt thật (Playwright), không lộ ra ở test Python thuần:

1. **Xoá một event nhiều dòng entry vi phạm khoá ngoại** dưới `PRAGMA foreign_keys=ON` — phải thêm `cascade="all, delete-orphan"` vào quan hệ `FinancialEvent.entries`.
2. **CORS thiếu method `DELETE`** trong `allow_methods` của `app/main.py` — trình duyệt chặn ngay từ bước preflight, nút Xoá báo lỗi CORS khó hiểu chứ không chạm được tới server; test gọi thẳng hàm Python không đi qua CORS nên không phát hiện được.

Kết luận cho model tiếp theo: **bất kỳ tính năng mutation nào có thao tác nhiều bước qua UI (đặc biệt sửa/xoá) cần được kiểm thử bằng trình duyệt thật trước khi coi là xong**, không chỉ test tầng service/API bằng Python.

---

## 5. Quản lý tài sản

Quy ước chung cho vàng và crypto: mô hình `Holding` (danh tính tài sản, ví dụ "vàng SJC 1L" hoặc "Bitcoin") → nhiều `Lot` (mỗi lần mua là một lô, giữ giá vốn riêng). Cả hai đều có cờ `is_net_worth` để loại một holding khỏi tính Net Worth mà không cần xoá (ví dụ vàng giữ hộ người khác).

### 5.1 Vàng / kim loại quý (`precious_metal.py`, `pricing.py`, `metal_price_adapters.py`)

- `PreciousMetalHolding`: loại kim loại (GOLD/SILVER), thương hiệu (SJC/BTMC/BTMH/DOJI/PNJ/RAW), độ tinh khiết (`purity_scaled`, ví dụ 9999 = 99.99%), `pricing_instrument` (mã tra giá).
- `PreciousMetalLot`: số lượng + đơn vị (GRAM/CHỈ/LƯỢNG/KILOGRAM — quy đổi qua `GRAMS_PER_UNIT`: 1/3.75/37.5/1000), luôn canonical hoá về gram (`grams_scaled`), ngày mua, giá mua, **tổng tiền đã trả thực tế** (`total_cost_scaled` — không suy ra từ giá×lượng, để chứa phí/làm tròn thực tế), `funding_account_id` (tài khoản nguồn tiền, tuỳ chọn).
- **Luồng hiện có**: chỉ `POST /api/v1/assets/metals` (tạo holding + lô đầu tiên trong 1 request) và `GET` danh sách. **Không có endpoint bán, thêm lô thứ hai, sửa/xoá lô.**
- **Khoảng trống quan trọng**: dù `funding_account_id` tồn tại trên model, endpoint tạo hiện tại **không set nó và không tạo `FinancialEvent` nào** — mua vàng qua API hiện tại không ảnh hưởng gì tới số dư sổ cái.
- **Định giá**: số lượng (gram) × giá **mua vào** (buy price) của dealer — luôn dùng giá mua vào, không bao giờ dùng giá bán ra, kể cả khi định giá tài sản đang nắm giữ (quan điểm thận trọng: giá bán lại được, không phải giá phải trả để mua thêm). Các adapter cào giá HTML riêng cho từng dealer Việt Nam (BTMC, BTMH, DOJI, SJC, PNJ) — khớp mã sản phẩm chính xác tuyệt đối, không có fuzzy match.
- Chuỗi ưu tiên nhà cung cấp giá: thử `brand` của chính holding trước, sau đó fallback theo thứ tự `BTMC → BTMH → DOJI → SJC`; nếu không có báo giá live nào, dùng báo giá lịch sử gần nhất; nếu vẫn không có, dùng báo giá nhập tay (MANUAL).
- **Báo giá append-only**: `PriceQuote` có event listener SQLAlchemy chặn cứng `before_update`/`before_delete` — không bao giờ được sửa/xoá một báo giá đã lưu, chỉ có thể thêm dòng mới. Lịch sử giá được giữ vĩnh viễn.

### 5.2 Sổ tiết kiệm / kỳ hạn (`savings.py`)

Mô hình 3 tầng: `SavingsProduct` (sản phẩm/ngân hàng) → `SavingsAccount` (sổ tiết kiệm cụ thể, có `principal_scaled` sống, `status` OPEN/CLOSED) → `SavingsTerm` (một kỳ hạn cụ thể trong chuỗi tái tục, có `status` **riêng theo từng kỳ** ACTIVE/CLOSED/EARLY_CLOSED, độc lập với status của account).

**Nguyên tắc thiết kế cốt lõi** (khác biệt quan trọng cần model sau hiểu đúng): gửi/rút gốc tiết kiệm **không bao giờ là Income/Expense** — chỉ là chuyển tài sản (Bank → Savings), Net Worth không đổi. **Chỉ có lãi mới là Income thật** (`INTEREST`). Khi tái tục và gộp lãi vào gốc (`RENEW_PRINCIPAL_AND_INTEREST`), **không tạo bất kỳ ledger event nào** — lãi được ghi nhận thuần bằng cách tăng `principal_scaled` của kỳ hạn mới; Net Worth vẫn tăng đúng bằng tiền lãi vì đọc trực tiếp từ `principal`, không suy ra từ sổ cái — tránh bịa ra một dòng tiền gửi ngân hàng giả.

Trường `actual_interest_scaled` trên `SavingsTerm` là **bản ghi lịch sử thực tế đã trả**, tách biệt khỏi `calculate_interest()` (hàm thuần chỉ tính dự phóng, không bao giờ ghi vào DB) — vì lãi ngân hàng trả thực tế có thể khác công thức lý thuyết (làm tròn, ưu đãi, lãi suất không kỳ hạn khi tất toán sớm).

Công thức tính lãi dự phóng: `principal × rate/100 × days/denominator` (làm tròn `ROUND_HALF_UP` 4 chữ số thập phân), `denominator` = 360 (ACTUAL_360, THIRTY_360) hoặc 365 (ACTUAL_365); dùng `annual_rate` nếu tất toán đúng/sau hạn, tự động chuyển sang `non_term_rate` (lãi suất không kỳ hạn) nếu tất toán trước hạn.

Các thao tác vòng đời (đều qua `_asset_movement()`, luôn ghi entry đơn lẻ lên một tài khoản ví thật — CASH/BANK/EWALLET, không bao giờ là CREDIT_CARD hay một sổ tiết kiệm khác):

- **Mở sổ / nạp thêm**: `SAVINGS_DEPOSIT` (âm, trừ tài khoản nguồn).
- **Rút một phần** (`partial_withdraw`): giảm gốc, không tất toán lãi — **chưa được đưa lên UI ở bản V1** (chỉ tồn tại ở tầng service).
- **Tất toán đúng hạn** (`close_savings`): bắt buộc `closed_date >= maturity_date`. Ghi `SAVINGS_WITHDRAWAL` (toàn bộ gốc) **và riêng** `INTEREST` (lãi thực nhận).
- **Tất toán trước hạn** (`early_close_savings`): bắt buộc `closed_date < maturity_date`. Cùng cặp `SAVINGS_WITHDRAWAL`+`INTEREST`, cộng thêm phí phạt tuỳ chọn ghi là một `EXPENSE` âm (phí phạt được mô hình hoá như một khoản chi thường, không có loại riêng).
- **Tái tục** (`renew_savings`): nếu `maturity_action = RENEW_PRINCIPAL` → lãi trả bằng tiền thật (`INTEREST`, cần `receiving_account_id`), chỉ gốc ban đầu chuyển sang kỳ mới; nếu `RENEW_PRINCIPAL_AND_INTEREST` → gộp lãi vào gốc, không có ledger event (xem trên).

Bất biến: không rút quá gốc hiện có; không tất toán đúng hạn trước ngày đáo hạn (phải dùng tất toán sớm); không tất toán sớm sau ngày đáo hạn; không tái tục một kỳ có `maturity_action = CLOSE`; chỉ được sửa trực tiếp các trường của sổ (`PATCH`) khi sổ mới có đúng 1 kỳ hạn và kỳ đó còn ACTIVE — sau khi đã qua bất kỳ thao tác vòng đời nào, chỉ còn các endpoint vòng đời chuyên biệt mới được đụng vào.

### 5.3 Crypto (`crypto.py`, `crypto_coin_catalog.py`, `crypto_pricing.py`)

Cùng mô hình Holding→Lot như vàng. Khác biệt: `CryptoHolding.coingecko_id` là **khoá danh tính chính** (không phải ký hiệu/symbol) — vì symbol có thể trùng giữa nhiều coin khác nhau; `CryptoLot.quantity_scaled` dùng tỷ lệ riêng 8 chữ số thập phân (không phải tỷ lệ tiền 4 chữ số); `CryptoLot` có sẵn cả `funding_account_id` **và** `financial_event_id` để liên kết ngược sổ cái.

Danh mục coin tra cứu qua CoinGecko `/coins/list`, cache trong bộ nhớ 6 giờ, phục vụ tìm kiếm gõ-tới-đâu-gợi-ý-tới-đó khi người dùng nhập `coingecko_id`. Giá lấy từ CoinGecko simple-price endpoint (một giá spot duy nhất, gán cả buy=sell=price, khác vàng có buy/sell riêng).

**Cùng khoảng trống như vàng**: endpoint `POST /api/v1/assets/crypto` chỉ tạo holding+lot, **không set `funding_account_id`/`financial_event_id`, không tạo `FinancialEvent`** — dù model đã có đủ chỗ để liên kết.

### 5.4 Portfolio / Net Worth (`portfolio.py`, `read_models.py`)

**Cơ chế đang thực sự dùng**: `portfolio_overview()` tính **trực tiếp, thời gian thực** mỗi lần gọi — không phải snapshot lưu sẵn. Với mỗi tài khoản: số dư sống; thẻ tín dụng đóng góp giá trị tuyệt đối; sổ tiết kiệm OPEN đóng góp `principal` hiện tại; vàng/crypto có `is_net_worth=true` đóng góp `số lượng × giá định giá` nếu có báo giá hợp lệ.

**Nguyên tắc "không nói dối về Net Worth"**: nếu bất kỳ tài sản nào cần định giá mà không tìm được báo giá, `valuation_complete=False` và cả `net_worth` lẫn `invested_assets` trả về `None` thay vì một con số bị thiếu ngầm.

`calculate_net_worth()`: cộng mọi thành phần theo giá trị, **trừ** giá trị tuyệt đối của thành phần CREDIT_CARD (nợ luôn làm giảm net worth).

**Khoảng trống**: model `PortfolioSnapshot`/`PortfolioSnapshotComponent` (migration 0013) và hàm `persist_daily_snapshot()` đã xây và có test đầy đủ, nhưng **không có bất kỳ nơi nào trong `app/api/` gọi tới nó** — hiện tại hệ thống không có lịch sử net worth theo ngày, chỉ có con số tính lại mỗi lần xem.

### 5.5 Thẻ tín dụng (`credit_card.py`)

**Chưa có API router riêng** — `app/api/` không có `credit_card.py`; toàn bộ logic chỉ tồn tại ở tầng model+service, chưa được expose qua HTTP.

`CreditCardProfile` (cấu hình chu kỳ sao kê, gắn 1-1 với một tài khoản loại CREDIT_CARD): hạn mức, ngày chốt sao kê, ngày đến hạn thanh toán. `CreditCardStatement`: từng kỳ sao kê, `paid_scaled <= balance_due_scaled` (ràng buộc ở tầng DB — không bao giờ trả thừa). Máy trạng thái `refresh_status()`: PAID nếu trả đủ; OVERDUE nếu trả một phần và đã quá hạn, ngược lại PARTIALLY_PAID; ISSUED/OVERDUE nếu chưa trả gì tuỳ đã quá hạn hay chưa.

Việc thanh toán thẻ vào sổ cái (`CREDIT_CARD_PAYMENT`, mục 4.4) được validate ở tầng ledger service chung, **hoàn toàn tách biệt** khỏi `CreditCardProfile`/`CreditCardStatement` — hai hệ thống này **không có liên kết với nhau**: sổ cái theo dõi số dư thẻ qua entries thật, còn statement/billing-cycle theo dõi `balance_due`/`paid` riêng, không tự động đối chiếu. Đây là điểm cần làm rõ/nối lại cho model tiếp theo nếu muốn thẻ tín dụng hoạt động đầy đủ.

---

## 6. Nhập / xuất dữ liệu

### 6.1 Nhập Money Lover — pipeline 4 bước

1. **Nhập thô** (`moneylover_import.py`): parse file `.xlsx` (sheet "Sổ giao dịch", đúng header cột tiếng Việt gốc của Money Lover). Dedup theo **toàn file** bằng SHA-256 — không phải dedup từng dòng. Mỗi dòng gốc lưu thành một `RawImportRow` bất biến (payload verbatim dạng JSON) — không bao giờ bị sửa sau này.
2. **Chuẩn hoá** (`moneylover_normalize.py`): số tiền dương → `INCOME`, âm → `EXPENSE`; số tiền bằng 0 bị từ chối, không ghi sổ.
3. **Ánh xạ danh mục** (`moneylover_category_map.py`): bảng tra cứu tay, khớp chuỗi chính xác tuyệt đối (không fuzzy) từ nhãn tiếng Việt sang tên danh mục canonical của hệ thống — phần lớn danh mục người dùng tự đặt trong Money Lover sẽ không khớp và bị để trống (`category_id = None`), không đoán bừa.
4. **Áp dụng** (`moneylover_apply.py`, TASK-040) — bước ghi thật vào sổ cái:
   - **Idempotent**: dòng đã áp dụng (theo `raw_import_row_id` hoặc `_secondary`) bị bỏ qua, an toàn khi chạy lại nhiều lần trên cùng batch.
   - **Khớp ví**: `"Ví"` phải khớp chính xác tên một `Account` đang active — không tự tạo tài khoản, không fuzzy match.
   - **Logic ghép cặp TRANSFER** (quan trọng nhất): Money Lover xuất một lần chuyển tiền nội bộ thành **2 dòng riêng** ("Tiền chuyển đi" / "Tiền chuyển đến"). Thuật toán tìm dòng đi khớp với dòng đến (cùng số tiền, ví nguồn/đích khớp chéo qua ghi chú dạng "Gửi đến X"/"Nhận tiền từ Y") và ghép thành **một** `FinancialEvent` loại TRANSFER cân bằng — tránh đếm trùng cùng một dòng tiền là vừa chi vừa thu ở hai tài khoản khác nhau. Cả hai dòng gốc được lưu (`raw_import_row_id` + `_secondary`) để lần áp dụng sau nhận ra cả hai vế đã xong.
   - Dòng lỗi (JSON hỏng, thiếu ngày/tiền) được ghi vào `invalid_rows`, **không làm hỏng cả batch**.
5. Endpoint `POST /api/v1/imports/money-lover` gọi nhập+áp dụng **trong cùng một request/transaction** — file tải lên hiện ngay trong sổ giao dịch, không cần bước "áp dụng" thủ công riêng. Giới hạn 10MB, chỉ nhận `.csv`/`.xlsx` (CSV được chuyển đổi sang XLSX trong bộ nhớ trước khi qua cùng pipeline).

### 6.2 Nhập sao kê ngân hàng (`bank_statement.py`, `shb.py`, `vpbank.py`)

Có adapter parse XLSX riêng cho SHB và VPBank (tự dò hàng tiêu đề trong 50 dòng đầu, hỗ trợ nhiều định dạng ngày, từ chối ô tiền kiểu `float` thô để tránh sai số). **Chưa có endpoint API nào gọi tới các adapter này** — chỉ tồn tại ở tầng parser, được test nhưng chưa nối lên UI/API. Đây là điểm mở cần model tiếp theo hoàn thiện nếu muốn nhập sao kê ngân hàng qua giao diện.

### 6.3 Đối soát (`reconciliation.py`)

So khớp một dòng sao kê đã nhập với một `FinancialEvent` đã có sẵn trong sổ cái (khác với logic ghép TRANSFER ở 6.1). Số tiền phải khớp tuyệt đối (điều kiện bắt buộc), chênh lệch ngày tối đa 7 ngày, có tính điểm dựa trên khoảng cách ngày + khớp mã tham chiếu + độ tương đồng văn bản (Jaccard token, đã bỏ dấu tiếng Việt). Tự động khớp (`AUTO_MATCHED`) chỉ khi điểm ≥ 85 và cách biệt với ứng viên thứ hai ≥ 15, hoặc khớp mã tham chiếu duy nhất. Hiện chỉ có endpoint đọc (`GET /api/v1/reconciliation-candidates`), **chưa có endpoint xác nhận/ghi kết quả đối soát**.

### 6.4 Xuất MISA (`misa_export.py`)

Xuất workbook Excel theo định dạng MISA yêu cầu (`"Bank statement"` sheet, cột cố định tiếng Việt). Một event chỉ xuất được nếu **toàn bộ** tài khoản trong các entries của nó đã được ánh xạ trong cấu hình xuất — không xuất một phần. Có cơ chế chống xuất trùng ở tầng DB (unique constraint), không chỉ dựa vào logic ứng dụng.

### 6.5 Xuất CSV/XLSX chung (`app/api/data.py`)

`GET /api/v1/exports/events.csv` và `.xlsx` — mỗi dòng xuất ứng với một `AccountEntry` (một vế của event), không phải một dòng mỗi event.

### 6.6 Backup

`app/services/backup.py`: dùng API `.backup()` gốc của SQLite (snapshot nhất quán ngay cả khi DB đang mở ở chế độ WAL) — không dùng công cụ ngoài. Không bao giờ ghi đè: từ chối nếu đích đã tồn tại. Sau khi backup luôn chạy `PRAGMA integrity_check` — nếu không phải `("ok",)` thì xoá file backup lỗi ngay, không để sót một bản backup hỏng. Khôi phục (`prepare_restore`) không bao giờ ghi đè DB đang chạy tại chỗ — chỉ tạo một bản sao mới, người vận hành tự thay file thủ công khi API đã dừng.

---

## 7. Quy ước phát triển bắt buộc (đọc `CLAUDE.md` để có bản đầy đủ)

- Không bao giờ dùng `float` cho tiền; `Decimal` ở tầng ứng dụng, số nguyên scale ×10.000 khi lưu; không làm tròn ngầm; từ chối giá trị quá 4 chữ số thập phân.
- Alembic là nguồn chân lý schema duy nhất — không gọi `Base.metadata.create_all()`, không sửa schema SQLite thủ công, không xoá/reset DB thật.
- Không đọc `data/**`, `.env`, sao kê ngân hàng, file Money Lover, file MISA, backup, hay credentials trừ khi task hiện tại yêu cầu rõ ràng; test luôn dùng fixture tổng hợp/ẩn danh, không dùng dữ liệu thật.
- Trước khi chạm vào dữ liệu thật: luôn backup trước, luôn dry-run đúng thao tác đó trên bản sao trước khi chạy thật.
- Trước khi coi một task backend là xong: `uv run pytest -v`, `uv run ruff check .`, `uv run mypy app` đều phải sạch. Frontend: `npm run typecheck`, `npm run lint`, và toàn bộ audit script trong `apps/web/scripts` phải pass.
- Tính năng có thao tác nhiều bước qua UI (đặc biệt sửa/xoá dữ liệu) nên được kiểm thử đầu-cuối bằng trình duyệt thật (Playwright) trước khi coi là xong — xem bài học ở mục 4.9.
- Mỗi task quan trọng: viết `docs/tasks/TASK-NNN.md` (mô tả yêu cầu gốc, quyết định thiết kế, lỗi phát hiện, kết quả kiểm thử) và cập nhật `CHANGELOG.md`.
- Backup theo mốc phiên bản: cập nhật changelog → `git commit` → bump version + `git tag` → `git push --tags` → nếu schema DB thật đổi, backup `data/finance.db` lên Google Drive với tên có version+ngày.

---

## 8. Khoảng trống / việc còn dang dở (ưu tiên cho model tiếp theo)

Đây là danh sách các phần đã có model/schema/enum nhưng **chưa có luồng nghiệp vụ hoàn chỉnh** — xác nhận trực tiếp từ việc tìm kiếm không thấy nơi gọi trong toàn bộ mã nguồn production, không phải suy đoán:

1. **`ASSET_PURCHASE`/`ASSET_SALE` không có luồng tạo ra thật** — enum, ràng buộc bảo vệ đều đã có, nhưng mua/bán vàng và crypto qua API hiện tại hoàn toàn không chạm vào sổ cái.
2. **Mua vàng/crypto không set `funding_account_id`/`financial_event_id`** dù model đã có sẵn field — số dư tài khoản nguồn tiền không bị trừ khi mua tài sản.
3. **`PortfolioSnapshot`/`persist_daily_snapshot()` đã xây và test đầy đủ nhưng không có nơi nào gọi** — hệ thống chưa có lịch sử Net Worth theo ngày, chỉ có con số tính lại thời gian thực mỗi lần xem.
4. **Chưa có API router cho thẻ tín dụng** (`CreditCardProfile`/`CreditCardStatement`) — chỉ có ở tầng service, chưa expose HTTP; và **không có liên kết** giữa billing-cycle của thẻ với entries thật trên sổ cái.
5. **Adapter nhập sao kê ngân hàng (SHB, VPBank) đã viết và test nhưng chưa có endpoint API gọi tới** — chưa nối lên UI.
6. **Đối soát (`reconciliation`) chỉ có endpoint đọc**, chưa có endpoint xác nhận/ghi quyết định đối soát.
7. **`partial_withdraw` (rút một phần tiết kiệm) chưa lên UI** ở bản V1 — chỉ dùng được ở tầng service.
8. Danh mục có thể chọn ở **bất kỳ cấp nào** (không bắt buộc lá) khi gán cho giao dịch — nếu muốn ép chỉ chọn lá đúng như ví dụ ban đầu ("ăn sáng trong ăn uống"), cần thêm validate ở cả composer (frontend) lẫn service (backend).

---

## 9. Tệp mã nguồn chủ chốt (bản đồ nhanh)

- Sổ cái: `apps/api/app/models/ledger.py`, `services/ledger.py`, `schemas/ledger.py`, `api/financial_events.py`
- Danh mục: `apps/api/app/models/category.py`, `services/category.py`, `services/default_categories.py`
- Tài khoản: `apps/api/app/models/account.py`, `services/account.py`, `services/account_bootstrap.py`
- Vàng: `apps/api/app/models/precious_metal.py`, `services/metal_price_adapters.py`
- Sổ tiết kiệm: `apps/api/app/models/savings.py`, `services/savings.py`, `api/savings.py`
- Crypto: `apps/api/app/models/crypto.py`, `services/crypto_coin_catalog.py`, `services/crypto_pricing.py`
- Giá chung (vàng+crypto): `apps/api/app/models/pricing.py`, `services/pricing.py`
- Portfolio/Net Worth: `apps/api/app/models/portfolio.py`, `services/portfolio.py`, `services/read_models.py`
- Thẻ tín dụng: `apps/api/app/models/credit_card.py`, `services/credit_card.py`
- Nhập Money Lover: `apps/api/app/importers/moneylover.py`, `services/moneylover_import.py`/`_normalize.py`/`_category_map.py`/`_apply.py`
- Nhập sao kê ngân hàng: `apps/api/app/importers/bank_statement.py`, `shb.py`, `vpbank.py`
- Đối soát: `apps/api/app/models/reconciliation.py`, `services/reconciliation.py`
- Xuất MISA: `apps/api/app/models/misa_export.py`, `services/misa_export.py`
- Backup: `apps/api/app/services/backup.py`, `backup_cli.py`
- Cấu hình/DB: `apps/api/app/core/config.py`, `core/database.py`, `core/money.py`
- Frontend chính: `apps/web/app/page.tsx` (composer, modal chi tiết, form điều chỉnh số dư), `lib/api.ts`, `lib/category-tree.ts`, `lib/i18n.ts`
- Quy ước dự án: `CLAUDE.md` (đọc trước tiên), `CHANGELOG.md`, `docs/tasks/TASK-*.md`
