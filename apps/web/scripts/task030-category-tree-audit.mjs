import fs from "node:fs";
const page = fs.readFileSync("app/page.tsx", "utf8");
const tree = fs.readFileSync("lib/category-tree.ts", "utf8");
for (const needle of ["buildCategoryTree", "parent_id", "aria-expanded", "filterCategoryTree", "getParentOptions", "Add child category", "canMoveCategory"]) {
  if (!page.includes(needle) && !tree.includes(needle)) throw new Error(`TASK-030 missing ${needle}`);
}
if (/query\.data\?\.map\(x => <article/.test(page.replace(/function Accounts\([\s\S]*?function Categories/, "function Categories"))) throw new Error("TASK-030 flat category rendering remains");
console.log("TASK-030 category tree audit passed");
