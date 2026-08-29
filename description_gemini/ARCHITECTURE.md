# Kiến Trúc Hệ Thống (System Architecture)

Tài liệu này mô tả chi tiết kiến trúc tầng, nguyên lý số học tiền tệ, thiết kế cơ sở dữ liệu, sổ cái kép và luồng dữ liệu của hệ thống **Personal Finance**.

---

## 1. Nguyên Tắc Tiền Tệ & Định Dạng Số (Strict Money & Scale Rules)

> [!CAUTION]
> **TUYỆT ĐỐI KHÔNG DÙNG FLOAT TRONG PYTHON/JAVASCRIPT ĐỂ TÍNH TIỀN TỆ.**

### 1.1. Chuẩn lưu trữ & chuyển đổi:
- **Application / API level**: Sử dụng `Decimal` (Python) hoặc chuỗi số nguyên/thập phân chính xác (TypeScript/Frontend).
- **Database level**: Lưu trữ dưới dạng `INTEGER` đã được nhân với hệ số co giãn:
  $$\text{MONEY\_SCALE} = 10,000$$
  - Ví dụ: `150.000` VND $\rightarrow$ lưu `1.500.000.000` (INTEGER trong DB).
  - `0.0001` BTC $\rightarrow$ lưu `1` (INTEGER).
- **Hàm chuyển đổi chuẩn trong Backend (`app/core/money.py`)**:
  - `money_to_scaled(val: Decimal) -> int`: Nhân $10,000$ và kiểm tra chặn tối đa 4 chữ số thập phân, không tự động làm tròn.
  - `scaled_to_money(val: int) -> Decimal`: Chia $10,000$ trả về `Decimal`.
  - `money(val: Decimal | str) -> str`: Chuẩn hoá chuỗi số thập phân ra API.

### 1.2. Phía Frontend (`apps/web/app/page.tsx`):
- Sử dụng hàm chuẩn: `fmtMoneyDisplay()` để định dạng hiển thị không dấu phẩy thừa.
- Các phép tính cộng trừ nhân tiền tệ sử dụng `sumMoney()`, `mulDecimal()`, `negateMoney()` thao tác trên `BigInt` hoặc chuỗi chuẩn, loại bỏ hoàn toàn sai số dấu phẩy động.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu & Giao Dịch (Database & Transactions)

- **Engine**: SQLite với file database cục bộ `data/finance.db`.
- **Cấu hình bắt buộc khi kết nối (`app/core/database.py`)**:
  - `PRAGMA foreign_keys = ON;` (bảo đảm toàn vẹn khoá ngoại)
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging cho phép ghi đọc đồng thời)
  - `PRAGMA synchronous = NORMAL;` (tối ưu hiệu năng và an toàn)
  - `PRAGMA busy_timeout = 10000;` (10 giây chờ lock tránh lỗi Database Locked)
- **Alembic Authority**:
  - Mọi thay đổi cấu trúc bảng đều phải qua file migration trong `apps/api/alembic/versions/`.
  - Tuyệt đối không gọi `Base.metadata.create_all()` hoặc trực tiếp can thiệp file DB thật.

---

## 3. Hệ Thống Sổ Cái Kép (Double-Entry Ledger)

- Mỗi sự kiện tài chính (`FinancialEvent`) có `event_type`:
  - `INCOME`: Thu nhập.
  - `EXPENSE`: Chi tiêu.
  - `TRANSFER`: Chuyển tiền giữa 2 tài khoản thanh toán.
  - `CREDIT_CARD_PAYMENT`: Thanh toán dư nợ thẻ tín dụng.
  - `ADJUSTMENT`: Điều chỉnh số dư.
  - `ASSET_PURCHASE` / `ASSET_SALE`: Mua/bán kim loại quý hoặc tiền mã hoá.
  - `SAVINGS_DEPOSIT` / `SAVINGS_WITHDRAWAL` / `SAVINGS_INTEREST`: Nạp, rút, nhận lãi tiết kiệm.
- Đi kèm là các bút toán sổ cái `LedgerEntry`:
  - Số tiền lưu ở dạng số nguyên có dấu (`amount_scaled`).
  - Giao dịch chuyển khoản (`TRANSFER`), nạp rút tiết kiệm bảo đảm tổng bằng 0 hoặc phản ánh chính xác luồng tiền vào/ra các tài khoản.
- Không cho phép cập nhật đè lên các bút toán hệ thống được sinh tự động từ sự kiện tài sản/sổ tiết kiệm nếu không qua API nghiệp vụ chuyên biệt.

---

## 4. Dịch Vụ Xuất Báo Cáo & Sao Kê (Statement Export Service)

- **Tính toán số dư**:
  - `Số dư đầu kỳ (Opening balance)`: Tổng tất cả các bút toán sổ cái của tài khoản trước `start_date`.
  - `Số dư luỹ kế (Running balance)`: Số dư sau từng giao dịch theo thứ tự thời gian.
  - `Tổng tiền vào / Tổng tiền ra`: Tính tổng dòng tiền phát sinh trong kỳ.
- **Trích xuất mã tham chiếu (Ref#)**: Tự động bóc tách từ `payee_text`, `note` hoặc ID giao dịch.
- **Hỗ trợ đa định dạng**: JSON (`/exports/statement/data`), Excel XLSX (`/exports/statement.xlsx`), CSV (`/exports/statement.csv`), và PDF Print View.

---

## 5. Báo Giá & Định Giá Danh Mục (Pricing & Portfolio Valuation)

- **Nguyên tắc Immutability của Báo giá (`PriceQuote`)**:
  - Các bản ghi báo giá lịch sử (`PriceQuote`) có guard `@event.listens_for(PriceQuote, "before_update")` và `before_delete` cấm sửa/xoá.
  - Báo giá mới luôn được **APPEND** (thêm mới) với thời điểm `quoted_at` và `observed_at`.
- **Định giá Danh mục (`read_models.portfolio_overview`)**:
  - Giá trị thị trường Kim loại quý:
    $$\text{Giá trị thị trường} = \text{Số lượng (chỉ)} \times \text{Giá mua vào BTMC}$$
  - Giá trị thị trường Tiền mã hoá:
    $$\text{Giá trị thị trường} = \text{Số lượng Coin} \times \text{Giá CoinMarketCap (USD)} \times \text{Tỷ giá USD/VND}$$
  - Nếu báo giá thị trường chưa khả dụng $\rightarrow$ Tự động fallback về Tổng vốn đầu tư ban đầu (`total_cost`).
