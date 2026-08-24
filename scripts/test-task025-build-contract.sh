#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT_DIR/scripts/web-build-contract.sh"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/pf-build-contract.XXXXXX")"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture"/{app,lib,public,.next}
printf x > "$fixture/app/page.tsx"; printf x > "$fixture/package.json"; printf x > "$fixture/next.config.ts"
pf_write_web_build_metadata "$fixture" "http://127.0.0.1:18000"
if pf_web_build_matches "$fixture" "http://127.0.0.1:8000"; then echo "smoke build accepted as daily build" >&2; exit 1; fi
pf_write_web_build_metadata "$fixture" "http://127.0.0.1:8000"
pf_web_build_matches "$fixture" "http://127.0.0.1:8000"
printf y > "$fixture/lib/api.ts"
if pf_web_build_matches "$fixture" "http://127.0.0.1:8000"; then echo "stale source build accepted" >&2; exit 1; fi
grep -F 'NEXT_PUBLIC_API_URL="$API_URL"' "$ROOT_DIR/scripts/start-personal-finance.sh" >/dev/null
grep -F 'PF_NEXT_DIST_DIR=.next-smoke' "$ROOT_DIR/scripts/smoke-v1.sh" >/dev/null
printf 'TASK-025 build contract passed.\n'
