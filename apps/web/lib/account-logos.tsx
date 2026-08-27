"use client";
import React from "react";
import type { AccountType } from "./api";

export interface BrandTheme {
  key: string;
  name: string;
  shortLabel: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  gradient: string;
  cardBorder: string;
  cardBgTint: string;
  badgeBg: string;
  badgeFg: string;
  /** Path to pre-existing logo image if available */
  logoSrc?: string;
  /** SVG custom emblem symbol for high-fidelity vector rendering */
  svgType?: "momo" | "zalopay" | "viettel" | "vnpay" | "shopeepay" | "mb" | "hsbc" | "cimb" | "card" | "cash";
}

/**
 * Normalized name matcher for all Vietnamese banks and e-wallets.
 */
function normalizeStr(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Complete catalog of Brand Themes for Vietnamese Banking & Fintech institutions.
 */
const BRAND_CATALOG: Record<string, BrandTheme> = {
  // State-owned / Controlled Joint Stock
  VIETCOMBANK: {
    key: "vietcombank",
    name: "Vietcombank",
    shortLabel: "VCB",
    primaryColor: "#00713d",
    secondaryColor: "#73b92b",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00713d 0%, #0d9655 100%)",
    cardBorder: "#00713d",
    cardBgTint: "rgba(0, 113, 61, 0.04)",
    badgeBg: "#00713d",
    badgeFg: "#ffffff",
    logoSrc: "/banks/vietcombank.ico",
  },
  BIDV: {
    key: "bidv",
    name: "BIDV",
    shortLabel: "BIDV",
    primaryColor: "#006B68",
    secondaryColor: "#fdb913",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #006B68 0%, #004d4a 100%)",
    cardBorder: "#006B68",
    cardBgTint: "rgba(0, 107, 104, 0.04)",
    badgeBg: "#006B68",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/bidv.png",
  },
  VIETINBANK: {
    key: "vietinbank",
    name: "VietinBank",
    shortLabel: "CTG",
    primaryColor: "#00529c",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00529c 0%, #0071c5 100%)",
    cardBorder: "#00529c",
    cardBgTint: "rgba(0, 82, 156, 0.04)",
    badgeBg: "#00529c",
    badgeFg: "#ffffff",
    logoSrc: "/banks/vietinbank.ico",
  },
  AGRIBANK: {
    key: "agribank",
    name: "Agribank",
    shortLabel: "VBA",
    primaryColor: "#8b181b",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #8b181b 0%, #a82024 100%)",
    cardBorder: "#8b181b",
    cardBgTint: "rgba(139, 24, 27, 0.04)",
    badgeBg: "#8b181b",
    badgeFg: "#ffffff",
    logoSrc: "/banks/agribank.ico",
  },

  // Joint Stock Commercial Banks
  TECHCOMBANK: {
    key: "techcombank",
    name: "Techcombank",
    shortLabel: "TCB",
    primaryColor: "#e21f2b",
    secondaryColor: "#111111",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #e21f2b 0%, #b8141e 100%)",
    cardBorder: "#e21f2b",
    cardBgTint: "rgba(226, 31, 43, 0.04)",
    badgeBg: "#e21f2b",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/tech.png",
  },
  MBBANK: {
    key: "mb",
    name: "MB Bank",
    shortLabel: "MB",
    primaryColor: "#1c3f94",
    secondaryColor: "#00a0e9",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #1c3f94 0%, #0066cc 100%)",
    cardBorder: "#1c3f94",
    cardBgTint: "rgba(28, 63, 148, 0.04)",
    badgeBg: "#1c3f94",
    badgeFg: "#ffffff",
    svgType: "mb",
  },
  VPBANK: {
    key: "vpbank",
    name: "VPBank",
    shortLabel: "VPB",
    primaryColor: "#00B74F",
    secondaryColor: "#f26522",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00B74F 0%, #008742 100%)",
    cardBorder: "#00B74F",
    cardBgTint: "rgba(0, 183, 79, 0.04)",
    badgeBg: "#00B74F",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/vpb.png",
  },
  ACB: {
    key: "acb",
    name: "ACB",
    shortLabel: "ACB",
    primaryColor: "#0066b3",
    secondaryColor: "#0091ff",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0066b3 0%, #008ae6 100%)",
    cardBorder: "#0066b3",
    cardBgTint: "rgba(0, 102, 179, 0.04)",
    badgeBg: "#0066b3",
    badgeFg: "#ffffff",
    logoSrc: "/banks/acb.webp",
  },
  TPBANK: {
    key: "tpbank",
    name: "TPBank",
    shortLabel: "TPB",
    primaryColor: "#782f91",
    secondaryColor: "#ea5a24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #782f91 0%, #9b3abf 100%)",
    cardBorder: "#782f91",
    cardBgTint: "rgba(120, 47, 145, 0.04)",
    badgeBg: "#782f91",
    badgeFg: "#ffffff",
    logoSrc: "/banks/tpbank.ico",
  },
  VIB: {
    key: "vib",
    name: "VIB",
    shortLabel: "VIB",
    primaryColor: "#0b3a82",
    secondaryColor: "#f7941d",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0b3a82 0%, #005bb5 100%)",
    cardBorder: "#0b3a82",
    cardBgTint: "rgba(11, 58, 130, 0.04)",
    badgeBg: "#0b3a82",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/vib.png",
  },
  SHB: {
    key: "shb",
    name: "SHB",
    shortLabel: "SHB",
    primaryColor: "#f58220",
    secondaryColor: "#7a1f2b",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #f58220 0%, #e06000 100%)",
    cardBorder: "#f58220",
    cardBgTint: "rgba(245, 130, 32, 0.04)",
    badgeBg: "#f58220",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/shb.png",
  },
  SACOMBANK: {
    key: "sacombank",
    name: "Sacombank",
    shortLabel: "STB",
    primaryColor: "#00539b",
    secondaryColor: "#f37023",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00539b 0%, #0073cc 100%)",
    cardBorder: "#00539b",
    cardBgTint: "rgba(0, 83, 155, 0.04)",
    badgeBg: "#00539b",
    badgeFg: "#ffffff",
    logoSrc: "/banks/sacombank.png",
  },
  HDBANK: {
    key: "hdbank",
    name: "HDBank",
    shortLabel: "HDB",
    primaryColor: "#e31e24",
    secondaryColor: "#ffcc00",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #e31e24 0%, #f39c12 100%)",
    cardBorder: "#e31e24",
    cardBgTint: "rgba(227, 30, 36, 0.04)",
    badgeBg: "#e31e24",
    badgeFg: "#ffffff",
    logoSrc: "/banks/hdbank.ico",
  },
  MSB: {
    key: "msb",
    name: "MSB",
    shortLabel: "MSB",
    primaryColor: "#f26522",
    secondaryColor: "#e51b24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #f26522 0%, #e51b24 100%)",
    cardBorder: "#f26522",
    cardBgTint: "rgba(242, 101, 34, 0.04)",
    badgeBg: "#f26522",
    badgeFg: "#ffffff",
    logoSrc: "/banks/msb.png",
  },
  OCB: {
    key: "ocb",
    name: "OCB",
    shortLabel: "OCB",
    primaryColor: "#00904b",
    secondaryColor: "#fdb913",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00904b 0%, #fdb913 100%)",
    cardBorder: "#00904b",
    cardBgTint: "rgba(0, 144, 75, 0.04)",
    badgeBg: "#00904b",
    badgeFg: "#ffffff",
    logoSrc: "/banks/ocb.png",
  },
  EXIMBANK: {
    key: "eximbank",
    name: "Eximbank",
    shortLabel: "EIB",
    primaryColor: "#00558c",
    secondaryColor: "#f5a623",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00558c 0%, #f5a623 100%)",
    cardBorder: "#00558c",
    cardBgTint: "rgba(0, 85, 140, 0.04)",
    badgeBg: "#f5a623",
    badgeFg: "#1a1a1a",
    logoSrc: "/bank-logos/exim.png",
  },
  PVCOMBANK: {
    key: "pvcombank",
    name: "PVcomBank",
    shortLabel: "PVCB",
    primaryColor: "#FFCC00",
    secondaryColor: "#00558c",
    textColor: "#1a1a1a",
    gradient: "linear-gradient(135deg, #FFCC00 0%, #e6b800 100%)",
    cardBorder: "#FFCC00",
    cardBgTint: "rgba(255, 204, 0, 0.05)",
    badgeBg: "#FFCC00",
    badgeFg: "#1a1a1a",
    logoSrc: "/bank-logos/pvcombank.png",
  },
  SEABANK: {
    key: "seabank",
    name: "SeABank",
    shortLabel: "SEA",
    primaryColor: "#dc241f",
    secondaryColor: "#111111",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #dc241f 0%, #991b1b 100%)",
    cardBorder: "#dc241f",
    cardBgTint: "rgba(220, 36, 31, 0.04)",
    badgeBg: "#dc241f",
    badgeFg: "#ffffff",
    logoSrc: "/banks/seabank.ico",
  },
  LPBANK: {
    key: "lpbank",
    name: "LPBank",
    shortLabel: "LPB",
    primaryColor: "#f37021",
    secondaryColor: "#004b87",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #f37021 0%, #004b87 100%)",
    cardBorder: "#f37021",
    cardBgTint: "rgba(243, 112, 33, 0.04)",
    badgeBg: "#f37021",
    badgeFg: "#ffffff",
    logoSrc: "/banks/lpbank.ico",
  },
  NAMABANK: {
    key: "namabank",
    name: "Nam A Bank",
    shortLabel: "NAB",
    primaryColor: "#f4a900",
    secondaryColor: "#de1d26",
    textColor: "#1a1a1a",
    gradient: "linear-gradient(135deg, #f4a900 0%, #de1d26 100%)",
    cardBorder: "#f4a900",
    cardBgTint: "rgba(244, 169, 0, 0.04)",
    badgeBg: "#f4a900",
    badgeFg: "#1a1a1a",
    logoSrc: "/banks/namabank.png",
  },
  SCB: {
    key: "scb",
    name: "SCB",
    shortLabel: "SCB",
    primaryColor: "#004b8d",
    secondaryColor: "#f39c12",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #004b8d 0%, #006ec4 100%)",
    cardBorder: "#004b8d",
    cardBgTint: "rgba(0, 75, 141, 0.04)",
    badgeBg: "#004b8d",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/scb.png",
  },
  BACABANK: {
    key: "bacabank",
    name: "Bac A Bank",
    shortLabel: "BAB",
    primaryColor: "#c69214",
    secondaryColor: "#1a1a1a",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #c69214 0%, #e0aa2b 100%)",
    cardBorder: "#c69214",
    cardBgTint: "rgba(198, 146, 20, 0.04)",
    badgeBg: "#c69214",
    badgeFg: "#ffffff",
  },
  BVBANK: {
    key: "bvbank",
    name: "BVBank (Bản Việt)",
    shortLabel: "BVB",
    primaryColor: "#e31e24",
    secondaryColor: "#00558c",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #e31e24 0%, #00558c 100%)",
    cardBorder: "#e31e24",
    cardBgTint: "rgba(227, 30, 36, 0.04)",
    badgeBg: "#e31e24",
    badgeFg: "#ffffff",
  },
  BAOVIETBANK: {
    key: "baovietbank",
    name: "BAOVIET Bank",
    shortLabel: "BVB",
    primaryColor: "#0054a6",
    secondaryColor: "#fdb913",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0054a6 0%, #0077e6 100%)",
    cardBorder: "#0054a6",
    cardBgTint: "rgba(0, 84, 166, 0.04)",
    badgeBg: "#0054a6",
    badgeFg: "#ffffff",
  },
  ABBANK: {
    key: "abbank",
    name: "ABBANK",
    shortLabel: "ABB",
    primaryColor: "#0082c8",
    secondaryColor: "#00a2ea",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0082c8 0%, #00a2ea 100%)",
    cardBorder: "#0082c8",
    cardBgTint: "rgba(0, 130, 200, 0.04)",
    badgeBg: "#0082c8",
    badgeFg: "#ffffff",
  },
  KIENLONGBANK: {
    key: "kienlongbank",
    name: "Kienlongbank",
    shortLabel: "KLB",
    primaryColor: "#da251d",
    secondaryColor: "#00843d",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #da251d 0%, #00843d 100%)",
    cardBorder: "#da251d",
    cardBgTint: "rgba(218, 37, 29, 0.04)",
    badgeBg: "#da251d",
    badgeFg: "#ffffff",
  },
  SAIGONBANK: {
    key: "saigonbank",
    name: "Saigonbank",
    shortLabel: "SGB",
    primaryColor: "#0054a6",
    secondaryColor: "#e31e24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0054a6 0%, #003875 100%)",
    cardBorder: "#0054a6",
    cardBgTint: "rgba(0, 84, 166, 0.04)",
    badgeBg: "#0054a6",
    badgeFg: "#ffffff",
  },
  PGBANK: {
    key: "pgbank",
    name: "PGBank",
    shortLabel: "PGB",
    primaryColor: "#00558c",
    secondaryColor: "#fbb03b",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00558c 0%, #fbb03b 100%)",
    cardBorder: "#00558c",
    cardBgTint: "rgba(0, 85, 140, 0.04)",
    badgeBg: "#00558c",
    badgeFg: "#ffffff",
  },
  VIETABANK: {
    key: "vietabank",
    name: "VietABank",
    shortLabel: "VAB",
    primaryColor: "#e31e24",
    secondaryColor: "#fab005",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #e31e24 0%, #b8141e 100%)",
    cardBorder: "#e31e24",
    cardBgTint: "rgba(227, 30, 36, 0.04)",
    badgeBg: "#e31e24",
    badgeFg: "#ffffff",
  },
  VIETBANK: {
    key: "vietbank",
    name: "Vietbank",
    shortLabel: "VB",
    primaryColor: "#00558c",
    secondaryColor: "#e31e24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00558c 0%, #0077c8 100%)",
    cardBorder: "#00558c",
    cardBgTint: "rgba(0, 85, 140, 0.04)",
    badgeBg: "#00558c",
    badgeFg: "#ffffff",
  },
  NCB: {
    key: "ncb",
    name: "NCB",
    shortLabel: "NCB",
    primaryColor: "#005baa",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #005baa 0%, #0088cc 100%)",
    cardBorder: "#005baa",
    cardBgTint: "rgba(0, 91, 170, 0.04)",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
  },

  // Foreign Banks in Vietnam
  SHINHAN: {
    key: "shinhan",
    name: "Shinhan Bank",
    shortLabel: "SHN",
    primaryColor: "#0046d5",
    secondaryColor: "#ffc400",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0046d5 0%, #0066ff 100%)",
    cardBorder: "#0046d5",
    cardBgTint: "rgba(0, 70, 213, 0.04)",
    badgeBg: "#0046d5",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/shinhan.png",
  },
  HSBC: {
    key: "hsbc",
    name: "HSBC Việt Nam",
    shortLabel: "HSBC",
    primaryColor: "#db0011",
    secondaryColor: "#111111",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #db0011 0%, #990000 100%)",
    cardBorder: "#db0011",
    cardBgTint: "rgba(219, 0, 17, 0.04)",
    badgeBg: "#db0011",
    badgeFg: "#ffffff",
    svgType: "hsbc",
  },
  STANDARDCHARTERED: {
    key: "scbvl",
    name: "Standard Chartered",
    shortLabel: "SCB",
    primaryColor: "#0082ca",
    secondaryColor: "#5cb85c",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0082ca 0%, #5cb85c 100%)",
    cardBorder: "#0082ca",
    cardBgTint: "rgba(0, 130, 202, 0.04)",
    badgeBg: "#0082ca",
    badgeFg: "#ffffff",
  },
  UOB: {
    key: "uob",
    name: "UOB Việt Nam",
    shortLabel: "UOB",
    primaryColor: "#002a54",
    secondaryColor: "#d9272e",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #002a54 0%, #d9272e 100%)",
    cardBorder: "#002a54",
    cardBgTint: "rgba(0, 42, 84, 0.04)",
    badgeBg: "#002a54",
    badgeFg: "#ffffff",
  },
  CIMB: {
    key: "cimb",
    name: "CIMB Việt Nam",
    shortLabel: "CIMB",
    primaryColor: "#8b1e23",
    secondaryColor: "#da291c",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #8b1e23 0%, #c41230 100%)",
    cardBorder: "#8b1e23",
    cardBgTint: "rgba(139, 30, 35, 0.04)",
    badgeBg: "#8b1e23",
    badgeFg: "#ffffff",
    svgType: "cimb",
  },
  WOORI: {
    key: "woori",
    name: "Woori Bank",
    shortLabel: "WRB",
    primaryColor: "#0067b1",
    secondaryColor: "#00a4e4",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0067b1 0%, #00a4e4 100%)",
    cardBorder: "#0067b1",
    cardBgTint: "rgba(0, 103, 177, 0.04)",
    badgeBg: "#0067b1",
    badgeFg: "#ffffff",
  },
  PUBLICBANK: {
    key: "pbvn",
    name: "Public Bank",
    shortLabel: "PBVN",
    primaryColor: "#da291c",
    secondaryColor: "#005ba6",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #da291c 0%, #005ba6 100%)",
    cardBorder: "#da291c",
    cardBgTint: "rgba(218, 41, 28, 0.04)",
    badgeBg: "#da291c",
    badgeFg: "#ffffff",
  },
  HONGLEONG: {
    key: "hlbvn",
    name: "Hong Leong Bank",
    shortLabel: "HLB",
    primaryColor: "#0c2340",
    secondaryColor: "#da291c",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0c2340 0%, #da291c 100%)",
    cardBorder: "#0c2340",
    cardBgTint: "rgba(12, 35, 64, 0.04)",
    badgeBg: "#0c2340",
    badgeFg: "#ffffff",
  },
  ANZ: {
    key: "anzvl",
    name: "ANZ Việt Nam",
    shortLabel: "ANZ",
    primaryColor: "#004165",
    secondaryColor: "#0072ac",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #004165 0%, #0072ac 100%)",
    cardBorder: "#004165",
    cardBgTint: "rgba(0, 65, 101, 0.04)",
    badgeBg: "#004165",
    badgeFg: "#ffffff",
  },

  // Joint Venture & Policy Banks
  INDOVINA: {
    key: "ivb",
    name: "Indovina Bank",
    shortLabel: "IVB",
    primaryColor: "#005baa",
    secondaryColor: "#ffb81c",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #005baa 0%, #ffb81c 100%)",
    cardBorder: "#005baa",
    cardBgTint: "rgba(0, 91, 170, 0.04)",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
  },
  VRB: {
    key: "vrb",
    name: "VRB (Việt - Nga)",
    shortLabel: "VRB",
    primaryColor: "#1c3f94",
    secondaryColor: "#e31e24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #1c3f94 0%, #e31e24 100%)",
    cardBorder: "#1c3f94",
    cardBgTint: "rgba(28, 63, 148, 0.04)",
    badgeBg: "#1c3f94",
    badgeFg: "#ffffff",
  },
  VBSP: {
    key: "vbsp",
    name: "VBSP (Chính sách XH)",
    shortLabel: "VBSP",
    primaryColor: "#00843d",
    secondaryColor: "#f4a900",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00843d 0%, #00a84f 100%)",
    cardBorder: "#00843d",
    cardBgTint: "rgba(0, 132, 61, 0.04)",
    badgeBg: "#00843d",
    badgeFg: "#ffffff",
  },
  VDB: {
    key: "vdb",
    name: "VDB (Phát triển VN)",
    shortLabel: "VDB",
    primaryColor: "#003366",
    secondaryColor: "#ffcc00",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #003366 0%, #0055aa 100%)",
    cardBorder: "#003366",
    cardBgTint: "rgba(0, 51, 102, 0.04)",
    badgeBg: "#003366",
    badgeFg: "#ffffff",
  },
  COOPBANK: {
    key: "coopbank",
    name: "Co-opBank",
    shortLabel: "COOP",
    primaryColor: "#009639",
    secondaryColor: "#ffcc00",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #009639 0%, #ffcc00 100%)",
    cardBorder: "#009639",
    cardBgTint: "rgba(0, 150, 57, 0.04)",
    badgeBg: "#009639",
    badgeFg: "#ffffff",
  },
  GPBANK: {
    key: "gpbank",
    name: "GPBank",
    shortLabel: "GPB",
    primaryColor: "#e31e24",
    secondaryColor: "#00558c",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #e31e24 0%, #00558c 100%)",
    cardBorder: "#e31e24",
    cardBgTint: "rgba(227, 30, 36, 0.04)",
    badgeBg: "#e31e24",
    badgeFg: "#ffffff",
  },
  VCBNEO: {
    key: "vcbneo",
    name: "VCBNeo",
    shortLabel: "NEO",
    primaryColor: "#00713d",
    secondaryColor: "#73b92b",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00713d 0%, #73b92b 100%)",
    cardBorder: "#00713d",
    cardBgTint: "rgba(0, 113, 61, 0.04)",
    badgeBg: "#00713d",
    badgeFg: "#ffffff",
  },
  VIKKIBANK: {
    key: "vikkibank",
    name: "Vikki Bank",
    shortLabel: "VIK",
    primaryColor: "#7b2cbf",
    secondaryColor: "#ff007f",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #7b2cbf 0%, #ff007f 100%)",
    cardBorder: "#7b2cbf",
    cardBgTint: "rgba(123, 44, 191, 0.04)",
    badgeBg: "#7b2cbf",
    badgeFg: "#ffffff",
  },
  MBV: {
    key: "mbv",
    name: "MBV",
    shortLabel: "MBV",
    primaryColor: "#0066b3",
    secondaryColor: "#0099ff",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0066b3 0%, #0099ff 100%)",
    cardBorder: "#0066b3",
    cardBgTint: "rgba(0, 102, 179, 0.04)",
    badgeBg: "#0066b3",
    badgeFg: "#ffffff",
  },

  // E-Wallets
  MOMO: {
    key: "momo",
    name: "MoMo",
    shortLabel: "MoMo",
    primaryColor: "#a50064",
    secondaryColor: "#d82d8b",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #a50064 0%, #d82d8b 100%)",
    cardBorder: "#a50064",
    cardBgTint: "rgba(165, 0, 100, 0.04)",
    badgeBg: "#a50064",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/momo.png",
    svgType: "momo",
  },
  ZALOPAY: {
    key: "zalopay",
    name: "ZaloPay",
    shortLabel: "Zalo",
    primaryColor: "#0068ff",
    secondaryColor: "#00b14f",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0068ff 0%, #00b14f 100%)",
    cardBorder: "#0068ff",
    cardBgTint: "rgba(0, 104, 255, 0.04)",
    badgeBg: "#0068ff",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/zalopay.png",
    svgType: "zalopay",
  },
  VIETTELMONEY: {
    key: "viettelmoney",
    name: "Viettel Money",
    shortLabel: "VTM",
    primaryColor: "#ee0033",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #ee0033 0%, #f37021 100%)",
    cardBorder: "#ee0033",
    cardBgTint: "rgba(238, 0, 51, 0.04)",
    badgeBg: "#ee0033",
    badgeFg: "#ffffff",
    svgType: "viettel",
  },
  VNPAY: {
    key: "vnpay",
    name: "VNPay",
    shortLabel: "VNP",
    primaryColor: "#005baa",
    secondaryColor: "#ed1c24",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #005baa 0%, #ed1c24 100%)",
    cardBorder: "#005baa",
    cardBgTint: "rgba(0, 91, 170, 0.04)",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
    svgType: "vnpay",
  },
  SHOPEEPAY: {
    key: "shopeepay",
    name: "ShopeePay",
    shortLabel: "SPP",
    primaryColor: "#ee4d2d",
    secondaryColor: "#ff7337",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #ee4d2d 0%, #ff7337 100%)",
    cardBorder: "#ee4d2d",
    cardBgTint: "rgba(238, 77, 45, 0.04)",
    badgeBg: "#ee4d2d",
    badgeFg: "#ffffff",
    svgType: "shopeepay",
  },
  MOCA: {
    key: "moca",
    name: "Moca (GrabPay)",
    shortLabel: "Moca",
    primaryColor: "#00b14f",
    secondaryColor: "#28c76f",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00b14f 0%, #28c76f 100%)",
    cardBorder: "#00b14f",
    cardBgTint: "rgba(0, 177, 79, 0.04)",
    badgeBg: "#00b14f",
    badgeFg: "#ffffff",
  },
  PAYOO: {
    key: "payoo",
    name: "Payoo",
    shortLabel: "Payoo",
    primaryColor: "#0083ca",
    secondaryColor: "#fdb813",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #0083ca 0%, #fdb813 100%)",
    cardBorder: "#0083ca",
    cardBgTint: "rgba(0, 131, 202, 0.04)",
    badgeBg: "#0083ca",
    badgeFg: "#ffffff",
  },
  "9PAY": {
    key: "9pay",
    name: "9Pay",
    shortLabel: "9Pay",
    primaryColor: "#00a651",
    secondaryColor: "#20c997",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #00a651 0%, #20c997 100%)",
    cardBorder: "#00a651",
    cardBgTint: "rgba(0, 166, 81, 0.04)",
    badgeBg: "#00a651",
    badgeFg: "#ffffff",
  },
  FOXPAY: {
    key: "foxpay",
    name: "Foxpay",
    shortLabel: "Fox",
    primaryColor: "#f26522",
    secondaryColor: "#ff8c00",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #f26522 0%, #ff8c00 100%)",
    cardBorder: "#f26522",
    cardBgTint: "rgba(242, 101, 34, 0.04)",
    badgeBg: "#f26522",
    badgeFg: "#ffffff",
  },
  APPOTA: {
    key: "appotapay",
    name: "AppotaPay",
    shortLabel: "APP",
    primaryColor: "#36b37e",
    secondaryColor: "#00b894",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #36b37e 0%, #00b894 100%)",
    cardBorder: "#36b37e",
    cardBgTint: "rgba(54, 179, 126, 0.04)",
    badgeBg: "#36b37e",
    badgeFg: "#ffffff",
  },
  VNPT: {
    key: "vnptmoney",
    name: "VNPT Money",
    shortLabel: "VNPT",
    primaryColor: "#005baa",
    secondaryColor: "#0088cc",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #005baa 0%, #0088cc 100%)",
    cardBorder: "#005baa",
    cardBgTint: "rgba(0, 91, 170, 0.04)",
    badgeBg: "#005baa",
    badgeFg: "#ffffff",
    logoSrc: "/bank-logos/vnptmoney.png",
  },
};

/** Default Fallbacks by Account Type */
const TYPE_DEFAULT_THEMES: Record<AccountType, BrandTheme> = {
  CASH: {
    key: "cash",
    name: "Tiền mặt",
    shortLabel: "CASH",
    primaryColor: "#059669",
    secondaryColor: "#10b981",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
    cardBorder: "#059669",
    cardBgTint: "rgba(5, 150, 105, 0.04)",
    badgeBg: "#059669",
    badgeFg: "#ffffff",
    svgType: "cash",
  },
  BANK: {
    key: "bank",
    name: "Tài khoản ngân hàng",
    shortLabel: "BANK",
    primaryColor: "#2563eb",
    secondaryColor: "#3b82f6",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
    cardBorder: "#2563eb",
    cardBgTint: "rgba(37, 99, 235, 0.04)",
    badgeBg: "#2563eb",
    badgeFg: "#ffffff",
  },
  CREDIT_CARD: {
    key: "credit_card",
    name: "Thẻ tín dụng",
    shortLabel: "CARD",
    primaryColor: "#4f46e5",
    secondaryColor: "#7c3aed",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)",
    cardBorder: "#4f46e5",
    cardBgTint: "rgba(79, 70, 229, 0.04)",
    badgeBg: "#4f46e5",
    badgeFg: "#ffffff",
    svgType: "card",
  },
  EWALLET: {
    key: "ewallet",
    name: "Ví điện tử",
    shortLabel: "WALLET",
    primaryColor: "#9333ea",
    secondaryColor: "#c084fc",
    textColor: "#ffffff",
    gradient: "linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)",
    cardBorder: "#9333ea",
    cardBgTint: "rgba(147, 51, 234, 0.04)",
    badgeBg: "#9333ea",
    badgeFg: "#ffffff",
  },
};

/**
 * Match account name to institution brand theme.
 */
export function getAccountBrand(name: string, accountType: AccountType): BrandTheme {
  const norm = normalizeStr(name);
  if (!norm) return TYPE_DEFAULT_THEMES[accountType];

  // Specific priority mappings
  if (norm.includes("VIETCOMBANK") || norm.includes("VCB") || norm.startsWith("VIETCOM")) return BRAND_CATALOG.VIETCOMBANK;
  if (norm.includes("VIETINBANK") || norm.includes("VIETIN") || norm.includes("CTG")) return BRAND_CATALOG.VIETINBANK;
  if (norm.includes("TECHCOMBANK") || norm.includes("TECHCOM") || norm.startsWith("TCB") || norm.includes("TECH")) return BRAND_CATALOG.TECHCOMBANK;
  if (norm.includes("AGRIBANK") || norm.includes("VBARD") || norm.includes("NONGNGHIEP")) return BRAND_CATALOG.AGRIBANK;
  if (norm.includes("BIDV")) return BRAND_CATALOG.BIDV;
  if (norm.includes("MBBANK") || norm.includes("QUANDOIT") || norm.startsWith("MB") || norm.endsWith("MB") || norm === "MB") return BRAND_CATALOG.MBBANK;
  if (norm.includes("SACOMBANK") || norm.startsWith("STB") || norm.includes("SACOM")) return BRAND_CATALOG.SACOMBANK;
  if (norm.includes("TPBANK") || norm.includes("TIENPHONG") || norm.startsWith("TPB")) return BRAND_CATALOG.TPBANK;
  if (norm.includes("VPBANK") || norm.includes("VPB")) return BRAND_CATALOG.VPBANK;
  if (norm.includes("ACB") || norm.includes("ACHAU")) return BRAND_CATALOG.ACB;
  if (norm.includes("EXIMBANK") || norm.includes("EXIM") || norm.startsWith("EIB")) return BRAND_CATALOG.EXIMBANK;
  if (norm.includes("HDBANK") || norm.startsWith("HDB")) return BRAND_CATALOG.HDBANK;
  if (norm.includes("VIB")) return BRAND_CATALOG.VIB;
  if (norm.includes("SHB")) return BRAND_CATALOG.SHB;
  if (norm.includes("MSB") || norm.includes("HANGHAI") || norm.includes("MARITIME")) return BRAND_CATALOG.MSB;
  if (norm.includes("SEABANK") || norm.includes("DONGABANK")) return BRAND_CATALOG.SEABANK;
  if (norm.includes("OCB") || norm.includes("PHUONGDONG")) return BRAND_CATALOG.OCB;
  if (norm.includes("PVCOMBANK") || norm.includes("PVCB")) return BRAND_CATALOG.PVCOMBANK;
  if (norm.includes("BACABANK") || norm.includes("BACA")) return BRAND_CATALOG.BACABANK;
  if (norm.includes("NAMABANK") || norm.includes("NAMA")) return BRAND_CATALOG.NAMABANK;
  if (norm.includes("KIENLONGBANK") || norm.includes("KIENLONG")) return BRAND_CATALOG.KIENLONGBANK;
  if (norm.includes("ABBANK") || norm.includes("ANBINH")) return BRAND_CATALOG.ABBANK;
  if (norm.includes("BVBANK") || norm.includes("BANVIET")) return BRAND_CATALOG.BVBANK;
  if (norm.includes("BAOVIETBANK") || norm.includes("BAOVIET")) return BRAND_CATALOG.BAOVIETBANK;
  if (norm.includes("SCB") && !norm.includes("STANDARD")) return BRAND_CATALOG.SCB;
  if (norm.includes("SAIGONBANK")) return BRAND_CATALOG.SAIGONBANK;
  if (norm.includes("PGBANK")) return BRAND_CATALOG.PGBANK;
  if (norm.includes("VIETABANK") || norm.includes("VIETA")) return BRAND_CATALOG.VIETABANK;
  if (norm.includes("VIETBANK")) return BRAND_CATALOG.VIETBANK;
  if (norm.includes("NCB") || norm.includes("NAMDO")) return BRAND_CATALOG.NCB;
  if (norm.includes("LPBANK") || norm.includes("LIENVIET") || norm.includes("LPB")) return BRAND_CATALOG.LPBANK;
  if (norm.includes("SHINHAN")) return BRAND_CATALOG.SHINHAN;
  if (norm.includes("STANDARDCHARTERED") || norm.includes("SCBVL")) return BRAND_CATALOG.STANDARDCHARTERED;
  if (norm.includes("HSBC")) return BRAND_CATALOG.HSBC;
  if (norm.includes("ANZ")) return BRAND_CATALOG.ANZ;
  if (norm.includes("CIMB")) return BRAND_CATALOG.CIMB;
  if (norm.includes("HONGLEONG") || norm.includes("HLBVN")) return BRAND_CATALOG.HONGLEONG;
  if (norm.includes("PUBLICBANK") || norm.includes("PBVN")) return BRAND_CATALOG.PUBLICBANK;
  if (norm.includes("UOB")) return BRAND_CATALOG.UOB;
  if (norm.includes("WOORI")) return BRAND_CATALOG.WOORI;
  if (norm.includes("INDOVINA") || norm.includes("IVB")) return BRAND_CATALOG.INDOVINA;
  if (norm.includes("VRB")) return BRAND_CATALOG.VRB;
  if (norm.includes("VBSP") || norm.includes("CHINHSACH")) return BRAND_CATALOG.VBSP;
  if (norm.includes("VDB") || norm.includes("PHATTRIEN")) return BRAND_CATALOG.VDB;
  if (norm.includes("COOPBANK") || norm.includes("HOPTACXA")) return BRAND_CATALOG.COOPBANK;
  if (norm.includes("GPBANK")) return BRAND_CATALOG.GPBANK;
  if (norm.includes("VCBNEO")) return BRAND_CATALOG.VCBNEO;
  if (norm.includes("VIKKI")) return BRAND_CATALOG.VIKKIBANK;
  if (norm.includes("MBV")) return BRAND_CATALOG.MBV;

  // E-wallets
  if (norm.includes("MOMO")) return BRAND_CATALOG.MOMO;
  if (norm.includes("ZALOPAY") || norm.includes("ZALO")) return BRAND_CATALOG.ZALOPAY;
  if (norm.includes("VIETTELMONEY") || norm.includes("VIETTELPAY") || norm.includes("VIETTEL")) return BRAND_CATALOG.VIETTELMONEY;
  if (norm.includes("VNPAY")) return BRAND_CATALOG.VNPAY;
  if (norm.includes("SHOPEEPAY") || norm.includes("SHOPEE") || norm.includes("AIRPAY")) return BRAND_CATALOG.SHOPEEPAY;
  if (norm.includes("MOCA") || norm.includes("GRABPAY") || norm.includes("GRAB")) return BRAND_CATALOG.MOCA;
  if (norm.includes("PAYOO")) return BRAND_CATALOG.PAYOO;
  if (norm.includes("9PAY")) return BRAND_CATALOG["9PAY"];
  if (norm.includes("FOXPAY")) return BRAND_CATALOG.FOXPAY;
  if (norm.includes("APPOTAPAY") || norm.includes("APPOTA")) return BRAND_CATALOG.APPOTA;
  if (norm.includes("VNPTMONEY") || norm.includes("VNPTPAY") || norm.includes("VNPT")) return BRAND_CATALOG.VNPT;

  // Fallback by account type
  return TYPE_DEFAULT_THEMES[accountType];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Vector SVG Emblems for special institutions without PNGs */
function BrandVectorIcon({ type, size }: { type?: string; size: number }) {
  if (type === "techcombank") {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <rect width="100" height="100" rx="16" fill="#eb1d25" />
        <polygon points="14,50 38,26 62,50 38,74" fill="#ffffff" />
        <polygon points="86,50 62,26 38,50 62,74" fill="#ffffff" />
        <polygon points="50,38 62,50 50,62 38,50" fill="#eb1d25" />
      </svg>
    );
  }
  if (type === "momo") {
    return (
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#a50064" />
        <path d="M7 15V9h2.2l1.8 3.5L12.8 9H15v6h-1.8v-3.8L11.5 14h-.9L8.8 11.2V15H7z" fill="#fff" />
      </svg>
    );
  }
  if (type === "zalopay") {
    return (
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#0068ff" />
        <path d="M6 7h12l-7.5 9.5H18V18H6l7.5-9.5H6V7z" fill="#fff" />
      </svg>
    );
  }
  if (type === "viettel") {
    return (
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#ee0033" />
        <path d="M6 8l4 8h2l4-8h-2.5l-2.5 5.5L8.5 8H6z" fill="#fff" />
      </svg>
    );
  }
  if (type === "vnpay") {
    return (
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#005baa" />
        <path d="M6 8l3.5 7.5h2L15 8h-2.2l-2 4.8L8.8 8H6z" fill="#fff" />
        <circle cx="17.5" cy="8.5" r="2" fill="#ed1c24" />
      </svg>
    );
  }
  if (type === "shopeepay") {
    return (
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#ee4d2d" />
        <path d="M8 8.5C8 7.12 9.12 6 10.5 6h3C14.88 6 16 7.12 16 8.5V9h2v10H6V9h2v-.5zm2 0V9h4v-.5C14 7.67 13.33 7 12.5 7h-1C10.67 7 10 7.67 10 8.5z" fill="#fff" opacity="0.9" />
        <path d="M12 11.5c-1.38 0-2.5.9-2.5 2 0 1.5 2.5 1.5 2.5 2.5 0 .28-.45.5-1 .5-.69 0-1.25-.2-1.5-.4v1.15c.34.15.89.25 1.5.25 1.38 0 2.5-.9 2.5-2 0-1.5-2.5-1.5-2.5-2.5 0-.28.45-.5 1-.5.6 0 1.12.18 1.4.35v-1.1c-.35-.15-.85-.25-1.4-.25z" fill="#ee4d2d" />
      </svg>
    );
  }
  if (type === "mb") {
    return (
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#1c3f94" />
        <path d="M5 16V8h2.5l2.2 4.2L11.9 8H14.4v8H12.5v-4.5L10.3 16h-1.3L6.8 11.5V16H5zM15.5 8h2.8c1.3 0 2.2.8 2.2 1.8 0 .8-.5 1.4-1.2 1.6 1 .3 1.5 1 1.5 2 0 1.2-1 2.6-2.6 2.6h-2.7V8zm2.4 3c.4 0 .7-.3.7-.7s-.3-.7-.7-.7h-.8v1.4h.8zm.2 3.4c.5 0 .8-.3.8-.8 0-.5-.3-.8-.8-.8h-1v1.6h1z" fill="#fff" />
      </svg>
    );
  }
  if (type === "hsbc") {
    return (
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#fff" stroke="#db0011" strokeWidth="1" />
        <polygon points="6,12 10,7 10,17" fill="#db0011" />
        <polygon points="18,12 14,7 14,17" fill="#db0011" />
        <polygon points="10,7 14,7 12,10" fill="#db0011" />
        <polygon points="10,17 14,17 12,14" fill="#db0011" />
      </svg>
    );
  }
  if (type === "card") {
    return (
      <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor" fillOpacity="0.2" />
        <line x1="2" y1="10" x2="22" y2="10" stroke="#fff" strokeWidth="2" />
      </svg>
    );
  }
  if (type === "cash") {
    return (
      <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 12h.01M18 12h.01" />
      </svg>
    );
  }
  return null;
}

export function AccountLogo({
  name,
  accountType,
  size = 32,
}: {
  name: string;
  accountType: AccountType;
  size?: number;
}) {
  const brand = getAccountBrand(name, accountType);

  if (brand.logoSrc) {
    return (
      <span
        className="account-logo account-logo-image"
        style={{
          width: size,
          height: size,
          borderColor: brand.cardBorder ? `${brand.cardBorder}40` : "var(--line)",
          background: "#ffffff",
        }}
        title={name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoSrc} alt={name} width={size} height={size} />
      </span>
    );
  }

  if (brand.svgType) {
    return (
      <span
        className="account-logo"
        style={{
          width: size,
          height: size,
          background: brand.badgeBg,
          color: brand.badgeFg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title={name}
      >
        <BrandVectorIcon type={brand.svgType} size={size} />
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
        boxShadow: `0 2px 6px ${brand.primaryColor}33`,
      }}
      title={name}
    >
      {text}
    </span>
  );
}

