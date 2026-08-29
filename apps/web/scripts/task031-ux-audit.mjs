import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const tree = readFileSync("lib/category-tree.ts", "utf8");
const i18n = readFileSync("lib/i18n.ts", "utf8");
// NOTE: as of TASK-032, the bare Unicode `categoryIcon()` lookup and the
// hardcoded `pricing_instrument: v("coin")` BTC stub were both replaced with
// real implementations. Coin identity was subsequently changed to manual
// symbol entry with a best-effort CoinGecko lookup. Check those current
// behaviors rather than names of components that no longer exist.
for (const marker of ["CategoryPicker", "Search category", "aria-expanded", "CategoryIcon"]) assert.ok(page.includes(marker), `TASK-031 missing ${marker}`);
assert.ok(page.includes('<input name="symbol"') && page.includes("resolveCryptoIdentity(code)"), "TASK-031 missing manual coin identity input");
assert.ok(page.includes("api.assets.crypto.searchCoins") && page.includes("coingecko_id: identity.coingecko_id"), "TASK-031 missing CoinGecko identity resolution");
assert.ok(page.includes('role="tablist"') && page.includes('aria-label={tr("Assets")}'), "TASK-031 missing asset tablist semantics");
for (const tab of ["savings", "metals", "crypto"]) {
  assert.ok(page.includes(`aria-selected={activeTab === "${tab}"}`), `TASK-031 missing selected state for ${tab} asset tab`);
  assert.ok(page.includes(`onClick={() => onSelectTab("${tab}")}`), `TASK-031 missing selection behavior for ${tab} asset tab`);
  assert.ok(page.includes(`tab === "${tab}"`), `TASK-031 missing ${tab} asset panel`);
}
assert.ok(page.includes("<SavingsPanel />"), "TASK-031 missing savings asset UI");
assert.ok(page.includes("<MetalsHoldingsTable"), "TASK-031 missing gold / silver asset UI");
assert.ok(page.includes("<CryptoHoldingsTable"), "TASK-031 missing crypto asset UI");
for (const marker of ["filterCategoryTree", "toggleCategoryExpansion", "categoryLabel", "categoryRoot"]) assert.ok(page.includes(marker) || tree.includes(marker), `TASK-031 missing ${marker}`);
assert.ok(!page.includes('pricing_instrument: "BTC_USD"'), "BTC-only pricing instrument remains");
assert.ok(!/\b(?:10000|375|100)n\b/.test(page), "BigInt literal syntax remains");
for (const marker of ["Số lượng (chỉ)", "Tìm coin"]) assert.ok(i18n.includes(marker), `missing i18n ${marker}`);
console.log("TASK-031 UX audit passed");
