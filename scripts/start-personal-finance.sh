#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; API_DIR="$ROOT_DIR/apps/api"; WEB_DIR="$ROOT_DIR/apps/web"
LOG_DIR="${PF_LOG_DIR:-${HOME}/Library/Logs/personal-finance}"; mkdir -p "$LOG_DIR"; API_LOG="$LOG_DIR/api.log"; WEB_LOG="$LOG_DIR/web.log"
API_PORT="${PF_API_PORT:-8000}"; WEB_PORT="${PF_WEB_PORT:-3000}"; API_URL="http://127.0.0.1:$API_PORT"; WEB_URL="http://127.0.0.1:$WEB_PORT"; API_PID=""; WEB_PID=""
port_pid(){ lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -n 1; }
port_check(){
  local port="$1" url="$2" pid
  pid="$(port_pid "$port")"
  [[ -z "$pid" ]] && return 0
  if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
    echo "Already running and healthy: $url (pid $pid)"
    return 2
  fi
  echo "Port $port is occupied by pid $pid; refusing to kill unrelated process." >&2
  return 1
}
stop_tree(){
  local pid="$1" child
  [[ -z "$pid" ]] && return 0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do stop_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup(){ set +e; stop_tree "$WEB_PID"; stop_tree "$API_PID"; wait 2>/dev/null; }; trap cleanup EXIT INT TERM
for tool in uv node npm curl; do command -v "$tool" >/dev/null || { echo "Missing required command: $tool" >&2; exit 1; }; done
export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/personal-finance-uv-cache}"
if [[ ! -d "$API_DIR/.venv" ]]; then (cd "$API_DIR" && uv sync); fi
if [[ ! -d "$WEB_DIR/node_modules" ]]; then (cd "$WEB_DIR" && npm ci); fi
(cd "$API_DIR" && uv run alembic upgrade head && uv run python -m app.default_categories_cli merge) >>"$API_LOG" 2>&1
# Leave a small, non-sensitive marker for disposable-host validation to verify
# that startup used the dedicated default-category CLI module.
printf '%s\n' 'app.default_categories_cli' >"$API_DIR/.default-category-cli"
if port_check "$API_PORT" "$API_URL/api/v1/ready"; then
  :
else
  status=$?
  [[ "$status" == 2 ]] && exit 0
  exit 1
fi
(cd "$API_DIR" && exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT") >>"$API_LOG" 2>&1 & API_PID=$!
api_ready=0; for _ in {1..60}; do curl -fsS "$API_URL/api/v1/ready" >/dev/null && api_ready=1 && break; kill -0 "$API_PID" 2>/dev/null || break; sleep .25; done
[[ "$api_ready" == 1 ]] || { echo "API failed readiness check" >&2; tail -40 "$API_LOG"; exit 1; }
[[ -d "$WEB_DIR/.next" ]] || (cd "$WEB_DIR" && NEXT_PUBLIC_API_URL="$API_URL" npm run build) >>"$WEB_LOG" 2>&1
if port_check "$WEB_PORT" "$WEB_URL"; then
  :
else
  status=$?
  [[ "$status" == 2 ]] && exit 0
  exit 1
fi
(cd "$WEB_DIR" && NEXT_PUBLIC_API_URL="$API_URL" exec npm run start -- --hostname 127.0.0.1 --port "$WEB_PORT") >>"$WEB_LOG" 2>&1 & WEB_PID=$!
web_ready=0; for _ in {1..60}; do curl -fsS "$WEB_URL/" >/dev/null && web_ready=1 && break; kill -0 "$WEB_PID" 2>/dev/null || break; sleep .25; done
if [[ "$web_ready" != 1 ]]; then
  echo "Web failed readiness check; rebuilding once" >&2; stop_tree "$WEB_PID"
  (cd "$WEB_DIR" && NEXT_PUBLIC_API_URL="$API_URL" npm run build) >>"$WEB_LOG" 2>&1 || { tail -40 "$WEB_LOG"; exit 1; }
  (cd "$WEB_DIR" && NEXT_PUBLIC_API_URL="$API_URL" exec npm run start -- --hostname 127.0.0.1 --port "$WEB_PORT") >>"$WEB_LOG" 2>&1 & WEB_PID=$!
  for _ in {1..60}; do curl -fsS "$WEB_URL/" >/dev/null && web_ready=1 && break; kill -0 "$WEB_PID" 2>/dev/null || break; sleep .25; done
fi
[[ "$web_ready" == 1 ]] || { echo "Web failed readiness check" >&2; tail -40 "$WEB_LOG"; exit 1; }
[[ "${PF_NO_BROWSER:-0}" == 1 ]] || open "$WEB_URL" 2>/dev/null || true; echo "Personal Finance ready: $WEB_URL (logs: $LOG_DIR)"; [[ "${PF_EXIT_AFTER_READY:-0}" == 1 ]] && exit 0
wait
