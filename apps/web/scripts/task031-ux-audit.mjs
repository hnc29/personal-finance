import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const tree = readFileSync("lib/category-tree.ts", "utf8");
const i18n = readFileSync("lib/i18n.ts", "utf8");
for (const marker of ["CategoryPicker", "Search category", "aria-expanded", "categoryIcon", "asset-tabs", "CoinGecko ID", "pricing_instrument: v(\"coin\")"]) assert.ok(page.includes(marker), `TASK-031 missing ${marker}`);
for (const marker of ["filterCategoryTree", "toggleCategoryExpansion", "categoryLabel", "categoryRoot"]) assert.ok(page.includes(marker) || tree.includes(marker), `TASK-031 missing ${marker}`);
assert.ok(!page.includes('pricing_instrument: "BTC_USD"'), "BTC-only pricing instrument remains");
assert.ok(!/\b(?:10000|375|100)n\b/.test(page), "BigInt literal syntax remains");
for (const marker of ["Sổ tiết kiệm", "Số lượng (chỉ)", "Tìm coin", "Mã CoinGecko"]) assert.ok(i18n.includes(marker), `missing i18n ${marker}`);
console.log("TASK-031 UX audit passed");
