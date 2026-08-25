import fs from "node:fs";
const page = fs.readFileSync("app/page.tsx", "utf8");
const tree = fs.readFileSync("lib/category-tree.ts", "utf8");
const i18n = fs.readFileSync("lib/i18n.ts", "utf8");
for (const needle of ["composer", "segmented", "filterCategoryTree", "aria-expanded", "Search category"]) if (!page.includes(needle) && !tree.includes(needle)) throw new Error(`TASK-029 missing ${needle}`);
if (page.match(/className=\"segmented\"[\s\S]{0,1200}<Field label=\"Type\"><select/)) throw new Error("redundant primary Type select");
// These check real, wired-up i18n values (key -> vi translation), not just
// substring presence of dead/unused dictionary entries. "Sổ tiết kiệm",
// "Mã CoinGecko" and "Thêm sản phẩm" were removed as TASK-032 cleanup: they
// were self-mapped placeholder entries (key === value, never looked up by
// any tr()/ui() call site) for the MISA-style savings book fields (maturity
// date / term / interest rate) that TASK-029 §3 specified but that were
// never actually built into the Savings form -- that remains a known,
// tracked gap (see docs/tasks/TASK-032.md), not something this audit should
// paper over by asserting dead strings exist.
for (const needle of ["Số lượng (chỉ)", "Tìm coin", "Danh mục sản phẩm"]) if (!i18n.includes(needle)) throw new Error(`missing i18n ${needle}`);
console.log("TASK-029 UI audit passed");
