import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const bankCatalogSrc = readFileSync(new URL("../lib/bank-catalog.ts", import.meta.url), "utf8");
for (const marker of [
  'aria-expanded={open}', 'setOpen(false)', 'document.addEventListener("mousedown"',
  'aria-expanded={detailsOpen}', 'detailsOpen &&', 'From account', 'To account',
  // TASK-036 restyled the transfer amount field's local variable name
  // (amount -> transferAmount) when it became a controlled input instead of
  // a plain FormData-read field; the negative-pairing invariant is the same.
  'amount: `-${transferAmount}`', 'aria-pressed={language === "vi"}', 'aria-pressed={language === "en"}',
  'view === "assets"', 'view === "data"', 'Import from Money Lover', 'Export XLSX',
  'Other / Custom bank',
]) assert.ok(page.includes(marker), `Missing TASK-027 marker: ${marker}`);
// "Vietcombank" itself lives in the bank catalog data module (imported by
// page.tsx as `bankCatalog`), not as a literal in page.tsx -- check the file
// that actually owns it, and confirm page.tsx really wires the catalog in.
assert.ok(bankCatalogSrc.includes("Vietcombank"), "Missing TASK-027 marker: Vietcombank (in lib/bank-catalog.ts)");
assert.ok(page.includes("bankCatalog"), "page.tsx no longer imports/uses the bank catalog");
assert.ok(!page.includes('className="primary" disabled>{tr("Upload for review")'), "Data upload must be active");
console.log("TASK-027 UI audit passed");
