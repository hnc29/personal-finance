import fs from "node:fs";
const page = fs.readFileSync("app/page.tsx", "utf8");
const tree = fs.readFileSync("lib/category-tree.ts", "utf8");
const i18n = fs.readFileSync("lib/i18n.ts", "utf8");
for (const needle of ["composer", "segmented", "filterCategoryTree", "aria-expanded", "Search category"]) if (!page.includes(needle) && !tree.includes(needle)) throw new Error(`TASK-029 missing ${needle}`);
if (page.match(/className=\"segmented\"[\s\S]{0,1200}<Field label=\"Type\"><select/)) throw new Error("redundant primary Type select");
for (const needle of ["Sổ tiết kiệm", "Số lượng (chỉ)", "Tìm coin", "Mã CoinGecko", "Danh mục sản phẩm", "Thêm sản phẩm"]) if (!i18n.includes(needle)) throw new Error(`missing i18n ${needle}`);
console.log("TASK-029 UI audit passed");
