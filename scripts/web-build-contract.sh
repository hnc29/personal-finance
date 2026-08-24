#!/usr/bin/env bash

pf_web_fingerprint() {
  local web_dir="$1"
  (cd "$web_dir" && find app lib public -type f -print0 2>/dev/null | sort -z | xargs -0 shasum -a 256; shasum -a 256 package.json next.config.ts) | shasum -a 256 | awk '{print $1}'
}

pf_web_build_matches() {
  local web_dir="$1" api_url="$2" metadata
  metadata="$web_dir/.next/pf-build-meta"
  [[ -f "$metadata" ]] &&
    grep -Fx "api_url=$api_url" "$metadata" >/dev/null &&
    grep -Fx "source=$(pf_web_fingerprint "$web_dir")" "$metadata" >/dev/null
}

pf_write_web_build_metadata() {
  local web_dir="$1" api_url="$2"
  printf 'api_url=%s\nsource=%s\n' "$api_url" "$(pf_web_fingerprint "$web_dir")" > "$web_dir/.next/pf-build-meta"
}
