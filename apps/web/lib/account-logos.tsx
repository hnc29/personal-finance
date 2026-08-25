"use client";
import React from "react";
import type { AccountType } from "./api";

/**
 * TASK-035/TASK-037: a small recognition badge shown next to each account.
 *
 * TASK-035 deliberately avoided embedding real bank/e-wallet logo artwork
 * (trademark risk from scraping logo files with no licensing agreement) and
 * rendered a colored initials monogram instead.
 *
 * TASK-037: the user explicitly asked to pull real bank logos from a named
 * public logo directory (diadiembank.com/logo-ngan-hang-tai-viet-nam) and
 * use them for the actual banks present in this user's own accounts (SHB,
 * VPBank, BIDV, Techcombank, PVcomBank, SCB, Eximbank, VIB, Shinhan Bank).
 * These are used purely for account identification -- the same nominative
 * use every banking/finance app relies on to show "which bank is this
 * account with" -- never restyled, edited, or presented as anything other
 * than "this is account X's bank". The source JPGs (apps/web/public/
 * bank-logos/*.png) had wildly inconsistent internal padding per bank; a
 * one-off script (apps/web/scripts/process-bank-logos.py) trimmed each to
 * its real content and re-padded every logo to the same margin ratio in a
 * square canvas so they all carry the same visual weight next to each
 * other and next to the (SVG) category icon set -- see the `size` docs on
 * `AccountLogo` below for how that "same weight" is kept in sync with
 * category icons at each call site.
 *
 * Institutions without a real logo asset (e-wallets, unmatched/unknown
 * banks) still fall back to the original colored monogram -- colors below
 * are loosely brand-evocative, not verified official brand hex values.
 */

interface Brand {
  label: string;
  bg: string;
  fg: string;
  /** Optional key into /public/bank-logos/<logo>.png -- real logo artwork. */
  logo?: string;
}

/** Normalized (uppercase, alphanumeric-only) name prefix -> brand badge. */
const BANKS: Record<string, Brand> = {
  VPB: { label: "VPB", bg: "#0a7a3d", fg: "#ffffff", logo: "vpb" },
  VIETCOMBANK: { label: "VCB", bg: "#00713d", fg: "#ffffff" },
  VCB: { label: "VCB", bg: "#00713d", fg: "#ffffff" },
  TECHCOMBANK: { label: "TCB", bg: "#e21f2b", fg: "#ffffff", logo: "tech" },
  TECH: { label: "TCB", bg: "#e21f2b", fg: "#ffffff", logo: "tech" },
  BIDV: { label: "BIDV", bg: "#00558c", fg: "#ffffff", logo: "bidv" },
  SHINHAN: { label: "SHN", bg: "#0046d5", fg: "#ffffff", logo: "shinhan" },
  SHB: { label: "SHB", bg: "#7a1f2b", fg: "#ffffff", logo: "shb" },
  SCB: { label: "SCB", bg: "#004b8d", fg: "#ffffff", logo: "scb" },
  VIB: { label: "VIB", bg: "#0b3a82", fg: "#ffffff", logo: "vib" },
  EXIM: { label: "EIB", bg: "#f5a623", fg: "#1a1a1a", logo: "exim" },
  PVCOMBANK: { label: "PVCB", bg: "#f26522", fg: "#ffffff", logo: "pvcombank" },
  MOMO: { label: "MoMo", bg: "#a50064", fg: "#ffffff" },
  ZALOPAY: { label: "ZP", bg: "#0068ff", fg: "#ffffff" },
  VNPT: { label: "VNPT", bg: "#005baa", fg: "#ffffff" },
  VIOLET: { label: "Vlt", bg: "#7b3fa0", fg: "#ffffff" },
};

function normalize(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip Vietnamese diacritics
    .replace(/[^A-Z0-9]/g, ""); // drop spaces, hyphens, punctuation
}

function matchBank(name: string): Brand | null {
  const normalized = normalize(name);
  for (const [prefix, brand] of Object.entries(BANKS)) {
    if (normalized.startsWith(prefix)) return brand;
  }
  return null;
}

/** Stable, pleasant fallback color for an unrecognized institution name. */
function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 38%)`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const TYPE_FALLBACK: Record<AccountType, { bg: string; fg: string; glyph: string }> = {
  CASH: { bg: "#3b7a3b", fg: "#ffffff", glyph: "$" },
  BANK: { bg: "#2b4a7a", fg: "#ffffff", glyph: "" },
  CREDIT_CARD: { bg: "#5a3a7a", fg: "#ffffff", glyph: "" },
  EWALLET: { bg: "#a5006e", fg: "#ffffff", glyph: "" },
};

export function AccountLogo({ name, accountType, size = 28 }: { name: string; accountType: AccountType; size?: number }) {
  const brand = matchBank(name);
  if (brand?.logo) {
    return (
      <span className="account-logo account-logo-image" style={{ width: size, height: size }} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny (<7KB) pre-optimized static PNGs from /public rendered at 26-32px; next/image's runtime resize pipeline (sharp, remote-loader config) buys nothing at this scale for a single-file app with no other images. */}
        <img src={`/bank-logos/${brand.logo}.png`} alt={name} width={size} height={size} />
      </span>
    );
  }
  const fallback = TYPE_FALLBACK[accountType];
  const bg = brand?.bg ?? (accountType === "CASH" ? fallback.bg : hashColor(name));
  const fg = brand?.fg ?? fallback.fg;
  const text = brand?.label ? brand.label.slice(0, 4) : (fallback.glyph || initials(name));
  const fontSize = text.length > 3 ? size * 0.32 : size * 0.42;
  return (
    <span
      className="account-logo"
      style={{ width: size, height: size, background: bg, color: fg, fontSize }}
      title={name}
    >
      {text}
    </span>
  );
}
