import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- TASK-040: "dữ liệu tải lên nhưng không đưa vào data, hay thiết kế để
// đưa vào data, trước mắt chưa cần đối soát, hãy đưa thẳng các bản ghi vào
// tương ứng" -- an uploaded Money Lover batch only ever produced immutable
// RawImportRow records; nothing pushed them into financial_events, so an
// import never showed up in Transactions/net worth. This locks in:
// (1) upload auto-applies matching rows in the same request,
// (2) the Review page's manual Apply/Re-apply action for already-existing
//     or previously-unmatched batches,
// (3) the backend service's transfer-pairing + idempotency + real-data date
//     parsing (a genuine bug caught by testing against the real 212-row
//     export before this ever touched the user's real database). ---

const page = readFileSync("app/page.tsx", "utf8");

const dataPageMatch = page.match(/function DataPage\(\) \{[\s\S]*?\n\}\n/);
assert.ok(dataPageMatch, "TASK-040: could not locate DataPage() in app/page.tsx");
const dataPage = dataPageMatch[0];
assert.ok(
  /setStatus\(`\$\{tr\("Imported rows"\)\}: \$\{body\.row_count\}\$\{applySummary\(tr, body\.apply\)\}`\)/.test(dataPage),
  "TASK-040: upload success no longer surfaces the auto-apply summary"
);
assert.ok(
  /qc\.invalidateQueries\(\{ queryKey: \["events"\] \}\)/.test(dataPage) && /qc\.invalidateQueries\(\{ queryKey: \["portfolio"\] \}\)/.test(dataPage),
  "TASK-040: upload success no longer refreshes events/portfolio after auto-apply -- newly-applied rows would not show up without a manual reload"
);

const applySummaryMatch = page.match(/function applySummary\([\s\S]*?\n\}\n/);
assert.ok(applySummaryMatch, "TASK-040: could not locate the shared applySummary() helper");
assert.ok(/apply\.unmatched_row_count > 0/.test(applySummaryMatch[0]), "TASK-040: applySummary() no longer reports unmatched-wallet rows");
assert.ok(/apply\.invalid_rows\.length > 0/.test(applySummaryMatch[0]), "TASK-040: applySummary() no longer reports invalid rows");

const reviewMatch = page.match(/function Review\(\) \{[\s\S]*?\n\}\n/);
assert.ok(reviewMatch, "TASK-040: could not locate Review() in app/page.tsx");
const review = reviewMatch[0];
assert.ok(/api\.imports\.apply\(batchId\)/.test(review), "TASK-040: Review() no longer wires up the manual apply endpoint");
assert.ok(/onClick=\{\(\) => apply\.mutate\(x\.id\)\}/.test(review), "TASK-040: Review() no longer has a per-batch Apply action");
assert.ok(
  /x\.applied_row_count >= x\.row_count \? tr\("Re-apply"\) : tr\("Apply"\)/.test(review),
  "TASK-040: Review()'s Apply button no longer reflects whether the batch was already fully applied"
);

// --- api.ts: the client-side contract for the new endpoint and field. ---
const apiTs = readFileSync("lib/api.ts", "utf8");
assert.ok(/applied_row_count: number/.test(apiTs), "TASK-040: ImportBatch lost its applied_row_count field");
assert.ok(
  /apply:\s*\(id: number\) => request<ImportApplyResult>\(`\/imports\/\$\{id\}\/apply`, \{ method: "POST" \}\)/.test(apiTs),
  "TASK-040: api.imports.apply() is missing or no longer POSTs the apply endpoint"
);

// --- i18n coverage for the new UI strings (Apply/Re-apply/Applying...). ---
const i18n = readFileSync("lib/i18n.ts", "utf8");
for (const key of ["Apply", "Re-apply", "Applying...", "Applied"]) {
  assert.ok(new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":"[^"]+"`).test(i18n), `TASK-040: enUi is missing a "${key}" entry`);
}
assert.ok(/"Apply":"Đưa vào giao dịch"/.test(i18n), 'TASK-040: viUi is missing an "Apply" translation');
assert.ok(/"Re-apply":"Đưa lại vào giao dịch"/.test(i18n), 'TASK-040: viUi is missing a "Re-apply" translation');

// --- Backend: the apply service exists, is idempotent, pairs transfers,
// and (critically) parses "Ngày" in the shape real Money Lover exports
// actually produce -- confirmed against the user's real staged file that a
// bare date.fromisoformat() rejects ("2026-07-31T00:00:00", not
// "2026-07-31") because openpyxl round-trips an Excel date cell as a
// datetime and the raw-payload serializer calls .isoformat() on it. Without
// this fallback, transfer-pair booking crashes outright and per-row booking
// silently marks every real row invalid. ---
const applyService = readFileSync("../api/app/services/moneylover_apply.py", "utf8");
assert.ok(/def apply_import_batch\(session: Session, batch_id: int\) -> ApplyResult:/.test(applyService), "TASK-040: apply_import_batch() signature changed or was removed");
assert.ok(/already_linked_ids/.test(applyService), "TASK-040: apply_import_batch() no longer checks for already-applied rows -- idempotency lost");
assert.ok(/raw_import_row_id_secondary=matched_in_row\.id/.test(applyService), "TASK-040: transfer-pair booking no longer records the second raw row's provenance");
assert.ok(/parse_moneylover_date\(out_payload\["Ngày"\]\)/.test(applyService), "TASK-040: transfer-pairing pass no longer uses the real-data-safe date parser");

const normalizeService = readFileSync("../api/app/services/moneylover_normalize.py", "utf8");
assert.ok(
  /def parse_moneylover_date\(value: object\) -> date:/.test(normalizeService) && /datetime\.fromisoformat\(text\)\.date\(\)/.test(normalizeService),
  "TASK-040: parse_moneylover_date() lost its datetime.fromisoformat(...).date() fallback -- every real Money Lover row's date would fail to parse again"
);
assert.ok(/tx_date = parse_moneylover_date\(payload\["Ngày"\]\)/.test(normalizeService), "TASK-040: normalize_moneylover_row() no longer uses the real-data-safe date parser");

// --- API route: auto-apply on upload, plus the standalone manual endpoint. ---
const dataApi = readFileSync("../api/app/api/data.py", "utf8");
assert.ok(/apply_result = apply_import_batch\(db, batch\.id\)/.test(dataApi), "TASK-040: /imports/money-lover no longer auto-applies on upload");
assert.ok(/"apply": _apply_result_dict\(apply_result\)/.test(dataApi), "TASK-040: upload response no longer includes the apply summary");
assert.ok(
  /@router\.post\("\/imports\/\{batch_id\}\/apply", response_model=ImportApplyRead\)/.test(dataApi),
  "TASK-040: the manual /imports/{batch_id}/apply endpoint is missing"
);
assert.ok(/raise HTTPException\(404, "Import batch not found"\) from exc/.test(dataApi), "TASK-040: the manual apply endpoint no longer 404s for an unknown batch");

console.log("TASK-040 Money Lover auto-apply audit passed (upload auto-applies + refreshes views, Review page manual Apply/Re-apply, transfer-pairing idempotency, real-data date parsing fix, i18n covered)");
