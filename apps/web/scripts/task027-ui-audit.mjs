import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
for (const marker of [
  'aria-expanded={open}', 'setOpen(false)', 'document.addEventListener("mousedown"',
  'aria-expanded={detailsOpen}', 'detailsOpen &&', 'From account', 'To account',
  'amount: `-${amount}`', 'aria-pressed={language === "vi"}', 'aria-pressed={language === "en"}',
  'view === "assets"', 'view === "data"', 'Import from Money Lover', 'Export XLSX',
  'Vietcombank', 'Other / Custom bank',
]) assert.ok(page.includes(marker), `Missing TASK-027 marker: ${marker}`);
assert.ok(!page.includes('className="primary" disabled>{tr("Upload for review")'), "Data upload must be active");
console.log("TASK-027 UI audit passed");
