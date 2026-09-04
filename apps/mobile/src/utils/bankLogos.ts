import { AccountType } from "../types";

export interface BankBrand {
  key?: string;
  name: string;
  shortLabel: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  badgeBg: string;
  badgeFg: string;
}

function normalizeStr(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export const BRAND_CATALOG: Record<string, BankBrand> = {
  // Top Tier Banks (Big 4 & Large Commercial Banks)
  VIETCOMBANK: {
    name: "Vietcombank",
    shortLabel: "VCB",
    primaryColor: "#00713d",
    secondaryColor: "#73b92b",
    textColor: "#ffffff",
    badgeBg: "#00713d",
    badgeFg: "#ffffff",
  },
  BIDV: {
    name: "BIDV",
    shortLabel: "BIDV",
    primaryColor: "#006B68",
    secondaryColor: "#fdb913",
    textColor: "#ffffff",
    badgeBg: "#006B68",
    badgeFg: "#ffffff",
  },
  VIETINBANK: {
    name: "VietinBank",
    shortLabel: "CTG",
    primaryColor: "#00529c",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#00529c",
    badgeFg: "#ffffff",
  },
  AGRIBANK: {
    name: "Agribank",
    shortLabel: "VBA",
    primaryColor: "#8b181b",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#8b181b",
    badgeFg: "#ffffff",
  },
  TECHCOMBANK: {
    name: "Techcombank",
    shortLabel: "TCB",
    primaryColor: "#e01a22",
    secondaryColor: "#111111",
    textColor: "#ffffff",
    badgeBg: "#e01a22",
    badgeFg: "#ffffff",
  },
  MBBANK: {
    name: "MB Bank",
    shortLabel: "MB",
    primaryColor: "#1428a0",
    secondaryColor: "#e30613",
    textColor: "#ffffff",
    badgeBg: "#1428a0",
    badgeFg: "#ffffff",
  },
  VPBANK: {
    name: "VPBank",
    shortLabel: "VPB",
    primaryColor: "#009944",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#009944",
    badgeFg: "#ffffff",
  },
  ACB: {
    name: "ACB",
    shortLabel: "ACB",
    primaryColor: "#0066b3",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#0066b3",
    badgeFg: "#ffffff",
  },
  SACOMBANK: {
    name: "Sacombank",
    shortLabel: "STB",
    primaryColor: "#004b91",
    secondaryColor: "#ea5b0c",
    textColor: "#ffffff",
    badgeBg: "#004b91",
    badgeFg: "#ffffff",
  },
  TPBANK: {
    name: "TPBank",
    shortLabel: "TPB",
    primaryColor: "#7b2382",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#7b2382",
    badgeFg: "#ffffff",
  },
  HDBANK: {
    name: "HDBank",
    shortLabel: "HDB",
    primaryColor: "#da251c",
    secondaryColor: "#fdb813",
    textColor: "#ffffff",
    badgeBg: "#da251c",
    badgeFg: "#ffffff",
  },
  VIB: {
    name: "VIB",
    shortLabel: "VIB",
    primaryColor: "#004f9e",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#004f9e",
    badgeFg: "#ffffff",
  },
  SHB: {
    name: "SHB",
    shortLabel: "SHB",
    primaryColor: "#f37021",
    secondaryColor: "#004f9e",
    textColor: "#ffffff",
    badgeBg: "#f37021",
    badgeFg: "#ffffff",
  },
  MSB: {
    name: "MSB",
    shortLabel: "MSB",
    primaryColor: "#ed1c24",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#ed1c24",
    badgeFg: "#ffffff",
  },
  SEABANK: {
    name: "SeABank",
    shortLabel: "SSB",
    primaryColor: "#c8102e",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#c8102e",
    badgeFg: "#ffffff",
  },
  OCB: {
    name: "OCB",
    shortLabel: "OCB",
    primaryColor: "#007a33",
    secondaryColor: "#f5a800",
    textColor: "#ffffff",
    badgeBg: "#007a33",
    badgeFg: "#ffffff",
  },
  LPBANK: {
    name: "LPBank",
    shortLabel: "LPB",
    primaryColor: "#e4002b",
    secondaryColor: "#f39200",
    textColor: "#ffffff",
    badgeBg: "#e4002b",
    badgeFg: "#ffffff",
  },
  EXIMBANK: {
    name: "Eximbank",
    shortLabel: "EIB",
    primaryColor: "#005baa",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
  },
  NAMABANK: {
    name: "Nam A Bank",
    shortLabel: "NAB",
    primaryColor: "#0083ca",
    secondaryColor: "#f5a800",
    textColor: "#ffffff",
    badgeBg: "#0083ca",
    badgeFg: "#ffffff",
  },
  BACABANK: {
    name: "Bac A Bank",
    shortLabel: "BAB",
    primaryColor: "#8b6d38",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#8b6d38",
    badgeFg: "#ffffff",
  },
  KIENLONGBANK: {
    name: "KienlongBank",
    shortLabel: "KLB",
    primaryColor: "#0072bc",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#0072bc",
    badgeFg: "#ffffff",
  },
  BAOVIETBANK: {
    name: "BaoViet Bank",
    shortLabel: "BVB",
    primaryColor: "#00529c",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#00529c",
    badgeFg: "#ffffff",
  },
  PVCOMBANK: {
    name: "PVcomBank",
    shortLabel: "PVC",
    primaryColor: "#fdb913",
    secondaryColor: "#00529c",
    textColor: "#ffffff",
    badgeBg: "#fdb913",
    badgeFg: "#ffffff",
  },
  VIETABANK: {
    name: "VietABank",
    shortLabel: "VAB",
    primaryColor: "#008444",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#008444",
    badgeFg: "#ffffff",
  },
  SAIGONBANK: {
    name: "Saigonbank",
    shortLabel: "SGB",
    primaryColor: "#005082",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#005082",
    badgeFg: "#ffffff",
  },
  ABBANK: {
    name: "ABBank",
    shortLabel: "ABB",
    primaryColor: "#008542",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#008542",
    badgeFg: "#ffffff",
  },
  PGBANK: {
    name: "PGBank",
    shortLabel: "PGB",
    primaryColor: "#004b91",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#004b91",
    badgeFg: "#ffffff",
  },
  BVBANK: {
    name: "BVBank (Bản Việt)",
    shortLabel: "BVB",
    primaryColor: "#d71920",
    secondaryColor: "#004b91",
    textColor: "#ffffff",
    badgeBg: "#d71920",
    badgeFg: "#ffffff",
  },
  TIMO: {
    name: "Timo",
    shortLabel: "Timo",
    primaryColor: "#76298b",
    secondaryColor: "#ff7f00",
    textColor: "#ffffff",
    badgeBg: "#76298b",
    badgeFg: "#ffffff",
  },

  // Foreign & Joint Venture Banks
  SHINHAN: {
    name: "Shinhan Bank",
    shortLabel: "SHB",
    primaryColor: "#004687",
    secondaryColor: "#0072ce",
    textColor: "#ffffff",
    badgeBg: "#004687",
    badgeFg: "#ffffff",
  },
  HSBC: {
    name: "HSBC",
    shortLabel: "HSBC",
    primaryColor: "#db0011",
    secondaryColor: "#222222",
    textColor: "#ffffff",
    badgeBg: "#db0011",
    badgeFg: "#ffffff",
  },
  STANDARDCHARTERED: {
    name: "Standard Chartered",
    shortLabel: "SCB",
    primaryColor: "#009900",
    secondaryColor: "#00529c",
    textColor: "#ffffff",
    badgeBg: "#009900",
    badgeFg: "#ffffff",
  },
  CITIBANK: {
    name: "Citibank",
    shortLabel: "Citi",
    primaryColor: "#003b70",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#003b70",
    badgeFg: "#ffffff",
  },
  UOB: {
    name: "UOB",
    shortLabel: "UOB",
    primaryColor: "#0b2341",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#0b2341",
    badgeFg: "#ffffff",
  },
  PUBLICBANK: {
    name: "Public Bank",
    shortLabel: "PBVN",
    primaryColor: "#c8102e",
    secondaryColor: "#222222",
    textColor: "#ffffff",
    badgeBg: "#c8102e",
    badgeFg: "#ffffff",
  },
  VRB: {
    name: "VRB (Việt Nga)",
    shortLabel: "VRB",
    primaryColor: "#00529c",
    secondaryColor: "#d71920",
    textColor: "#ffffff",
    badgeBg: "#00529c",
    badgeFg: "#ffffff",
  },
  WOORIBANK: {
    name: "Woori Bank",
    shortLabel: "Woori",
    primaryColor: "#0072ce",
    secondaryColor: "#004b91",
    textColor: "#ffffff",
    badgeBg: "#0072ce",
    badgeFg: "#ffffff",
  },
  CIMB: {
    name: "CIMB Bank",
    shortLabel: "CIMB",
    primaryColor: "#ed1c24",
    secondaryColor: "#222222",
    textColor: "#ffffff",
    badgeBg: "#ed1c24",
    badgeFg: "#ffffff",
  },
  HONGLEONG: {
    name: "Hong Leong Bank",
    shortLabel: "HLB",
    primaryColor: "#b81e28",
    secondaryColor: "#004b91",
    textColor: "#ffffff",
    badgeBg: "#b81e28",
    badgeFg: "#ffffff",
  },

  // E-wallets & Digital Banks / Fintech
  MOMO: {
    name: "MoMo",
    shortLabel: "MoMo",
    primaryColor: "#a50064",
    secondaryColor: "#d82d8b",
    textColor: "#ffffff",
    badgeBg: "#a50064",
    badgeFg: "#ffffff",
  },
  ZALOPAY: {
    name: "ZaloPay",
    shortLabel: "Zalo",
    primaryColor: "#0068ff",
    secondaryColor: "#00be00",
    textColor: "#ffffff",
    badgeBg: "#0068ff",
    badgeFg: "#ffffff",
  },
  VIETTELMONEY: {
    name: "Viettel Money",
    shortLabel: "VTM",
    primaryColor: "#ea1d25",
    secondaryColor: "#ff7f00",
    textColor: "#ffffff",
    badgeBg: "#ea1d25",
    badgeFg: "#ffffff",
  },
  SHOPEEPAY: {
    name: "ShopeePay",
    shortLabel: "SPay",
    primaryColor: "#ee4d2d",
    secondaryColor: "#f05d40",
    textColor: "#ffffff",
    badgeBg: "#ee4d2d",
    badgeFg: "#ffffff",
  },
  VNPAY: {
    name: "VNPAY",
    shortLabel: "VNPay",
    primaryColor: "#005baa",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
  },
  CAKE: {
    name: "Cake by VPBank",
    shortLabel: "CAKE",
    primaryColor: "#e91e63",
    secondaryColor: "#ff4081",
    textColor: "#ffffff",
    badgeBg: "#e91e63",
    badgeFg: "#ffffff",
  },
  LIOBANK: {
    name: "Liobank",
    shortLabel: "Lio",
    primaryColor: "#111111",
    secondaryColor: "#333333",
    textColor: "#ffffff",
    badgeBg: "#111111",
    badgeFg: "#ffffff",
  },
  PAYOO: {
    name: "Payoo",
    shortLabel: "Payoo",
    primaryColor: "#0072bc",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#0072bc",
    badgeFg: "#ffffff",
  },
  GRABPAY: {
    name: "GrabPay",
    shortLabel: "Grab",
    primaryColor: "#00b14f",
    secondaryColor: "#27ae60",
    textColor: "#ffffff",
    badgeBg: "#00b14f",
    badgeFg: "#ffffff",
  },
  TRUEMONEY: {
    name: "TrueMoney",
    shortLabel: "True",
    primaryColor: "#f37021",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#f37021",
    badgeFg: "#ffffff",
  },
  TIKI: {
    name: "TikiPay",
    shortLabel: "TIKI",
    primaryColor: "#1a94ff",
    secondaryColor: "#0d5cb6",
    textColor: "#ffffff",
    badgeBg: "#1a94ff",
    badgeFg: "#ffffff",
  },
  TNEX: {
    name: "TNEX",
    shortLabel: "TNEX",
    primaryColor: "#00d2ff",
    secondaryColor: "#7928ca",
    textColor: "#ffffff",
    badgeBg: "#00d2ff",
    badgeFg: "#ffffff",
  },
  NEXTPAY: {
    name: "NextPay",
    shortLabel: "Next",
    primaryColor: "#00a859",
    secondaryColor: "#005baa",
    textColor: "#ffffff",
    badgeBg: "#00a859",
    badgeFg: "#ffffff",
  },
  PAYPAL: {
    name: "PayPal",
    shortLabel: "PP",
    primaryColor: "#003087",
    secondaryColor: "#0079c1",
    textColor: "#ffffff",
    badgeBg: "#003087",
    badgeFg: "#ffffff",
  },
  APPLEPAY: {
    name: "Apple Pay",
    shortLabel: "Apple",
    primaryColor: "#000000",
    secondaryColor: "#333333",
    textColor: "#ffffff",
    badgeBg: "#000000",
    badgeFg: "#ffffff",
  },
  GOOGLEPAY: {
    name: "Google Pay",
    shortLabel: "GPay",
    primaryColor: "#4285f4",
    secondaryColor: "#34a853",
    textColor: "#ffffff",
    badgeBg: "#4285f4",
    badgeFg: "#ffffff",
  },
};

const DEFAULT_THEMES: Record<AccountType, BankBrand> = {
  CASH: {
    name: "Tiền mặt",
    shortLabel: "TIỀN",
    primaryColor: "#10b981",
    secondaryColor: "#059669",
    textColor: "#ffffff",
    badgeBg: "#10b981",
    badgeFg: "#ffffff",
  },
  BANK: {
    name: "Ngân hàng",
    shortLabel: "BANK",
    primaryColor: "#2563eb",
    secondaryColor: "#1d4ed8",
    textColor: "#ffffff",
    badgeBg: "#2563eb",
    badgeFg: "#ffffff",
  },
  EWALLET: {
    name: "Ví điện tử",
    shortLabel: "VÍ",
    primaryColor: "#ec4899",
    secondaryColor: "#db2777",
    textColor: "#ffffff",
    badgeBg: "#ec4899",
    badgeFg: "#ffffff",
  },
  CREDIT_CARD: {
    name: "Thẻ tín dụng",
    shortLabel: "THẺ",
    primaryColor: "#6366f1",
    secondaryColor: "#4f46e5",
    textColor: "#ffffff",
    badgeBg: "#6366f1",
    badgeFg: "#ffffff",
  },
};

// Automatically populate key for all catalog entries
Object.entries(BRAND_CATALOG).forEach(([k, v]) => {
  v.key = k;
});

DEFAULT_THEMES.CASH.key = "CASH";
DEFAULT_THEMES.BANK.key = "BANK";
DEFAULT_THEMES.EWALLET.key = "EWALLET";
DEFAULT_THEMES.CREDIT_CARD.key = "CREDIT_CARD";

export function getAccountBrand(name: string, accountType: AccountType): BankBrand {
  const norm = normalizeStr(name);

  // Exact catalog keys matching
  if (BRAND_CATALOG[norm]) {
    return BRAND_CATALOG[norm];
  }

  // Substring matching
  if (norm.includes("VIETCOM") || norm.includes("VCB")) return BRAND_CATALOG.VIETCOMBANK;
  if (norm.includes("BIDV")) return BRAND_CATALOG.BIDV;
  if (norm.includes("VIETIN") || norm.includes("CTG")) return BRAND_CATALOG.VIETINBANK;
  if (norm.includes("AGRI") || norm.includes("VARB")) return BRAND_CATALOG.AGRIBANK;
  if (norm.includes("TECHCOM") || norm.includes("TCB")) return BRAND_CATALOG.TECHCOMBANK;
  if (norm.includes("MBBANK") || norm.includes("MB") || norm.includes("QUANDO")) return BRAND_CATALOG.MBBANK;
  if (norm.includes("VPBANK") || norm.includes("VPB")) return BRAND_CATALOG.VPBANK;
  if (norm.includes("ACB") || norm.includes("ACHAU")) return BRAND_CATALOG.ACB;
  if (norm.includes("SACOM") || norm.includes("STB")) return BRAND_CATALOG.SACOMBANK;
  if (norm.includes("TPBANK") || norm.includes("TPB") || norm.includes("TIENPHONG")) return BRAND_CATALOG.TPBANK;
  if (norm.includes("HDBANK") || norm.includes("HDB")) return BRAND_CATALOG.HDBANK;
  if (norm.includes("VIB") || norm.includes("QUOCTE")) return BRAND_CATALOG.VIB;
  if (norm.includes("SHB")) return BRAND_CATALOG.SHB;
  if (norm.includes("MSB") || norm.includes("MARITIME") || norm.includes("HANGHAI")) return BRAND_CATALOG.MSB;
  if (norm.includes("SEABANK") || norm.includes("SEAB")) return BRAND_CATALOG.SEABANK;
  if (norm.includes("OCB") || norm.includes("PHUONGDONG")) return BRAND_CATALOG.OCB;
  if (norm.includes("LPBANK") || norm.includes("LIENVIET") || norm.includes("LPB")) return BRAND_CATALOG.LPBANK;
  if (norm.includes("EXIM") || norm.includes("EIB")) return BRAND_CATALOG.EXIMBANK;
  if (norm.includes("NAMA") || norm.includes("NAB")) return BRAND_CATALOG.NAMABANK;
  if (norm.includes("BACA") || norm.includes("BAB")) return BRAND_CATALOG.BACABANK;
  if (norm.includes("KIENLONG") || norm.includes("KLB")) return BRAND_CATALOG.KIENLONGBANK;
  if (norm.includes("BAOVIET") || norm.includes("BVBANK")) return BRAND_CATALOG.BAOVIETBANK;
  if (norm.includes("PVCOM") || norm.includes("PVC")) return BRAND_CATALOG.PVCOMBANK;
  if (norm.includes("VIETA") || norm.includes("VAB")) return BRAND_CATALOG.VIETABANK;
  if (norm.includes("SAIGONBANK") || norm.includes("SGB")) return BRAND_CATALOG.SAIGONBANK;
  if (norm.includes("ABBANK") || norm.includes("ANBINH") || norm.includes("ABB")) return BRAND_CATALOG.ABBANK;
  if (norm.includes("PGBANK") || norm.includes("PGB")) return BRAND_CATALOG.PGBANK;
  if (norm.includes("BANVIET") || norm.includes("BVB")) return BRAND_CATALOG.BVBANK;
  if (norm.includes("TIMO")) return BRAND_CATALOG.TIMO;

  if (norm.includes("SHINHAN")) return BRAND_CATALOG.SHINHAN;
  if (norm.includes("HSBC")) return BRAND_CATALOG.HSBC;
  if (norm.includes("STANDARD") || norm.includes("SCB")) return BRAND_CATALOG.STANDARDCHARTERED;
  if (norm.includes("CITI")) return BRAND_CATALOG.CITIBANK;
  if (norm.includes("UOB")) return BRAND_CATALOG.UOB;
  if (norm.includes("PUBLIC")) return BRAND_CATALOG.PUBLICBANK;
  if (norm.includes("VRB") || norm.includes("VIETNGA")) return BRAND_CATALOG.VRB;
  if (norm.includes("WOORI")) return BRAND_CATALOG.WOORIBANK;
  if (norm.includes("CIMB")) return BRAND_CATALOG.CIMB;
  if (norm.includes("HONGLEONG") || norm.includes("HLB")) return BRAND_CATALOG.HONGLEONG;

  if (norm.includes("MOMO")) return BRAND_CATALOG.MOMO;
  if (norm.includes("ZALO") || norm.includes("ZALOPAY")) return BRAND_CATALOG.ZALOPAY;
  if (norm.includes("VIETTEL") || norm.includes("VTM") || norm.includes("VTEL")) return BRAND_CATALOG.VIETTELMONEY;
  if (norm.includes("SHOPEE") || norm.includes("AIRPAY") || norm.includes("SPAY")) return BRAND_CATALOG.SHOPEEPAY;
  if (norm.includes("VNPAY") || norm.includes("VNPT")) return BRAND_CATALOG.VNPAY;
  if (norm.includes("CAKE")) return BRAND_CATALOG.CAKE;
  if (norm.includes("LIO")) return BRAND_CATALOG.LIOBANK;
  if (norm.includes("PAYOO")) return BRAND_CATALOG.PAYOO;
  if (norm.includes("GRAB") || norm.includes("MOCA")) return BRAND_CATALOG.GRABPAY;
  if (norm.includes("TRUE") || norm.includes("TRUEMONEY")) return BRAND_CATALOG.TRUEMONEY;
  if (norm.includes("TIKI")) return BRAND_CATALOG.TIKI;
  if (norm.includes("TNEX")) return BRAND_CATALOG.TNEX;
  if (norm.includes("NEXTPAY")) return BRAND_CATALOG.NEXTPAY;
  if (norm.includes("PAYPAL")) return BRAND_CATALOG.PAYPAL;
  if (norm.includes("APPLE")) return BRAND_CATALOG.APPLEPAY;
  if (norm.includes("GOOGLE") || norm.includes("GPAY")) return BRAND_CATALOG.GOOGLEPAY;

  return DEFAULT_THEMES[accountType] || DEFAULT_THEMES.BANK;
}

export const ALL_BRAND_LIST: (BankBrand & { key: string })[] = Object.entries(BRAND_CATALOG).map(
  ([key, val]) => ({
    ...val,
    key,
  })
);
