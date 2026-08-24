#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"
API_PORT="${PF_SMOKE_API_PORT:-18000}"
WEB_PORT="${PF_SMOKE_WEB_PORT:-13000}"
API_URL="http://127.0.0.1:$API_PORT"
WEB_URL="http://127.0.0.1:$WEB_PORT"
SMOKE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/personal-finance-smoke.XXXXXX")"
API_PID=""
WEB_PID=""
kill_tree() {
  local pid="${1:-}"

  [[ -z "$pid" ]] && return 0

  local child
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  kill "$pid" 2>/dev/null || true
}
kill_port_listeners() {
  local port="$1"
  local pid

  while read -r pid; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null || true
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

  for _ in {1..20}; do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done

  while read -r pid; do
    [[ -n "$pid" ]] && kill -KILL "$pid" 2>/dev/null || true
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}
cleanup() {
  set +e

  kill_tree "$WEB_PID"
  kill_tree "$API_PID"

  [[ -n "$WEB_PID" ]] && wait "$WEB_PID" 2>/dev/null || true
  [[ -n "$API_PID" ]] && wait "$API_PID" 2>/dev/null || true

  kill_port_listeners "$WEB_PORT"
  kill_port_listeners "$API_PORT"

  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1"
  local pid="$2"
  for _ in {1..60}; do
   if curl --fail --silent "$url" >/dev/null 2>&1; then return 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then return 1; fi
    sleep 0.25
  done
  return 1
}

export UV_CACHE_DIR="${UV_CACHE_DIR:-$SMOKE_DIR/uv-cache}"
export PF_DATABASE_PATH="$SMOKE_DIR/synthetic.db"
export PF_CORS_ORIGINS="[\"$WEB_URL\"]"

(
  cd "$API_DIR"
  uv run alembic upgrade head
  uv run uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT"
) >"$SMOKE_DIR/api.log" 2>&1 &
API_PID="$!"
wait_for_url "$API_URL/api/v1/ready" "$API_PID" || {
  sed -n '1,160p' "$SMOKE_DIR/api.log"
  exit 1
}

account_json="$(curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -d '{"name":"Synthetic Wallet","account_type":"EWALLET","currency":"VND"}' \
  "$API_URL/api/v1/accounts")"
account_id="$(node -e 'const value=JSON.parse(process.argv[1]); if (!Number.isInteger(value.id)) process.exit(1); process.stdout.write(String(value.id))' "$account_json")"

curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -d "{\"event_type\":\"INCOME\",\"transaction_date\":\"2026-01-15\",\"payee_text\":\"Synthetic smoke fixture\",\"entries\":[{\"account_id\":$account_id,\"amount\":\"123.4500\"}]}" \
  "$API_URL/api/v1/financial-events" >/dev/null

balance_json="$(curl --fail --silent --show-error "$API_URL/api/v1/accounts/$account_id/balance")"
node -e 'const value=JSON.parse(process.argv[1]); if (value.balance !== "123.4500") process.exit(1)' "$balance_json"

ai_json="$(curl --fail --silent --show-error "$API_URL/api/v1/ai/status")"
node -e 'const value=JSON.parse(process.argv[1]); if (value.enabled !== false || value.authoritative !== false) process.exit(1)' "$ai_json"

cors_headers="$(curl --silent --show-error -D - -o /dev/null -H "Origin: $WEB_URL" "$API_URL/api/v1/health")"
printf '%s' "$cors_headers" | tr -d '\r' | grep -F "access-control-allow-origin: $WEB_URL" >/dev/null

(
  cd "$WEB_DIR"
  NEXT_PUBLIC_API_URL="$API_URL" npm run build
  NEXT_PUBLIC_API_URL="$API_URL" npm run start -- --hostname 127.0.0.1 --port "$WEB_PORT"
) >"$SMOKE_DIR/web.log" 2>&1 &
WEB_PID="$!"
wait_for_url "$WEB_URL/" "$WEB_PID" || {
  sed -n '1,200p' "$SMOKE_DIR/web.log"
  exit 1
}

manifest_json="$(curl --fail --silent --show-error "$WEB_URL/manifest.webmanifest")"
node -e 'const value=JSON.parse(process.argv[1]); if (value.display !== "standalone" || value.start_url !== "/") process.exit(1)' "$manifest_json"
curl --fail --silent --show-error "$WEB_URL/sw.js" | grep -F 'personal-finance-shell-v1' >/dev/null
curl --fail --silent --show-error "$WEB_URL/icon.svg" | grep -F '<svg' >/dev/null

printf 'V1 smoke passed: migrated API, exact-money ledger flow, CORS, AI boundary, web shell, and PWA assets.\n'
