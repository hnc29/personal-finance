# Quy Tắc Nghiệp Vụ Chi Tiết (Business Rules)

Tài liệu này tổng hợp toàn bộ các yêu cầu nghiệp vụ đã được thống nhất, tối ưu hoá và triển khai trong hệ thống **Personal Finance**.

---

## 1. Tiền Mặt & Tài Khoản Thanh Toán (Cash & Bank Accounts)

### 1.1. Phân loại tài khoản thanh toán:
- **`CASH` (Tiền mặt)**: Tiền mặt trong ví, két sắt.
- **`BANK` (Tài khoản ngân hàng)**: Vietcombank, BIDV, Techcombank, VPBank, MB, SHB, Eximbank,...
- **`EWALLET` (Ví điện tử)**: MoMo, ZaloPay, ViettelMoney, ShopeePay,...
- **`CREDIT_CARD` (Thẻ tín dụng)**: Quản lý hạn mức và công nợ tín dụng.

### 1.2. Dashboard Phân Bổ Số Dư (Liquid Dashboard):
- Vị trí: Đặt ngay dưới thanh chọn phân loại tài sản và trên danh sách tài khoản trong tab **Tài sản $\rightarrow$ Tiền mặt & tài khoản thanh toán**.
- **Cột trái (Dạng thanh - Bar breakdown)**:
  - Tổng số dư thanh toán và số lượng tài khoản.
  - 3 nhóm: 💵 **Tiền mặt** (`#10b981`), 🏦 **Tài khoản ngân hàng** (`#0084d6`), 📱 **Ví điện tử** (`#8b5cf6`) kèm số tài khoản, số dư và thanh tỷ trọng %.
- **Cột phải (Biểu đồ tròn - Donut chart)**:
  - Biểu đồ tròn thể hiện tỷ trọng 3 nhóm, tâm biểu đồ hiển thị tổng số dư.
  - Danh sách chú thích (Legend) đặt gọn gàng ở bên phải biểu đồ, không có tiêu đề thừa.

### 1.3. Xuất Sao Kê Ngân Hàng & In PDF:
- Bảng sao kê chuẩn ngân hàng 7 cột: `Ngày`, `Ngày hiệu lực`, `Loại giao dịch`, `Nội dung`, `Ref#`, `Số tiền giao dịch`, `Số dư`.
- Bộ lọc khoảng thời gian nhanh: `Toàn bộ`, `Tháng này`, `Tháng trước`, `Năm nay`.
- Hỗ trợ xem trực tiếp, xuất Excel `.xlsx`, `.csv` và bấm in/lưu `.pdf` chuẩn A4 ngang.

---

## 2. Ghi Nhận Giao Dịch & Sổ Cái (Transactions & Ledger)

### 2.1. Form Nhập Giao Dịch (Composer):
- Đặt ở vị trí trung tâm màn hình Giao dịch.
- Nút **"Ghi giao dịch"** được thiết kế lớn (`min-height: 52px`, `padding: 12px 40px`, `font-size: 1.15rem`, `font-weight: 700`) và căn giữa form cân đối.
- Tự động chọn tài khoản mặc định là tài khoản vừa ghi giao dịch gần nhất.
- Hỗ trợ chọn danh mục nhanh bằng icon pills.

### 2.2. Danh Sách Giao Dịch Gần Đây (Recent Transactions Feed):
- Đặt ở cột bên phải tab Giao dịch.
- Phân nhóm theo thẻ ngày (Date-grouped cards):
  - Đầu thẻ ngày: Số ngày to nổi bật (`28`, `27`, `26`), nhãn tương đối (`Hôm nay`, `Hôm qua`, `Thứ Sáu`), tháng năm (`tháng 8 2026`), và tổng thu chi trong ngày (`-65,000`, `+100,000`).
  - Từng dòng giao dịch: Huy hiệu icon danh mục tròn, tiêu đề danh mục / loại giao dịch (`Tiền chuyển đi`, `Ăn sáng`), ghi chú phụ, số tiền màu đỏ cam (chi tiêu/chuyển đi) hoặc xanh lá (thu nhập/chuyển đến).
  - Bấm vào bất kỳ dòng nào để mở modal xem chi tiết, sửa hoặc xoá.

---

## 3. Kim Loại Quý (Precious Metals — Vàng/Bạc)

### 3.1. Đơn vị đo lường & Quy đổi:
- **1 chỉ** = $3.75$ gram.
- **1 lượng** (cây) = $10$ chỉ = $37.5$ gram.
- Hệ thống hỗ trợ nhập liệu theo `CHI`, `LUONG`, hoặc `GRAM`, tự động chuẩn hoá về `quantity_grams_scaled` trong DB.

### 3.2. Nguồn Báo Giá Tham Chiếu & Ánh Xạ Sản Phẩm (BTMC):
Toàn bộ giá vàng được đồng bộ tự động từ trang web chính thức **`https://btmc.vn/`** (Bảo Tín Minh Châu):
- **Nhẫn trơn (BTMC, BTMH, DOJI, PNJ)**: Được tính bằng giá dòng `NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU`.
- **Vàng miếng (BTMC, BTMH, DOJI)**: Được tính bằng giá dòng `NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU` (hoặc `VÀNG MIẾNG VRTL`).
- **Trang sức DOJI**: Được tính bằng giá nhẫn DOJI (= giá dòng `NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU`).
- **Vàng miếng SJC**: Được tính từ dòng `VÀNG MIẾNG SJC` trên bảng giá BTMC.
- **Vàng nguyên liệu / RAW**: Được tính từ dòng `VÀNG NGUYÊN LIỆU` trên bảng giá BTMC.

### 3.3. Định Giá & Hiển Thị:
- **Giá hiện tại**: Luôn lấy theo **Giá Mua Vào** của đơn vị kinh doanh (người dùng bán ra cho tiệm), không dùng giá bán ra.
- **Giá trị thị trường**:
  $$\text{Giá trị thị trường} = \text{Số lượng (chỉ)} \times \text{Giá hiện tại (đ/chỉ)}$$
- **Lời / Lỗ**:
  $$\text{Lời / Lỗ} = \text{Giá trị thị trường} - \text{Tổng chi phí đầu tư ban đầu}$$
- **Bảng chi tiết kim loại quý**: Tinh gọn chỉ hiển thị các cột quan trọng (Sản phẩm, Thương hiệu, Số lượng chỉ, Giá mua, Tổng chi phí, Giá hiện tại, Giá trị thị trường, Lời/Lỗ, Sửa/Xoá; ẩn các cột rườm rà như Gam, Độ tinh khiết).

---

## 4. Tiền Mã Hoá (Crypto Assets)

### 4.1. Báo Giá Thời Gian Thực:
- **CoinMarketCap Public Data API**: Tải danh sách top 2.000 đồng coin vốn hoá lớn nhất thị trường kèm giá USD thời gian thực.
- **Tỷ giá Ngoại tệ**: Lấy tỷ giá `USD/VND` thực tế từ Open Exchange Rates (`https://open.er-api.com/v6/latest/USD`).
- **Giá quy đổi ra VND**:
  $$\text{Giá Coin (VND)} = \text{Giá Coin (USD)} \times \text{Tỷ giá USD/VND}$$

### 4.2. Nhận Diện Mã Coin (Symbol Matching):
- Hệ thống ưu tiên nhận diện theo **Mã coin (Symbol in hoa)** $\rightarrow$ **Tên hiển thị** $\rightarrow$ **Slug/ID**.
- Bảng `MAJOR_CRYPTO_MAP` cho các đồng coin phổ biến (`BTC`, `ETH`, `BNB`, `SOL`, `USDT`, `NEAR`, `SUI`, `TON` $\leftrightarrow$ `TONCOIN`, `DOGE`,...) tránh việc mapping sai vào các token rác trùng tên.

---

## 5. Sổ Tiết Kiệm (Savings Accounts)

### 5.1. Phân loại & Tính lãi:
- **Tiết kiệm có kỳ hạn (Term Savings)**: Có ngày gửi, ngày đáo hạn (`maturity_date`), lãi suất (%/năm), kỳ hạn (tháng), phương thức tái tục (`ROLLOVER_PRINCIPAL_AND_INTEREST`, `ROLLOVER_PRINCIPAL_PAY_INTEREST`, `CLOSE_AT_MATURITY`).
- **Tiết kiệm không kỳ hạn (Demand Savings)**: Hưởng lãi suất không kỳ hạn thả nổi.
- **Công thức tính lãi chuẩn 30/360**:
  $$\text{Tiền lãi} = \text{Gốc} \times \text{Lãi suất (\%/năm)} \times \frac{\text{Số ngày}}{360}$$
- Khi tạo sổ: Tự động trích tiền từ tài khoản thanh toán và tạo bút toán tương ứng.
- **Bộ lọc theo Tên Sổ**: Tìm kiếm nhanh theo tên sổ tiết kiệm bên cạnh bộ lọc ngân hàng và trạng thái.

---

## 6. Thẻ Tín Dụng & Tổng Tài Sản Ròng (Net Worth)

- Thẻ tín dụng được lưu trong bảng `Account` với `account_type = 'CREDIT_CARD'`.
- **Dư nợ tín dụng**: Thể hiện số âm trên số dư tài khoản.
- **Thanh toán thẻ tín dụng**: Tạo sự kiện `CREDIT_CARD_PAYMENT` ghi có vào thẻ tín dụng (giảm nợ) và ghi nợ tài khoản thanh toán.
- **Thẻ Tổng tài sản ròng (Net Worth Hero Banner)**:
  - Màu nền: Gradient xanh dương cao cấp (`linear-gradient(135deg, #00629b 0%, #0084d6 55%, #0ea5e9 100%)`) đồng bộ với nhận diện thương hiệu.
  - Hiển thị: Tổng tài sản ròng, Tổng tài sản có, Tổng dư nợ, và thanh phân bổ % tài sản.
  $$\text{Net Worth} = \text{Tổng tài sản có} - \text{Dư nợ thẻ tín dụng}$$

---

## 7. Đối Soát & Nhập Dữ Liệu (Reconciliation & Imports)

- Hỗ trợ nhập file sao kê từ:
  - **Money Lover** (Excel `.xlsx` / `.csv`).
  - **MISA** (Excel / JSON).
  - **Sao kê ngân hàng (VPBank, SHB,...)**.
- **Chuyển tiền giữa các tài khoản**:
  - Khi import sao kê từ tài khoản nhận: Tự động cộng tiền tài khoản nhận và trừ tiền tài khoản gửi.
  - Khi import sao kê từ tài khoản gửi sau này: Tự động so khớp không tạo lặp giao dịch lần 2.
