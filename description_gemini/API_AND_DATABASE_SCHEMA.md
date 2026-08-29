# Cơ Sở Dữ Liệu & Danh Sách API (Database & API Endpoints)

---

## 1. Cấu Trúc Bảng Dữ Liệu Chính (Database Tables)

| Tên Bảng | Mô tả |
| :--- | :--- |
| **`accounts`** | Tài khoản thanh toán, tiền mặt, thẻ tín dụng, ví điện tử. Lưu `credit_limit`, `currency`, `sort_order`. |
| **`categories`** | Danh mục thu chi phân cấp (tối đa 3 tầng). Lưu `name`, `parent_id`, `icon`, `is_active`. |
| **`financial_events`** | Sự kiện tài chính gốc (Thu, Chi, Chuyển tiền, Mua tài sản, Trả thẻ tín dụng, Gửi/Rút tiết kiệm,...). |
| **`ledger_entries`** | Bút toán sổ cái kép (ghi nợ/có trên từng tài khoản). Số tiền `amount_scaled = Decimal * 10,000`. |
| **`savings_accounts`** | Tài khoản / Sổ tiết kiệm. Lưu `bank_name`, `account_number`, `is_term`, `status`. |
| **`savings_terms`** | Lịch sử các kỳ hạn tiết kiệm, lãi suất, ngày đáo hạn, tiền gốc, tiền lãi và trạng thái tái tục. |
| **`precious_metal_holdings`** | Danh mục nắm giữ kim loại quý (Vàng nhẫn, vàng miếng, trang sức, bạc,...). |
| **`precious_metal_lots`** | Chi tiết từng lô mua kim loại quý (số lượng gram, giá mua, ngày mua). |
| **`crypto_holdings`** | Danh mục nắm giữ tiền mã hoá (BTC, ETH, SOL, USDT,...). |
| **`crypto_lots`** | Chi tiết từng lô mua coin (số lượng, giá mua VND, ngày mua). |
| **`price_quotes`** | Lịch sử báo giá thị trường (BTMC, CoinMarketCap, SJC,...), tính chất Append-only. |
| **`pricing_instruments`** | Mã công cụ định giá chuẩn hoá (ví dụ: `BTMC_PLAIN_RING_9999`, `CRYPTO/BTC/USD`). |
| **`pricing_providers`** | Đơn vị cung cấp báo giá (`BTMC`, `COINMARKETCAP`, `SJC`, `MANUAL`). |
| **`reconciliation_batches`** | Đợt nhập file sao kê đối soát (Money Lover, MISA, Bank statements). |
| **`reconciliation_rows`** | Các dòng giao dịch trích xuất từ file sao kê để đối soát. |

---

## 2. Danh Sách REST API Endpoints Chính

### 2.1. Tài Sản & Danh Mục Đầu Tư (`/api/v1/assets`)
- `GET /api/v1/assets/portfolio-overview`: Báo cáo tổng tài sản, tài sản ròng, chi tiết từng nhóm.
- `GET /api/v1/assets/metals` & `POST /api/v1/assets/metals`: Danh sách & thêm kim loại quý.
- `PATCH /api/v1/assets/metals/{id}` & `DELETE /api/v1/assets/metals/{id}`: Sửa / xoá kim loại quý.
- `POST /api/v1/assets/metals/sync-prices`: Cập nhật giá vàng mới nhất từ BTMC.
- `GET /api/v1/assets/crypto` & `POST /api/v1/assets/crypto`: Danh sách & thêm coin.
- `PATCH /api/v1/assets/crypto/{id}` & `DELETE /api/v1/assets/crypto/{id}`: Sửa / xoá coin.
- `POST /api/v1/assets/crypto/sync-prices`: Cập nhật giá coin mới nhất từ CoinMarketCap & Tỷ giá.
- `GET /api/v1/assets/crypto/coins?q=...`: Tìm kiếm coin từ catalog.

### 2.2. Sổ Tiết Kiệm (`/api/v1/savings`)
- `GET /api/v1/savings` & `POST /api/v1/savings`: Danh sách & mở sổ tiết kiệm mới.
- `GET /api/v1/savings/{id}` & `PATCH /api/v1/savings/{id}` & `DELETE /api/v1/savings/{id}`.
- `POST /api/v1/savings/{id}/close`: Tất toán sổ tiết kiệm (đúng hạn hoặc trước hạn).
- `POST /api/v1/savings/{id}/rollover`: Tái tục sổ tiết kiệm.

### 2.3. Tài Khoản & Sổ Cái (`/api/v1/accounts`, `/api/v1/ledger`)
- `GET /api/v1/accounts` & `POST /api/v1/accounts`: Danh sách & tạo tài khoản.
- `PATCH /api/v1/accounts/{id}` & `DELETE /api/v1/accounts/{id}`: Chỉnh sửa / vô hiệu hoá tài khoản.
- `GET /api/v1/ledger/events` & `POST /api/v1/ledger/events`: Quản lý sự kiện thu/chi/chuyển khoản.
- `PATCH /api/v1/ledger/events/{id}` & `DELETE /api/v1/ledger/events/{id}`: Sửa / xoá giao dịch.

### 2.4. Xuất Báo Cáo & Sao Kê (`/api/v1/exports`)
- `GET /api/v1/exports/statement/data`: Trả về JSON dữ liệu bảng sao kê (Opening balance, running balance, total in/out, reference numbers).
- `GET /api/v1/exports/statement.xlsx`: Tải file bảng sao kê định dạng Excel `.xlsx`.
- `GET /api/v1/exports/statement.csv`: Tải file bảng sao kê định dạng `.csv`.

### 2.5. Danh Mục Thu Chi (`/api/v1/categories`)
- `GET /api/v1/categories` & `POST /api/v1/categories`: Lấy cây danh mục & tạo mới.
- `PATCH /api/v1/categories/{id}` & `DELETE /api/v1/categories/{id}`.
- `POST /api/v1/categories/reset-defaults`: Khởi tạo lại cây danh mục chuẩn.

### 2.6. Sao Lưu & Phục Hồi (`/api/v1/backup`)
- `GET /api/v1/backup/list`: Danh sách các bản backup SQLite và Zip.
- `POST /api/v1/backup/create`: Tạo bản sao lưu DB & Zip.
- `POST /api/v1/backup/restore`: Phục hồi từ file backup.
