import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const tree = readFileSync("lib/category-tree.ts", "utf8");
const i18nSrc = readFileSync("lib/i18n.ts", "utf8");
const icons = readFileSync("lib/category-icons.tsx", "utf8");

// --- i18n coverage: every literal tr("...")/ui(language, "...") call in
// page.tsx must resolve through `ui()` without silently falling back to the
// raw (English) key text in Vietnamese mode. This supersedes hardcoding a
// handful of expected strings: it is derived from actual call sites, so it
// automatically catches new English leaks as the UI grows. ---
const enUiMatch = i18nSrc.match(/const enUi = \{([\s\S]*?)\} as const;/);
assert.ok(enUiMatch, "could not locate enUi dictionary in lib/i18n.ts");
const extraMatch = i18nSrc.match(/const extra: Record<string, string> = \{([\s\S]*?)\};/);
assert.ok(extraMatch, "could not locate the vi-only `extra` override map in ui()");

function literalKeysOf(body) {
  const keys = new Set();
  const re = /"((?:[^"\\]|\\.)*)"\s*:/g;
  let m;
  while ((m = re.exec(body))) keys.add(m[1].replace(/\\"/g, '"'));
  return keys;
}
const enUiKeys = literalKeysOf(enUiMatch[1]);
const extraKeys = literalKeysOf(extraMatch[1]);

function literalCallsOf(source, pattern) {
  const keys = new Set();
  let m;
  while ((m = pattern.exec(source))) keys.add(m[1].replace(/\\"/g, '"'));
  return keys;
}
const trCalls = literalCallsOf(page, /\btr\("((?:[^"\\]|\\.)*)"\)/g);
const uiCalls = literalCallsOf(page, /\bui\(language,\s*"((?:[^"\\]|\\.)*)"\)/g);

for (const key of [...trCalls, ...uiCalls]) {
  assert.ok(
    enUiKeys.has(key) || extraKeys.has(key),
    `TASK-032: tr()/ui() call site uses "${key}" but it has no entry in enUi or the vi \`extra\` map in lib/i18n.ts -- this leaks raw English text in Vietnamese mode`,
  );
}
assert.ok(trCalls.size + uiCalls.size > 20, "i18n call-site scan found suspiciously few tr()/ui() usages -- extraction regex likely broke");

// --- Category icons: TASK-031 banned bare Unicode/dot glyphs (the old
// `categoryIcon(name): string` lookup). Assert the SVG icon system is wired
// in and the old function is gone from both call sites and its own module. ---
assert.ok(!/\bcategoryIcon\(/.test(page), "TASK-032: page.tsx still calls the removed categoryIcon() Unicode-glyph function");
assert.ok(!/export function categoryIcon\(/.test(tree), "TASK-032: category-tree.ts still exports the removed categoryIcon() Unicode-glyph function");
assert.ok(page.includes("<CategoryIcon"), "TASK-032: page.tsx does not render the SVG <CategoryIcon> component anywhere");
assert.ok(icons.includes("export function CategoryIcon"), "TASK-032: lib/category-icons.tsx no longer exports CategoryIcon");

// --- Category parent picker: TASK-031 flagged a native <select> leaking
// English option text. Assert the hierarchical ParentPicker component is
// used for the category form's parent field, not a bare native select. ---
assert.ok(page.includes("<ParentPicker"), "TASK-032: Categories() no longer renders <ParentPicker> for the parent field");
assert.ok(!/<select name="parent"/.test(page), "TASK-032: a native <select name=\"parent\"> reappeared in the category form");

// --- Advanced transaction types: SUPERSEDED by TASK-034. The user explicitly
// requested removing the "other transaction type" advanced escape hatch
// (which exposed all 10 EventType values, including INTEREST/SAVINGS_*
// which are now owned exclusively by the Savings module's own actions, and
// ASSET_PURCHASE/ASSET_SALE which have no live producer anywhere in the
// app) and replacing it with a dedicated, guided Credit Card Payment flow.
// The composer now intentionally exposes only 4 hand-entry-safe types via
// `composerEventTypes`; see docs/tasks/TASK-034.md for the full rationale.
// The old eventTypes.slice(3) advanced dropdown and its entryAmountHelp
// disclosure were removed along with it. ---
assert.ok(page.includes("composerEventTypes"), "TASK-034: composer no longer uses the composerEventTypes allowlist");
assert.ok(!/\beventTypes\b/.test(page), "TASK-034: a stale reference to the removed 10-item eventTypes const reappeared");
assert.ok(page.includes('"CREDIT_CARD_PAYMENT"'), "TASK-034: CREDIT_CARD_PAYMENT is no longer reachable from the composer");

// --- Crypto: identity must be an arbitrary CoinGecko coin, not a hardcoded
// BTC-only asset. Assert the real search-backed CoinPicker is wired in and
// no BTC-only shortcuts remain. ---
assert.ok(page.includes("<CoinPicker"), "TASK-032: Assets() crypto form no longer renders <CoinPicker>");
assert.ok(page.includes("api.assets.crypto.searchCoins"), "TASK-032: CoinPicker no longer calls the real coin-search endpoint");
assert.ok(!/CryptoAsset\.BTC/.test(page), "TASK-032: a hardcoded CryptoAsset.BTC reference reappeared in page.tsx");
assert.ok(!/pricing_instrument:\s*v\("coin"\)/.test(page), "TASK-032: the old hardcoded-coin pricing_instrument pattern reappeared");
assert.ok(page.includes("coingecko_id: coin.id"), "TASK-032: crypto submit no longer sends the selected coin's coingecko_id");

// --- Metal brand catalog: must come from the managed backend catalog, not
// a static hardcoded list of options. ---
assert.ok(page.includes("api.assets.metalBrands"), "TASK-032: metals form no longer sources brand options from api.assets.metalBrands");
assert.ok(!/<option value="SJC">/.test(page), "TASK-032: a hardcoded SJC <option> literal reappeared instead of the brand catalog");

// --- Shared helpers still exist (kept from TASK-031 audit). ---
for (const marker of ["filterCategoryTree", "toggleCategoryExpansion", "categoryLabel", "categoryRoot"]) {
  assert.ok(page.includes(marker) || tree.includes(marker), `TASK-032: missing shared helper ${marker}`);
}

// --- No new BigInt literal syntax (project-wide constraint, carried over
// from TASK-031). ---
assert.ok(!/\b(?:10000|375|100)n\b/.test(page), "TASK-032: BigInt literal syntax (e.g. 10000n) reappeared");

console.log(`TASK-032 UX audit passed (${trCalls.size + uiCalls.size} i18n call sites checked)`);
