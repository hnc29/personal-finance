export type BankCategory =
  | "STATE_OWNED"
  | "JOINT_STOCK"
  | "FOREIGN_100"
  | "JOINT_VENTURE"
  | "POLICY"
  | "COOPERATIVE"
  | "TRANSFERRED";

// NOTE: `icon` used to point at /public/banks/*.ico assets that were never
// actually added to the repo (no public/banks/ directory exists, and no
// component ever reads BankCatalogEntry.icon) -- dropped instead of kept as
// dead, misleading data when this catalog was expanded and reorganized.
export type BankCatalogEntry = {
  key: string;
  name: string;
  category: BankCategory;
  website: string;
  aliases: string[];
};

// Cập nhật 2026-08 -- danh sách các ngân hàng đang hoạt động hợp pháp tại
// Việt Nam theo phân loại của Ngân hàng Nhà nước: NHTM Nhà nước/cổ phần chi
// phối, NHTM cổ phần, ngân hàng 100% vốn nước ngoài, ngân hàng liên doanh,
// ngân hàng chính sách, ngân hàng hợp tác xã, và nhóm ngân hàng TNHH một
// thành viên (các ngân hàng được chuyển giao bắt buộc gần đây: GPBank,
// VCBNeo, Vikki Bank, MBV). Dữ liệu tĩnh phục vụ chọn ngân hàng khi tạo tài
// khoản -- không phải dữ liệu tài chính thật, an toàn để cập nhật trực tiếp
// trong mã nguồn. Dùng làm danh sách CHỌN (không cho gõ tự do) cho tài
// khoản loại Ngân hàng / Thẻ tín dụng -- xem AccountFormDialog.
const RAW: [string, string, BankCategory, string][] = [
  // NHTM Nhà nước / cổ phần do Nhà nước chi phối vốn
  ["agribank", "Agribank", "STATE_OWNED", "https://www.agribank.com.vn/"],
  ["vietcombank", "Vietcombank", "STATE_OWNED", "https://www.vietcombank.com.vn/"],
  ["bidv", "BIDV", "STATE_OWNED", "https://bidv.com.vn/"],
  ["vietinbank", "VietinBank", "STATE_OWNED", "https://www.vietinbank.vn/"],

  // NHTM cổ phần
  ["acb", "ACB", "JOINT_STOCK", "https://acb.com.vn/"],
  ["abbank", "ABBANK", "JOINT_STOCK", "https://abbank.vn/"],
  ["bacabank", "Bac A Bank", "JOINT_STOCK", "https://www.baca-bank.vn/"],
  ["bvbank", "BVBank (Bản Việt)", "JOINT_STOCK", "https://www.bvbank.net.vn/"],
  ["baovietbank", "BAOVIET Bank", "JOINT_STOCK", "https://www.baovietbank.vn/"],
  ["pvcombank", "PVcomBank", "JOINT_STOCK", "https://www.pvcombank.com.vn/"],
  ["seabank", "SeABank", "JOINT_STOCK", "https://www.seabank.com.vn/"],
  ["msb", "MSB", "JOINT_STOCK", "https://www.msb.com.vn/"],
  ["kienlongbank", "Kienlongbank", "JOINT_STOCK", "https://kienlongbank.com/"],
  ["techcombank", "Techcombank", "JOINT_STOCK", "https://techcombank.com/"],
  ["lpbank", "LPBank", "JOINT_STOCK", "https://lpbank.com.vn/"],
  ["namabank", "Nam A Bank", "JOINT_STOCK", "https://www.namabank.com.vn/"],
  ["scb", "SCB (Sài Gòn)", "JOINT_STOCK", ""],
  ["shb", "SHB", "JOINT_STOCK", "https://www.shb.com.vn/"],
  ["saigonbank", "Saigonbank", "JOINT_STOCK", "https://www.saigonbank.com.vn/"],
  ["sacombank", "Sacombank", "JOINT_STOCK", "https://www.sacombank.com.vn/"],
  ["pgbank", "PGBank", "JOINT_STOCK", "https://www.pgbank.com.vn/"],
  ["tpbank", "TPBank", "JOINT_STOCK", "https://tpb.vn/"],
  ["vietabank", "VietABank", "JOINT_STOCK", "https://vietabank.com.vn/"],
  ["vpbank", "VPBank", "JOINT_STOCK", "https://www.vpbank.com.vn/"],
  ["vietbank", "Vietbank", "JOINT_STOCK", "https://www.vietbank.com.vn/"],
  ["eximbank", "Eximbank", "JOINT_STOCK", "https://eximbank.com.vn/"],
  ["hdbank", "HDBank", "JOINT_STOCK", "https://hdbank.com.vn/"],
  ["ocb", "OCB", "JOINT_STOCK", "https://www.ocb.com.vn/"],
  ["vib", "VIB", "JOINT_STOCK", "https://www.vib.com.vn/"],
  ["ncb", "NCB", "JOINT_STOCK", "https://ncb-bank.vn/"],
  ["mb", "MB (Quân đội)", "JOINT_STOCK", "https://www.mbbank.com.vn/"],

  // Ngân hàng 100% vốn nước ngoài tại Việt Nam
  ["anzvl", "ANZ Việt Nam", "FOREIGN_100", ""],
  ["cimb", "CIMB Việt Nam", "FOREIGN_100", ""],
  ["hlbvn", "Hong Leong Bank Việt Nam", "FOREIGN_100", ""],
  ["hsbc", "HSBC Việt Nam", "FOREIGN_100", ""],
  ["pbvn", "Public Bank Việt Nam", "FOREIGN_100", ""],
  ["shinhan", "Shinhan Bank Việt Nam", "FOREIGN_100", ""],
  ["scbvl", "Standard Chartered Việt Nam", "FOREIGN_100", ""],
  ["uob", "UOB Việt Nam", "FOREIGN_100", ""],
  ["woori", "Woori Bank Việt Nam", "FOREIGN_100", ""],

  // Ngân hàng liên doanh
  ["ivb", "Indovina Bank (IVB)", "JOINT_VENTURE", ""],
  ["vrb", "VRB (Việt - Nga)", "JOINT_VENTURE", ""],

  // Ngân hàng chính sách
  ["vbsp", "Ngân hàng Chính sách Xã hội (VBSP)", "POLICY", "https://vbsp.org.vn/"],
  ["vdb", "Ngân hàng Phát triển Việt Nam (VDB)", "POLICY", ""],

  // Ngân hàng hợp tác xã
  ["coopbank", "Ngân hàng Hợp tác xã Việt Nam (Co-opBank)", "COOPERATIVE", ""],

  // Ngân hàng TNHH một thành viên (chuyển giao bắt buộc)
  ["gpbank", "GPBank", "TRANSFERRED", ""],
  ["vcbneo", "VCBNeo", "TRANSFERRED", ""],
  ["vikkibank", "Vikki Bank", "TRANSFERRED", ""],
  ["mbv", "MBV", "TRANSFERRED", ""],
];

export const bankCatalog: BankCatalogEntry[] = RAW.map(([key, name, category, website]) => ({
  key,
  name,
  category,
  website,
  aliases: [name, key],
}));

bankCatalog.push({ key: "other", name: "Khác / Ngân hàng khác", category: "JOINT_STOCK", website: "", aliases: ["other", "custom", "khac"] });

export const bankCategoryOrder: BankCategory[] = [
  "STATE_OWNED",
  "JOINT_STOCK",
  "FOREIGN_100",
  "JOINT_VENTURE",
  "POLICY",
  "COOPERATIVE",
  "TRANSFERRED",
];

export const bankCategoryLabel: Record<BankCategory, string> = {
  STATE_OWNED: "Ngân hàng Nhà nước / cổ phần chi phối",
  JOINT_STOCK: "Ngân hàng thương mại cổ phần",
  FOREIGN_100: "Ngân hàng 100% vốn nước ngoài",
  JOINT_VENTURE: "Ngân hàng liên doanh",
  POLICY: "Ngân hàng chính sách",
  COOPERATIVE: "Ngân hàng hợp tác xã",
  TRANSFERRED: "Ngân hàng TNHH MTV (chuyển giao bắt buộc)",
};

export const bankForName = (name: string) => {
  const normalized = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const matches = bankCatalog.filter(b => b.key !== "other" && b.aliases.some(a => new RegExp(`(^| )${a.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim()}($| )`).test(normalized)));
  return matches.length === 1 ? matches[0] : undefined;
};

export interface EWalletCatalogEntry {
  key: string;
  name: string;
  aliases: string[];
}

export const ewalletCatalog: EWalletCatalogEntry[] = [
  { key: "momo", name: "MoMo (Ví MoMo)", aliases: ["momo", "ví momo", "vi momo"] },
  { key: "zalopay", name: "ZaloPay", aliases: ["zalopay", "ví zalopay", "vi zalopay", "zalo"] },
  { key: "viettelmoney", name: "Viettel Money (ViettelPay)", aliases: ["viettel money", "viettelpay", "viettel"] },
  { key: "vnpay", name: "VNPay (Ví VNPAY)", aliases: ["vnpay", "ví vnpay", "vi vnpay"] },
  { key: "shopeepay", name: "ShopeePay (AirPay)", aliases: ["shopeepay", "shopee pay", "airpay", "ví shopeepay"] },
  { key: "moca", name: "Moca (GrabPay)", aliases: ["moca", "grabpay", "grab"] },
  { key: "payoo", name: "Payoo", aliases: ["payoo", "ví payoo"] },
  { key: "9pay", name: "9Pay", aliases: ["9pay", "ví 9pay"] },
  { key: "foxpay", name: "Foxpay", aliases: ["foxpay", "ví foxpay"] },
  { key: "appotapay", name: "AppotaPay", aliases: ["appotapay", "appota", "ví appotapay"] },
  { key: "vnptmoney", name: "VNPT Money (VNPT Pay)", aliases: ["vnpt money", "vnpt pay", "vnpt"] },
  { key: "other", name: "Ví điện tử khác", aliases: ["khac", "other"] },
];

