import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const apiClient = readFileSync("lib/api.ts", "utf8");

assert.doesNotMatch(page, /\bfetch\s*\(/, "FE03: frontend components must not own HTTP transport");
assert.doesNotMatch(page, /NEXT_PUBLIC_API_URL/, "FE03: components must not assemble API base URLs");

for (const method of ["uploadMoneyLover", "createDownload", "restoreUpload", "downloadUrl"]) {
  assert.match(apiClient, new RegExp(`\\b${method}\\b`), `FE03: api client is missing ${method}`);
}

assert.match(apiClient, /function apiFetch\(/, "FE03: API URL construction is not centralized");
assert.match(apiClient, /"X-Filename":\s*encodeURIComponent\(filename\)/, "FE03: upload filename encoding changed");
assert.match(apiClient, /body:\s*JSON\.stringify\(\{ mode: "download" \}\)/, "FE03: backup download payload changed");
assert.match(apiClient, /"\/backup\/restore\/upload"/, "FE03: backup restore upload URL changed");

console.log("FE03 frontend API transport audit passed");
