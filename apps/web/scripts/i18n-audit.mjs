import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !["node_modules", ".next", ".next-smoke"].includes(entry.name)) return sourceFiles(path);
    return entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}
const source = sourceFiles(new URL("../app", import.meta.url).pathname)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const forbidden = [
  ">None<", ">Account entries<", ">Select account<", ">Add another entry<",
  ">Load failed<", ">Date<", ">Type<", ">Details<", ">Entries<",
  "Use negative amounts for money leaving an account and positive amounts for money entering it. Transfers normally need two entries.</p>",
];
const leaks = forbidden.filter(value => source.includes(value));
if (leaks.length) {
  console.error(`Visible English literals outside i18n dictionary: ${leaks.join(", ")}`);
  process.exit(1);
}

const dictionary = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
for (const value of ["Không có", "Tài khoản giao dịch", "Chọn tài khoản", "Thêm dòng giao dịch", "Số tiền", "Thêm chi tiết", "Ẩn chi tiết", "Chọn danh mục", "Ghi giao dịch", "Tải dữ liệu thất bại", "Chi tiết"]) {
  if (!dictionary.includes(value)) throw new Error(`Missing Vietnamese regression string: ${value}`);
}
