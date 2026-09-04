# Personal Finance — Tài liệu cho AI agent

> Tài liệu này (`description_claude/`) được viết cho một **AI agent khác tiếp
> quản dự án mà không có ngữ cảnh trước đó**. Mọi khẳng định trong 5 file này
> đã được đối chiếu trực tiếp với mã nguồn thật tại thời điểm viết
> (2026-08-27, sau commit `7063e72`), không chép lại từ `docs/BA-SPEC.md`
> hay `description_gemini/` mà không kiểm chứng.

## Dự án này giải quyết vấn đề gì

**Personal Finance** là webapp quản lý tài chính cá nhân **local-first** cho
một hộ gia đình Việt Nam: một người dùng thật, dữ liệu lưu trong đúng một
file SQLite trên máy của họ, không phụ thuộc dịch vụ cloud nào để hoạt động
hàng ngày (chỉ gọi ra ngoài để lấy giá vàng/crypto/tỷ giá tham chiếu — không
bắt buộc phải có mạng để dùng app). Phạm vi nghiệp vụ:

- Sổ giao dịch song nhập (double-entry ledger): Chi tiêu / Thu nhập /
  Chuyển tiền / Thanh toán thẻ tín dụng.
- Quản lý tài khoản (tiền mặt, ngân hàng, thẻ tín dụng, ví điện tử).
- Quản lý tài sản đầu tư: sổ tiết kiệm kiểu MISA (tính lãi theo kỳ hạn),
  kim loại quý (vàng/bạc theo thương hiệu Việt Nam), tiền mã hoá.
- Dashboard tài sản ròng (Net Worth) tính thời gian thực.
- Nhập dữ liệu từ Money Lover (ứng dụng chi tiêu phổ biến ở VN), xuất
  CSV/XLSX, đối soát sao kê ngân hàng.
- Giao diện song ngữ Việt/Anh đầy đủ.

Dự án được phát triển hoàn toàn bằng cách một người dùng ra yêu cầu bằng
tiếng Việt cho một AI coding agent (Claude Code) — xem `AGENTS.md`/
`CLAUDE.md` ở gốc repo cho quy tắc bắt buộc, và
[`AGENT_PLAYBOOK.md`](./AGENT_PLAYBOOK.md) trong thư mục này cho quy trình
làm việc thực tế (bao gồm cách đồng bộ code sang máy thật của người dùng).

## Công nghệ

**Backend** (`apps/api/`): Python 3.12, FastAPI (đồng bộ, không async),
SQLAlchemy 2 (typed declarative ORM), Alembic (nguồn xác thực schema duy
nhất), Pydantic 2, SQLite ở chế độ WAL, quản lý dependency bằng `uv`.

**Frontend** (`apps/web/`): Next.js 15 (App Router), React 19, TypeScript
5.7 (strict), TanStack Query 5 cho data-fetching. Không dùng thư viện UI
ngoài (Tailwind/shadcn/chart-lib đều không có) — gần như toàn bộ UI nằm
trong một file duy nhất `apps/web/app/page.tsx` (~6000 dòng).

**AI tuỳ chọn trong app**: Ollama cục bộ (`app/services/ollama.py`,
`app/api/ai.py`) — luôn tuỳ chọn, tắt mặc định (`ollama_enabled=False`).
Đừng nhầm với AI agent (Claude Code) *phát triển* ra dự án này.

## Chạy và kiểm thử cục bộ

```bash
# Cách nhanh nhất — chạy migration rồi khởi động cả hai:
./scripts/start-personal-finance.sh

# Hoặc tay từng phần:
cd apps/api && uv sync && uv run alembic upgrade head \
  && uv run uvicorn app.main:app --reload      # :8000

cd apps/web && npm install && npm run dev        # :3000
```

Kiểm thử (chi tiết baseline mong đợi ở
[`AGENT_PLAYBOOK.md`](./AGENT_PLAYBOOK.md)):

```bash
# Backend — cả ba phải sạch trước khi coi một task backend là xong
cd apps/api
uv run pytest -v
uv run ruff check .
uv run mypy app

# Frontend
cd apps/web
npm run lint
npm run typecheck
npm run build
npm run test:e2e   # Playwright, chạy trên finance.test.db riêng
```

**Tuyệt đối không đọc/sửa** `data/**`, `.env*`, backup, hay bất kỳ file
Money Lover/MISA/sao kê ngân hàng thật nào trừ khi task yêu cầu rõ ràng —
xem `AGENTS.md`/`CLAUDE.md` ở gốc repo.

## Chỉ mục tài liệu

| File | Nội dung |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Kiến trúc hệ thống: cấu trúc thư mục, quy ước tiền `Decimal`/`MONEY_SCALE`, cấu hình SQLite, thiết kế sổ cái kép (`FinancialEvent`+`AccountEntry`), thiết kế báo giá append-only (`PriceQuote`), cách tính Net Worth. |
| [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) | Quy tắc nghiệp vụ theo từng mảng: tài khoản/thẻ tín dụng, sổ tiết kiệm (công thức lãi, tái tục), kim loại quý (quy tắc giá tham chiếu BTMC mới nhất, không fallback chéo thương hiệu), crypto (CoinGecko vs CoinMarketCap — có phân biệt rõ), nhập Money Lover, cờ `excluded_from_reports`, và các khoảng trống nghiệp vụ đã biết. |
| [`API_AND_DATABASE_SCHEMA.md`](./API_AND_DATABASE_SCHEMA.md) | Toàn bộ REST endpoint theo router, và schema database — từng bảng, cột chính, quan hệ — kèm danh sách 19 migration theo thứ tự. |
| [`AGENT_PLAYBOOK.md`](./AGENT_PLAYBOOK.md) | Hướng dẫn thực hành cho AI agent tiếp theo: quy tắc bắt buộc, mô hình hai-nơi-làm-việc (cloud workspace vs máy thật qua `device_bash`), cách xác minh file không bị stale (`git hash-object`), lệnh kiểm thử/baseline mong đợi, và quy trình đồng bộ code + commit git đã dùng thành công qua nhiều đợt. |

## Trạng thái hiện tại (tại thời điểm viết)

Phiên bản `v3.00` theo `CHANGELOG.md`, nhưng mã nguồn thật đã đi xa hơn
changelog ở một số điểm (xem ghi chú "code mới hơn docs" trong
`BUSINESS_RULES.md`) — ví dụ trang **Báo cáo** (`Reports()` trong
`page.tsx`, đã lọc theo `excluded_from_reports`) đã tồn tại dù changelog
`v3.00` còn ghi "chưa có trang báo cáo tổng hợp". `docs/BA-SPEC.md` (đặc tả
nghiệp vụ) ghi mốc `v2.00` (2026-08-25) nên cũng đã cũ hơn code hiện tại ở
vài chỗ — mọi khác biệt quan trọng đã biết được liệt kê rõ trong
`BUSINESS_RULES.md` thay vì lặp lại đặc tả cũ như đã đúng.
