# Personal Finance

Ứng dụng quản lý tài chính cá nhân **local-first**: chạy hoàn toàn trên máy
riêng, dữ liệu lưu trong một file SQLite duy nhất, không phụ thuộc dịch vụ
đám mây nào để hoạt động hàng ngày.

Phiên bản hiện tại: **v3.00** — xem lịch sử đầy đủ ở [CHANGELOG.md](CHANGELOG.md).

## Tính năng chính

- **Sổ giao dịch**: ghi Chi tiêu / Thu nhập / Chuyển tiền / Thanh toán thẻ
  tín dụng kiểu "hàng chạm" (account/amount/category/note/date), xem chi
  tiết, sửa, xoá, sao chép giao dịch cũ. Trang "Sổ giao dịch" riêng theo
  từng tháng với số dư đầu kỳ/cuối kỳ/chênh lệch ròng.
- **Tài khoản**: tiền mặt, ngân hàng (chọn từ ~49 ngân hàng Việt Nam đang
  hoạt động), thẻ tín dụng, ví điện tử — số dư ban đầu, điều chỉnh số dư,
  logo ngân hàng thật.
- **Hạng mục**: cây phân cấp cha/con, thư viện 75 icon gốc theo 11 nhóm,
  tuỳ chỉnh icon riêng cho từng hạng mục.
- **Tài sản**: sổ tiết kiệm (kiểu MISA, tính lãi theo kỳ hạn), kim loại
  quý (vàng/bạc..., độ tinh khiết, loại sản phẩm), tiền mã hoá (định giá
  qua CoinGecko, mua bằng USD tự quy đổi VND theo tỷ giá thời gian thực),
  dashboard tài sản ròng (net worth).
- **Cờ "Không tính vào báo cáo"**: đánh dấu một giao dịch hoặc tài sản để
  loại khỏi báo cáo tổng hợp thu chi trong tương lai, sửa được bất cứ lúc
  nào từ màn hình chỉnh sửa tương ứng.
- **Nhập/xuất dữ liệu**: nhập file Money Lover (tự động ghép chuyển khoản
  nội bộ, khớp ví/hạng mục, đưa thẳng vào sổ giao dịch), xuất CSV/XLSX
  (lọc theo tài khoản/khoảng ngày), xuất theo định dạng MISA.
- **Đối soát ngân hàng**: nhập sao kê (nhiều định dạng adapter), engine
  đối soát giao dịch ngân hàng ↔ sổ giao dịch.
- **Song ngữ** Việt/Anh đầy đủ trên toàn bộ giao diện.

## Kiến trúc & công nghệ

```
apps/
  api/   FastAPI + SQLAlchemy 2 (sync) + Alembic + Pydantic 2, Python 3.12, uv
  web/   Next.js 15 (App Router) + React 19 + TypeScript strict + TanStack Query 5
data/    finance.db (SQLite, KHÔNG commit vào Git — xem .gitignore)
docs/    đặc tả nghiệp vụ, task log, báo cáo QA
scripts/ script khởi động/kiểm thử
```

- Tiền tệ luôn lưu dưới dạng số nguyên scale `10,000` (`MONEY_SCALE`),
  không bao giờ dùng `float` cho giá trị tiền — xem quy tắc đầy đủ ở
  [AGENTS.md](AGENTS.md).
- Alembic là nguồn xác thực schema duy nhất; không có thao tác nào được
  phép chỉnh sửa schema SQLite thủ công.
- Database thật (`data/finance.db*`) và mọi dữ liệu tài chính nhạy cảm
  không bao giờ được commit vào repo hay đưa vào log/prompt — backup
  riêng trên Google Drive, tách biệt hoàn toàn khỏi GitHub (xem quy ước ở
  đầu [CHANGELOG.md](CHANGELOG.md)).

## Chạy thử

Cách nhanh nhất — script tự chạy migration rồi khởi động cả backend
(`:8000`) lẫn frontend (`:3000`):

```bash
./scripts/start-personal-finance.sh
```

Hoặc chạy tay từng phần:

```bash
# Backend
cd apps/api
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend (terminal khác)
cd apps/web
npm install
npm run dev
```

## Kiểm thử

```bash
# Backend
cd apps/api
uv run pytest -v
uv run ruff check .
uv run mypy app

# Frontend
cd apps/web
npm run lint
npm run typecheck
npm run build
npm run test:e2e   # Playwright, chạy trên finance.test.db riêng — không đụng dữ liệu thật
```

Trạng thái hiện tại: 308 test pytest, 48 test Playwright E2E, ruff/mypy/
eslint/tsc sạch — xem chi tiết ở [docs/qa/QA_STATE.md](docs/qa/QA_STATE.md)
và [docs/qa/TEST_REPORT.md](docs/qa/TEST_REPORT.md).

## Tài liệu thêm

- [CHANGELOG.md](CHANGELOG.md) — lịch sử từng mốc backup, kèm quy ước
  versioning.
- [docs/BA-SPEC.md](docs/BA-SPEC.md) — đặc tả nghiệp vụ gốc.
- [docs/tasks/](docs/tasks/) — nhật ký từng task đã thực hiện.
- [docs/qa/](docs/qa/) — báo cáo QA, ma trận tính năng, trạng thái kiểm thử.
- [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) — quy tắc bắt buộc khi có
  agent AI chỉnh sửa dự án này (an toàn dữ liệu tài chính, quy ước tiền
  tệ, quy trình Git).
