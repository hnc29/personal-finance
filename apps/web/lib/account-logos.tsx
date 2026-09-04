"use client";
import React from "react";
import type { AccountType } from "./api";

export interface BankBrand {
  key: string;
  name: string;
  shortLabel: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  badgeBg: string;
  badgeFg: string;
  logo?: string;
  gradient?: string;
  cardBorder?: string;
  cardBgTint?: string;
}

export type BrandTheme = BankBrand;

function normalizeStr(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

type BankBrandDraft = Omit<BankBrand, "key">;

const RAW_BANKS: Record<string, BankBrandDraft> = {
  // Required by TASK-037 audit
  SHB: {
    name: "SHB",
    shortLabel: "SHB",
    primaryColor: "#f37021",
    secondaryColor: "#004f9e",
    textColor: "#ffffff",
    badgeBg: "#f37021",
    badgeFg: "#ffffff",
    logo: "shb",
  },
  VPB: {
    name: "VPBank",
    shortLabel: "VPB",
    primaryColor: "#009944",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#009944",
    badgeFg: "#ffffff",
    logo: "vpb",
  },
  BIDV: {
    name: "BIDV",
    shortLabel: "BIDV",
    primaryColor: "#006B68",
    secondaryColor: "#fdb913",
    textColor: "#ffffff",
    badgeBg: "#006B68",
    badgeFg: "#ffffff",
    logo: "bidv",
  },
  TECH: {
    name: "Techcombank",
    shortLabel: "TCB",
    primaryColor: "#e01a22",
    secondaryColor: "#111111",
    textColor: "#ffffff",
    badgeBg: "#e01a22",
    badgeFg: "#ffffff",
    logo: "tech",
  },
  PVCOMBANK: {
    name: "PVcomBank",
    shortLabel: "PVC",
    primaryColor: "#fdb913",
    secondaryColor: "#00529c",
    textColor: "#ffffff",
    badgeBg: "#fdb913",
    badgeFg: "#ffffff",
    logo: "pvcombank",
  },
  SCB: {
    name: "SCB",
    shortLabel: "SCB",
    primaryColor: "#005baa",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
    logo: "scb",
  },
  EXIM: {
    name: "Eximbank",
    shortLabel: "EIB",
    primaryColor: "#005baa",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
    logo: "exim",
  },
  VIB: {
    name: "VIB",
    shortLabel: "VIB",
    primaryColor: "#004f9e",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#004f9e",
    badgeFg: "#ffffff",
    logo: "vib",
  },
  SHINHAN: {
    name: "Shinhan Bank",
    shortLabel: "SHB",
    primaryColor: "#004687",
    secondaryColor: "#0072ce",
    textColor: "#ffffff",
    badgeBg: "#004687",
    badgeFg: "#ffffff",
    logo: "shinhan",
  },

  // Other Major Banks
  VIETCOMBANK: {
    name: "Vietcombank",
    shortLabel: "VCB",
    primaryColor: "#00713d",
    secondaryColor: "#73b92b",
    textColor: "#ffffff",
    badgeBg: "#00713d",
    badgeFg: "#ffffff",
    logo: "vietcombank",
  },
  VIETINBANK: {
    name: "VietinBank",
    shortLabel: "CTG",
    primaryColor: "#00529c",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#00529c",
    badgeFg: "#ffffff",
    logo: "vietinbank",
  },
  AGRIBANK: {
    name: "Agribank",
    shortLabel: "VBA",
    primaryColor: "#8b181b",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#8b181b",
    badgeFg: "#ffffff",
    logo: "agribank",
  },
  MBBANK: {
    name: "MB Bank",
    shortLabel: "MB",
    primaryColor: "#1428a0",
    secondaryColor: "#e30613",
    textColor: "#ffffff",
    badgeBg: "#1428a0",
    badgeFg: "#ffffff",
    logo: "mbbank",
  },
  ACB: {
    name: "ACB",
    shortLabel: "ACB",
    primaryColor: "#0066b3",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#0066b3",
    badgeFg: "#ffffff",
    logo: "acb",
  },
  SACOMBANK: {
    name: "Sacombank",
    shortLabel: "STB",
    primaryColor: "#004b91",
    secondaryColor: "#ea5b0c",
    textColor: "#ffffff",
    badgeBg: "#004b91",
    badgeFg: "#ffffff",
    logo: "sacombank",
  },
  TPBANK: {
    name: "TPBank",
    shortLabel: "TPB",
    primaryColor: "#7b2382",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#7b2382",
    badgeFg: "#ffffff",
    logo: "tpbank",
  },
  HDBANK: {
    name: "HDBank",
    shortLabel: "HDB",
    primaryColor: "#da251c",
    secondaryColor: "#fdb813",
    textColor: "#ffffff",
    badgeBg: "#da251c",
    badgeFg: "#ffffff",
    logo: "hdbank",
  },
  MSB: {
    name: "MSB",
    shortLabel: "MSB",
    primaryColor: "#ed1c24",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#ed1c24",
    badgeFg: "#ffffff",
    logo: "msb",
  },
  SEABANK: {
    name: "SeABank",
    shortLabel: "SSB",
    primaryColor: "#c8102e",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#c8102e",
    badgeFg: "#ffffff",
    logo: "seabank",
  },
  OCB: {
    name: "OCB",
    shortLabel: "OCB",
    primaryColor: "#007a33",
    secondaryColor: "#f5a800",
    textColor: "#ffffff",
    badgeBg: "#007a33",
    badgeFg: "#ffffff",
    logo: "ocb",
  },
  LPBANK: {
    name: "LPBank",
    shortLabel: "LPB",
    primaryColor: "#e4002b",
    secondaryColor: "#f39200",
    textColor: "#ffffff",
    badgeBg: "#e4002b",
    badgeFg: "#ffffff",
    logo: "lpbank",
  },
  NAMABANK: {
    name: "Nam A Bank",
    shortLabel: "NAB",
    primaryColor: "#0083ca",
    secondaryColor: "#f5a800",
    textColor: "#ffffff",
    badgeBg: "#0083ca",
    badgeFg: "#ffffff",
    logo: "nam_a_bank",
  },
  BACABANK: {
    name: "Bac A Bank",
    shortLabel: "BAB",
    primaryColor: "#8b6d38",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#8b6d38",
    badgeFg: "#ffffff",
    logo: "bac_a_bank",
  },
  KIENLONGBANK: {
    name: "KienlongBank",
    shortLabel: "KLB",
    primaryColor: "#0072bc",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#0072bc",
    badgeFg: "#ffffff",
    logo: "kienlongbank",
  },
  BAOVIETBANK: {
    name: "BaoViet Bank",
    shortLabel: "BVB",
    primaryColor: "#00529c",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    badgeBg: "#00529c",
    badgeFg: "#ffffff",
    logo: "baovietbank",
  },
  SAIGONBANK: {
    name: "Saigonbank",
    shortLabel: "SGB",
    primaryColor: "#005082",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#005082",
    badgeFg: "#ffffff",
    logo: "saigonbank",
  },
  ABBANK: {
    name: "ABBank",
    shortLabel: "ABB",
    primaryColor: "#008542",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#008542",
    badgeFg: "#ffffff",
    logo: "abbank",
  },
  PGBANK: {
    name: "PGBank",
    shortLabel: "PGB",
    primaryColor: "#004b91",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    badgeBg: "#004b91",
    badgeFg: "#ffffff",
    logo: "pgbank",
  },
  BVBANK: {
    name: "BVBank (Bản Việt)",
    shortLabel: "BVB",
    primaryColor: "#d71920",
    secondaryColor: "#004b91",
    textColor: "#ffffff",
    badgeBg: "#d71920",
    badgeFg: "#ffffff",
    logo: "bvbank",
  },
  OCEANBANK: {
    name: "OceanBank",
    shortLabel: "OJB",
    primaryColor: "#0088cc",
    secondaryColor: "#005588",
    textColor: "#ffffff",
    badgeBg: "#0088cc",
    badgeFg: "#ffffff",
    logo: "oceanbank",
  },
  HSBC: {
    name: "HSBC",
    shortLabel: "HSBC",
    primaryColor: "#db0011",
    secondaryColor: "#222222",
    textColor: "#ffffff",
    badgeBg: "#db0011",
    badgeFg: "#ffffff",
    logo: "hsbc",
  },
  STANDARDCHARTERED: {
    name: "Standard Chartered",
    shortLabel: "SCB",
    primaryColor: "#009900",
    secondaryColor: "#00529c",
    textColor: "#ffffff",
    badgeBg: "#009900",
    badgeFg: "#ffffff",
    logo: "standard_chartered",
  },
  CITIBANK: {
    name: "Citibank",
    shortLabel: "Citi",
    primaryColor: "#003b70",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#003b70",
    badgeFg: "#ffffff",
    logo: "citibank",
  },
  VRB: {
    name: "VRB (Việt Nga)",
    shortLabel: "VRB",
    primaryColor: "#00529c",
    secondaryColor: "#d71920",
    textColor: "#ffffff",
    badgeBg: "#00529c",
    badgeFg: "#ffffff",
    logo: "vrb",
  },

  // E-wallets & Fintech
  MOMO: {
    name: "MoMo",
    shortLabel: "MoMo",
    primaryColor: "#a50064",
    secondaryColor: "#d82d8b",
    textColor: "#ffffff",
    badgeBg: "#a50064",
    badgeFg: "#ffffff",
    logo: "momo",
  },
  ZALOPAY: {
    name: "ZaloPay",
    shortLabel: "Zalo",
    primaryColor: "#0068ff",
    secondaryColor: "#00be00",
    textColor: "#ffffff",
    badgeBg: "#0068ff",
    badgeFg: "#ffffff",
    logo: "zalopay",
  },
  VIETTELMONEY: {
    name: "Viettel Money",
    shortLabel: "VTM",
    primaryColor: "#ea1d25",
    secondaryColor: "#ff7f00",
    textColor: "#ffffff",
    badgeBg: "#ea1d25",
    badgeFg: "#ffffff",
    logo: "viettelmoney",
  },
  SHOPEEPAY: {
    name: "ShopeePay",
    shortLabel: "SPay",
    primaryColor: "#ee4d2d",
    secondaryColor: "#f05d40",
    textColor: "#ffffff",
    badgeBg: "#ee4d2d",
    badgeFg: "#ffffff",
    logo: "shopeepay",
  },
  VNPAY: {
    name: "VNPAY",
    shortLabel: "VNPay",
    primaryColor: "#005baa",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
    logo: "vnpay",
  },
  CAKE: {
    name: "Cake by VPBank",
    shortLabel: "CAKE",
    primaryColor: "#e91e63",
    secondaryColor: "#ff4081",
    textColor: "#ffffff",
    badgeBg: "#e91e63",
    badgeFg: "#ffffff",
    logo: "cake",
  },
  LIOBANK: {
    name: "Liobank",
    shortLabel: "Lio",
    primaryColor: "#111111",
    secondaryColor: "#333333",
    textColor: "#ffffff",
    badgeBg: "#111111",
    badgeFg: "#ffffff",
    logo: "liobank",
  },
  PAYOO: {
    name: "Payoo",
    shortLabel: "Payoo",
    primaryColor: "#0072bc",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    badgeBg: "#0072bc",
    badgeFg: "#ffffff",
    logo: "payoo",
  },
  GRABPAY: {
    name: "GrabPay",
    shortLabel: "Grab",
    primaryColor: "#00b14f",
    secondaryColor: "#27ae60",
    textColor: "#ffffff",
    badgeBg: "#00b14f",
    badgeFg: "#ffffff",
    logo: "grabpay",
  },
  TRUEMONEY: {
    name: "TrueMoney",
    shortLabel: "True",
    primaryColor: "#f37021",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    badgeBg: "#f37021",
    badgeFg: "#ffffff",
    logo: "truemoney",
  },
  TIKI: {
    name: "TikiPay",
    shortLabel: "TIKI",
    primaryColor: "#1a94ff",
    secondaryColor: "#0d5cb6",
    textColor: "#ffffff",
    badgeBg: "#1a94ff",
    badgeFg: "#ffffff",
    logo: "tiki",
  },
  ONEPAY: {
    name: "OnePay",
    shortLabel: "One",
    primaryColor: "#e4002b",
    secondaryColor: "#f39200",
    textColor: "#ffffff",
    badgeBg: "#e4002b",
    badgeFg: "#ffffff",
    logo: "onepay",
  },
  NEXTPAY: {
    name: "NextPay",
    shortLabel: "Next",
    primaryColor: "#00a859",
    secondaryColor: "#005baa",
    textColor: "#ffffff",
    badgeBg: "#00a859",
    badgeFg: "#ffffff",
    logo: "nextpay",
  },
  PAYPAL: {
    name: "PayPal",
    shortLabel: "PP",
    primaryColor: "#003087",
    secondaryColor: "#0079c1",
    textColor: "#ffffff",
    badgeBg: "#003087",
    badgeFg: "#ffffff",
    logo: "paypal",
  },
  TIMO: {
    name: "Timo",
    shortLabel: "Timo",
    primaryColor: "#76298b",
    secondaryColor: "#ff7f00",
    textColor: "#ffffff",
    badgeBg: "#76298b",
    badgeFg: "#ffffff",
    logo: "timo",
  },
};

export const BANKS: Record<string, BankBrand> = Object.fromEntries(
  Object.entries(RAW_BANKS).map(([k, v]) => [k, { ...v, key: k }])
);

export const BRAND_CATALOG = BANKS;

const DEFAULT_THEMES: Record<AccountType, BankBrand> = {
  CASH: {
    key: "CASH",
    name: "Tiền mặt",
    shortLabel: "TIỀN",
    primaryColor: "#10b981",
    secondaryColor: "#059669",
    textColor: "#ffffff",
    badgeBg: "#10b981",
    badgeFg: "#ffffff",
  },
  BANK: {
    key: "BANK",
    name: "Ngân hàng",
    shortLabel: "BANK",
    primaryColor: "#2563eb",
    secondaryColor: "#1d4ed8",
    textColor: "#ffffff",
    badgeBg: "#2563eb",
    badgeFg: "#ffffff",
  },
  EWALLET: {
    key: "EWALLET",
    name: "Ví điện tử",
    shortLabel: "VÍ",
    primaryColor: "#ec4899",
    secondaryColor: "#db2777",
    textColor: "#ffffff",
    badgeBg: "#ec4899",
    badgeFg: "#ffffff",
  },
  CREDIT_CARD: {
    key: "CREDIT_CARD",
    name: "Thẻ tín dụng",
    shortLabel: "THẺ",
    primaryColor: "#6366f1",
    secondaryColor: "#4f46e5",
    textColor: "#ffffff",
    badgeBg: "#6366f1",
    badgeFg: "#ffffff",
    logo: "credit_card",
  },
};

export function getAccountBrand(name: string, accountType: AccountType = "BANK"): BankBrand {
  const norm = normalizeStr(name);

  if (BANKS[norm]) return BANKS[norm];

  // Specific keyword matching
  if (norm.includes("VIETCOM") || norm.includes("VCB")) return BANKS.VIETCOMBANK;
  if (norm.includes("BIDV")) return BANKS.BIDV;
  if (norm.includes("VIETIN") || norm.includes("CTG")) return BANKS.VIETINBANK;
  if (norm.includes("AGRI") || norm.includes("VARB")) return BANKS.AGRIBANK;
  if (norm.includes("TECHCOM") || norm.includes("TCB") || norm.includes("TECH")) return BANKS.TECH;
  if (norm.includes("MBBANK") || norm.includes("MB") || norm.includes("QUANDO")) return BANKS.MBBANK;
  if (norm.includes("VPBANK") || norm.includes("VPB")) return BANKS.VPB;
  if (norm.includes("ACB") || norm.includes("ACHAU")) return BANKS.ACB;
  if (norm.includes("SACOM") || norm.includes("STB")) return BANKS.SACOMBANK;
  if (norm.includes("TPBANK") || norm.includes("TPB") || norm.includes("TIENPHONG")) return BANKS.TPBANK;
  if (norm.includes("HDBANK") || norm.includes("HDB")) return BANKS.HDBANK;
  if (norm.includes("VIB") || norm.includes("QUOCTE")) return BANKS.VIB;
  if (norm.includes("SHB")) return BANKS.SHB;
  if (norm.includes("MSB") || norm.includes("MARITIME") || norm.includes("HANGHAI")) return BANKS.MSB;
  if (norm.includes("SEABANK") || norm.includes("SEAB")) return BANKS.SEABANK;
  if (norm.includes("OCB") || norm.includes("PHUONGDONG")) return BANKS.OCB;
  if (norm.includes("LPBANK") || norm.includes("LIENVIET") || norm.includes("LPB")) return BANKS.LPBANK;
  if (norm.includes("EXIM") || norm.includes("EIB")) return BANKS.EXIM;
  if (norm.includes("NAMA") || norm.includes("NAB")) return BANKS.NAMABANK;
  if (norm.includes("BACA") || norm.includes("BAB")) return BANKS.BACABANK;
  if (norm.includes("KIENLONG") || norm.includes("KLB")) return BANKS.KIENLONGBANK;
  if (norm.includes("BAOVIET") || norm.includes("BVBANK")) return BANKS.BAOVIETBANK;
  if (norm.includes("PVCOM") || norm.includes("PVC")) return BANKS.PVCOMBANK;
  if (norm.includes("SAIGONBANK") || norm.includes("SGB")) return BANKS.SAIGONBANK;
  if (norm.includes("ABBANK") || norm.includes("ANBINH") || norm.includes("ABB")) return BANKS.ABBANK;
  if (norm.includes("PGBANK") || norm.includes("PGB")) return BANKS.PGBANK;
  if (norm.includes("BANVIET") || norm.includes("BVB")) return BANKS.BVBANK;
  if (norm.includes("OCEAN") || norm.includes("OJB")) return BANKS.OCEANBANK;
  if (norm.includes("SCB")) return BANKS.SCB;
  if (norm.includes("TIMO")) return BANKS.TIMO;

  if (norm.includes("SHINHAN")) return BANKS.SHINHAN;
  if (norm.includes("HSBC")) return BANKS.HSBC;
  if (norm.includes("STANDARD") || norm.includes("SCB")) return BANKS.STANDARDCHARTERED;
  if (norm.includes("CITI")) return BANKS.CITIBANK;
  if (norm.includes("VRB") || norm.includes("VIETNGA")) return BANKS.VRB;

  if (norm.includes("MOMO")) return BANKS.MOMO;
  if (norm.includes("ZALO") || norm.includes("ZALOPAY")) return BANKS.ZALOPAY;
  if (norm.includes("VIETTEL") || norm.includes("VTM") || norm.includes("VTEL")) return BANKS.VIETTELMONEY;
  if (norm.includes("SHOPEE") || norm.includes("AIRPAY") || norm.includes("SPAY")) return BANKS.SHOPEEPAY;
  if (norm.includes("VNPAY") || norm.includes("VNPT")) return BANKS.VNPAY;
  if (norm.includes("CAKE")) return BANKS.CAKE;
  if (norm.includes("LIO")) return BANKS.LIOBANK;
  if (norm.includes("PAYOO")) return BANKS.PAYOO;
  if (norm.includes("GRAB") || norm.includes("MOCA")) return BANKS.GRABPAY;
  if (norm.includes("TRUE") || norm.includes("TRUEMONEY")) return BANKS.TRUEMONEY;
  if (norm.includes("TIKI")) return BANKS.TIKI;
  if (norm.includes("ONEPAY")) return BANKS.ONEPAY;
  if (norm.includes("NEXTPAY")) return BANKS.NEXTPAY;
  if (norm.includes("PAYPAL")) return BANKS.PAYPAL;

  return DEFAULT_THEMES[accountType] || DEFAULT_THEMES.BANK;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TK";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 3).map((p) => p[0].toUpperCase()).join("");
}

export function AccountLogo({
  name,
  accountType = "BANK",
  size = 32,
}: {
  name: string;
  accountType?: AccountType;
  size?: number;
}) {
  const brand = getAccountBrand(name, accountType);

  if (brand?.logo) {
    return (
      <span
        className="account-logo account-logo-image"
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          overflow: "hidden",
          background: "#ffffff",
          border: "none",
          padding: 0,
        }}
        title={name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/bank-logos/${brand.logo}.png`} alt={name} width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "50%" }} />
      </span>
    );
  }

  const text = brand.shortLabel || initials(name);
  const fontSize = text.length > 3 ? size * 0.32 : size * 0.40;

  return (
    <span
      className="account-logo"
      style={{
        width: size,
        height: size,
        background: brand.badgeBg,
        color: brand.badgeFg,
        fontSize,
        fontWeight: 750,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title={name}
    >
      {text}
    </span>
  );
}
