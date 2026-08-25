import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const tree = readFileSync("lib/category-tree.ts", "utf8");
const i18n = readFileSync("lib/i18n.ts", "utf8");
// NOTE: as of TASK-032, the bare Unicode `categoryIcon()` lookup and the
// hardcoded `pricing_instrument: v("coin")` BTC stub were both replaced with
// real implementations (the SVG <CategoryIcon> component and a CoinGecko
// search-backed <CoinPicker>). This audit's markers were updated to match;
// see scripts/task032-ux-audit.mjs for the fuller structural checks.
for (const marker of ["CategoryPicker", "Search category", "aria-expanded", "CategoryIcon", "asset-tabs", "CoinPicker"]) assert.ok(page.includes(marker), `TASK-031 missing ${marker}`);
for (const marker of ["filterCategoryTree", "toggleCategoryExpansion", "categoryLabel", "categoryRoot"]) assert.ok(page.includes(marker) || tree.includes(marker), `TASK-031 missing ${marker}`);
assert.ok(!page.includes('pricing_instrument: "BTC_USD"'), "BTC-only pricing instrument remains");
assert.ok(!/\b(?:10000|375|100)n\b/.test(page), "BigInt literal syntax remains");
for (const marker of ["Số lượng (chỉ)", "Tìm coin"]) assert.ok(i18n.includes(marker), `missing i18n ${marker}`);
console.log("TASK-031 UX audit passed");
