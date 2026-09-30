#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"

cleanup() {
  echo -e "\nĐang dừng toàn bộ dịch vụ..."
  # Kill all child jobs
  jobs -p | xargs kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=================================================="
echo "  Khởi động Personal Finance (Development Mode)   "
echo "=================================================="

# 1. Check dependencies
for tool in uv node npm; do
  command -v "$tool" >/dev/null || { echo "Lỗi: Không tìm thấy $tool trong PATH" >&2; exit 1; }
done

# 2. Sync / migrate database
echo "--> Đang kiểm tra và cập nhật database schema..."
(cd "$API_DIR" && uv run alembic upgrade head)

# 3. Start Backend API
echo "--> Đang khởi động Backend API tại http://127.0.0.1:8000 ..."
(cd "$API_DIR" && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &

# 4. Start Frontend Web
echo "--> Đang khởi động Frontend Web tại http://localhost:3000 ..."
(cd "$WEB_DIR" && npm run dev) &

echo "=================================================="
echo "  Hệ thống đã sẵn sàng!"
echo "  - Backend API : http://127.0.0.1:8000 (Swagger: /docs)"
echo "  - Frontend Web: http://localhost:3000"
echo "  Nhấn Ctrl+C để dừng toàn bộ dịch vụ."
echo "=================================================="

wait
