import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- TASK-038: fix "bấm tải lên không phản hồi" (upload button does
// nothing) for Money Lover export files whose filename contains Vietnamese
// diacritics (e.g. "...Tổng cộng...xlsx"). Root cause: fetch()'s Headers
// object requires Latin-1/ByteString values, so a diacritic in the
// X-Filename header made the browser throw *synchronously*, before any
// request was sent -- and since DataPage's original upload() had no
// try/catch at all, that throw produced zero visible UI feedback. Fix:
// (1) frontend percent-encodes the filename before putting it in the
// header and wraps the whole flow in try/catch with a visible status
// message + a disabled/"Uploading..." button state while in flight; (2)
// backend decodes it back with urllib.parse.unquote(). This audit locks in
// both halves plus the i18n coverage for the new "Uploading..." string. ---

const page = readFileSync("app/page.tsx", "utf8");
const apiClient = readFileSync("lib/api.ts", "utf8");
const dataPageMatch = page.match(/function DataPage\(\) \{[\s\S]*?\n\}/);
assert.ok(dataPageMatch, "TASK-038: could not locate DataPage() in app/page.tsx");
const dataPage = dataPageMatch[0];

// --- The filename must be percent-encoded before it becomes a header
// value -- this is what stops the synchronous Headers/ByteString throw. ---
assert.ok(
  /"X-Filename":\s*encodeURIComponent\(filename\)/.test(apiClient),
  "TASK-038: X-Filename header is no longer encodeURIComponent-encoded -- Vietnamese/diacritic filenames will throw again"
);

// --- The upload must be wrapped in try/catch so no future failure mode in
// this flow can go silent again (the original bug class, not just this one
// cause). ---
assert.ok(/try\s*\{/.test(dataPage) && /catch\s*\(error\)/.test(dataPage), "TASK-038: upload() no longer wraps its request in try/catch");
assert.ok(/setStatus\(/.test(dataPage), "TASK-038: upload() no longer surfaces a visible status message");

// --- A malformed/non-JSON error response must not itself throw unhandled. ---
assert.ok(/response\.json\(\)\.catch\(/.test(apiClient), "TASK-038: response.json() is no longer guarded against a non-JSON body");

// --- Button must reflect in-flight state (disabled + "Uploading..." label)
// so a slow/failed request doesn't look like "nothing happened" either. ---
assert.ok(/const \[uploading, setUploading\] = useState\(false\)/.test(dataPage), "TASK-038: uploading state was removed from DataPage");
assert.ok(/disabled=\{!file \|\| uploading\}/.test(dataPage), "TASK-038: upload button no longer disables while uploading");
assert.ok(/uploading \? tr\("Uploading\.\.\."\) : tr\("Upload for review"\)/.test(dataPage), "TASK-038: upload button no longer shows an Uploading... label while in flight");

// --- Backend: the X-Filename header must be unquoted back to the real
// Unicode name before use. ---
const api = readFileSync("../api/app/api/data.py", "utf8");
assert.ok(/from urllib\.parse import unquote/.test(api), "TASK-038: backend no longer imports unquote");
assert.ok(/filename = unquote\(filename\)/.test(api), "TASK-038: backend no longer decodes the X-Filename header");

// --- Backend CORS: a second, independent bug found during end-to-end
// verification -- allow_headers didn't list "X-Filename", so the browser's
// CORS preflight rejected the upload request outright for ANY filename
// (not just non-ASCII ones), even after the encoding fix above. Without
// this, the frontend fix alone is not sufficient to actually fix the
// reported bug. ---
const main = readFileSync("../api/app/main.py", "utf8");
assert.ok(/allow_headers=\[[^\]]*"X-Filename"[^\]]*\]/.test(main), "TASK-038: CORS allow_headers no longer includes X-Filename -- upload preflight will be rejected again");

// --- i18n coverage for the new call site, plus a pre-existing gap found
// during verification (DataPage's Section title/subtitle were never added
// to the dictionaries, so they always rendered in English even in the
// Vietnamese UI). ---
const i18n = readFileSync("lib/i18n.ts", "utf8");
assert.ok(/"Uploading\.\.\.":"Uploading\.\.\."/.test(i18n), 'TASK-038: enUi is missing an "Uploading..." entry');
assert.ok(/"Uploading\.\.\.":"Đang tải lên\.\.\."/.test(i18n), 'TASK-038: viUi is missing an "Uploading..." translation');
assert.ok(/"Data":"Dữ liệu"/.test(i18n), 'TASK-038: viUi is missing a "Data" (DataPage section title) translation');
assert.ok(/"Import and export personal finance records\."\s*:\s*"Nhập và xuất dữ liệu tài chính cá nhân\."/.test(i18n), "TASK-038: viUi is missing the DataPage subtitle translation");

console.log("TASK-038 upload resilience audit passed (encoded X-Filename header, CORS allow_headers, try/catch + uploading state on the frontend, unquote() on the backend, i18n covered)");
