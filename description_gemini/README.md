# Personal Finance Application — Project Overview & Architecture Guide

Tài liệu này được biên soạn đầy đủ, chi tiết dành cho các AI Agent hoặc Developer tiếp nhận dự án, giúp hiểu toàn diện về mục tiêu, công nghệ, kiến trúc, luồng dữ liệu và tất cả quy tắc nghiệp vụ của hệ thống **Personal Finance**.

---

## 1. Mục tiêu Dự án (Project Mission)

**Personal Finance** là ứng dụng quản lý tài chính cá nhân **Local-first** (chạy cục bộ hoàn toàn trên máy người dùng, bảo mật dữ liệu tuyệt đối), được thiết kế tối ưu hóa chuyên sâu cho người dùng và các nghiệp vụ tài chính tại Việt Nam.

Ứng dụng quản lý toàn diện các khía cạnh tài chính:
1. **Tiền mặt & Tài khoản thanh toán (Cash & Bank Accounts)**:
   - Quản lý tiền mặt, tài khoản ngân hàng (Vietcombank, BIDV, Techcombank, VPBank, MB, SHB, Eximbank,...), ví điện tử (MoMo, ZaloPay, ViettelMoney, ShopeePay,...), thẻ tín dụng (quản lý công nợ, hạn mức, thanh toán thẻ).
   - Dashboard phân bổ số dư 2 cột: Cột trái dạng thanh tiến độ (Bar breakdown) 3 nhóm Tiền mặt / Ngân hàng / Ví điện tử; Cột phải biểu đồ tròn (Donut chart) với chú thích đặt bên phải.
2. **Sổ tiết kiệm (Savings Accounts)**:
   - Quản lý tiết kiệm có kỳ hạn / không kỳ hạn, tính lãi chuẩn 30/360, tất toán đúng hạn / trước hạn, tái tục lãi nhập gốc / rút lãi.
   - Bộ lọc đa năng theo Tên sổ, Ngân hàng, Trạng thái (Đang gửi, Đã tất toán).
3. **Kim loại quý & Vàng bạc (Precious Metals)**:
   - Quản lý theo chỉ / lượng / gam, tính lời/lỗ thời gian thực.
   - Tự động cập nhật báo giá trực tiếp từ **Bảo Tín Minh Châu (BTMC)** cho Vàng nhẫn tròn trơn, Vàng miếng VRTL, Vàng miếng SJC, Vàng DOJI, PNJ, BTMH.
4. **Tiền mã hoá (Crypto Assets)**:
   - Quản lý danh mục coin / token (BTC, ETH, BNB, SOL, USDT, NEAR, SUI, TON,...).
   - Tự động bóc tách giá USD thời gian thực từ **CoinMarketCap Public API** và quy đổi theo tỷ giá USD/VND thị trường.
5. **Sổ cái giao dịch kép & Ghi chép thu chi (Double-entry Ledger)**:
   - Form nhập giao dịch trung tâm với nút ghi lớn nổi bật căn giữa.
   - Cột giao dịch gần đây phân nhóm theo ngày (Date-grouped cards) phong cách Money Lover với số ngày to, nhãn thứ/ngày, tổng thu chi ngày và huy hiệu icon tròn phân loại.
   - Cây danh mục 3 tầng phân cấp, hệ thống nhận diện icon danh mục thông minh.
   - Sổ giao dịch (Ledger) xem lịch sử theo tháng, tuần, ngày, tìm kiếm, lọc nâng cao.
6. **Báo cáo & Phân tích (Reports & Analytics)**:
   - Biểu đồ cơ cấu thu chi, xu hướng dòng tiền, phân bổ tài sản ròng, hiệu quả đầu tư.
7. **Xuất báo cáo sao kê & In ấn PDF (Bank Statement Export & PDF Printing)**:
   - Bảng sao kê chi tiết chuẩn ngân hàng (7 cột: Ngày, Ngày hiệu lực, Loại giao dịch, Nội dung, Ref#, Số tiền, Số dư luỹ kế).
   - Hỗ trợ xuất file Excel `.xlsx`, `.csv` và In ấn / Lưu file `.pdf` khổ A4 chuẩn trang in.
8. **Đối soát & Nhập dữ liệu (Reconciliation & Import)**:
   - Nhập dữ liệu sao kê từ Money Lover, MISA, Sao kê ngân hàng (VPBank, SHB,...).
   - Tự động so khớp giao dịch chuyển tiền giữa 2 tài khoản không bị trùng lặp.
9. **Sao lưu & Phục hồi (Backup & Restore)**:
   - Sao lưu toàn bộ Database SQLite và đóng gói file nén Zip toàn bộ mã nguồn theo phiên bản có gắn nhãn ngày giờ.

---

## 2. Công nghệ Cốt lõi (Tech Stack)

### Backend (`apps/api`)
- **Ngôn ngữ & Runtime**: Python 3.12, quản lý gói siêu tốc bằng `uv`.
- **Web Framework**: FastAPI (Pydantic v2 validation).
- **ORM & Database**: SQLAlchemy 2 (Sync ORM), SQLite chế độ **WAL (Write-Ahead Logging)**, `foreign_keys=ON`, `busy_timeout=10000`.
- **Migration Authority**: **Alembic** là cơ quan duy nhất quản lý schema. Tuyệt đối không gọi `Base.metadata.create_all()`.
- **Kiểm tra chất lượng**:
  - `uv run pytest -v` (330+ test cases bao phủ toàn diện).
  - `uv run ruff check .` (linter chuẩn PEP 8).
  - `uv run mypy app` (kiểm tra kiểu tĩnh 100% strict).

### Frontend (`apps/web`)
- **Framework**: Next.js 15 (App Router), React 19, TypeScript.
- **State & Data Fetching**: `@tanstack/react-query` (quản lý server state, optimistic updates, cache invalidation).
- **Giao diện**: Vanilla CSS / CSS Modules tùy biến cao cấp, responsive mượt mà, hỗ trợ dark/light mode, in ấn `@media print`.
- **Kiểm tra chất lượng**:
  - `npm run typecheck` (TypeScript strict mode).
  - `npm run lint` (ESLint 0 warnings).

---

## 3. Cấu trúc Tài liệu Chi Tiết trong Thư Mục này

- [README.md](file:///Users/hoangnc/Projects/personal-finance/description_gemini/README.md): Tổng quan dự án, cấu trúc tính năng và hướng dẫn vận hành.
- [ARCHITECTURE.md](file:///Users/hoangnc/Projects/personal-finance/description_gemini/ARCHITECTURE.md): Kiến trúc hệ thống, quy tắc số học tiền tệ (`MONEY_SCALE = 10_000`), cơ chế sổ cái kép và lưu trữ SQLite WAL.
- [BUSINESS_RULES.md](file:///Users/hoangnc/Projects/personal-finance/description_gemini/BUSINESS_RULES.md): Chi tiết tất cả quy tắc nghiệp vụ (Vàng BTMC, Crypto CoinMarketCap, Tiết kiệm 30/360, Thẻ tín dụng, Đối soát & Import).
- [API_AND_DATABASE_SCHEMA.md](file:///Users/hoangnc/Projects/personal-finance/description_gemini/API_AND_DATABASE_SCHEMA.md): Mô tả toàn diện schema cơ sở dữ liệu và các API endpoints.
- [AGENT_PLAYBOOK.md](file:///Users/hoangnc/Projects/personal-finance/description_gemini/AGENT_PLAYBOOK.md): Cẩm nang và quy tắc bắt buộc cho AI Agent khi thực hiện tác vụ (nguyên tắc backup, bảo vệ dữ liệu, kiểm thử 100%).

---

## 4. Hướng dẫn Vận hành Cục bộ (Quickstart)

### 1. Khởi động Backend:
```bash
cd apps/api
uv run uvicorn app.main:app --port 8000 --reload
```
API Documentation: `http://localhost:8000/docs`

### 2. Khởi động Frontend:
```bash
cd apps/web
npm run dev
```
Giao diện ứng dụng: `http://localhost:3000`

### 3. Chạy Toàn Bộ Kiểm Thử (Validation Suite):
```bash
# Backend test & lint:
cd apps/api
uv run pytest -v
uv run ruff check .
uv run mypy app

# Frontend test & lint:
cd apps/web
npm run typecheck
npm run lint
```
