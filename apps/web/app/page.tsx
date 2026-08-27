"use client";

import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Account, AccountBalance, AccountType, Category, CryptoHolding, CryptoUpdateInput, EventInput, EventType, FinancialEvent, ImportApplyResult, MetalHolding, MetalUpdateInput, SavingsAccount, SavingsCreateInput, SavingsPatchInput } from "../lib/api";
import { categoryLabel, copy, enumLabel, Language, transactionUiKeys, ui, useLanguage } from "../lib/i18n";
import { buildCategoryTree, categoriesForEventType, categoryDepth, categoryIsValidForEventType, categoryPath, filterCategoryTree, toggleCategoryExpansion, canMoveCategory, categoryRoot, getCategoryDepth } from "../lib/category-tree";
import { CategoryIcon, CategoryIconBadge, IconGlyph, ICON_GROUPS, iconLabel } from "../lib/category-icons";
import { bankCatalog, bankCategoryLabel, bankCategoryOrder, ewalletCatalog } from "../lib/bank-catalog";
import { AccountLogo, getAccountBrand } from "../lib/account-logos";

type View = "transactions" | "ledger" | "accounts" | "categories" | "review" | "assets" | "data";
// User request, 2026-08-26 (UI redesign to a Money-Lover-style layout):
// the 6 original nav tabs plus the new "Sổ giao dịch" (Ledger) tab now live
// in a vertical sidebar (see the <aside className="sidebar"> in Home())
// instead of the old horizontal scrolling nav. This list controls both the
// render order and each tab's icon; the accessible nav role/label and each
// button's exact visible text (t[item]) are unchanged from before, so
// e2e/helpers.ts's goToTab() keeps working without modification.
const navItems: { view: View; icon: string }[] = [
  { view: "transactions", icon: "Wallet" },
  { view: "ledger", icon: "Book" },
  { view: "accounts", icon: "CreditCard" },
  { view: "categories", icon: "Grid" },
  { view: "assets", icon: "PiggyBank" },
  { view: "data", icon: "Folder" },
  { view: "review", icon: "BarChart" },
];
type EntryDraft = { accountId: string; amount: string };
const accountTypes: AccountType[] = ["CASH", "BANK", "CREDIT_CARD", "EWALLET"];
const composerEventTypes: EventType[] = ["EXPENSE", "INCOME", "TRANSFER", "CREDIT_CARD_PAYMENT"];
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function todayIso(): string { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function shiftIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return todayIso();
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}
function formatIsoDateLabel(language: Language, iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const local = new Date(y, m - 1, d);
  const locale = language === "vi" ? "vi-VN" : "en-US";
  const formatted = new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(local);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
// BUGFIX: this used to append a second, redundant "Other / Custom bank"
// literal on top of the catalog's own "other" entry (see bank-catalog.ts) --
// harmless duplication for the savings-form datalist below, but confusing
// when read next to the strict <select> in AccountFormDialog, which builds
// its options straight from bankCatalog instead of this list.
const bankTemplates = bankCatalog.map(x => x.name);
const LanguageContext = createContext<Language>("vi");
function useI18n() {
  const language = useContext(LanguageContext);
  return { language, tr: (text: string) => ui(language, text), label: (value: string) => enumLabel(language, value) };
}

export default function Home() {
  const [view, setView] = useState<View>("transactions");
  const [language, setLanguage] = useLanguage();
  const t = copy[language];
  // User request, 2026-08-26 (UI redesign): the eyebrow ("SỔ CÁI LƯU TRỮ
  // CỤC BỘ") and h1 title ("Tài chính cá nhân") that used to open every
  // page are gone -- the sidebar's own branding now stands in for both.
  // The horizontal <nav> is now a vertical sidebar column (styled in
  // styles.css's .sidebar rules) holding all 7 tabs (the new "Sổ giao
  // dịch" tab is navItems' 2nd entry, see its definition above); the
  // language switcher moves to a slim top bar next to the page content.
  return <LanguageContext.Provider value={language}><div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand" aria-hidden="true"><IconGlyph iconKey="Wallet" size={24} /><span>{language === "vi" ? "Sổ cái" : "Ledger"}</span></div>
      <nav aria-label={ui(language, "Main navigation")}>{navItems.map(({ view: item, icon }) => <button type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => setView(item)} key={item}><span className="nav-icon" aria-hidden="true"><IconGlyph iconKey={icon} size={20} /></span><span>{t[item as keyof typeof t] ?? item}</span></button>)}</nav>
    </aside>
    <div className="app-content">
      <header className="topbar"><div className="header-tools"><div className="language" role="group" aria-label={t.language}><button type="button" aria-pressed={language === "vi"} className={language === "vi" ? "active" : ""} onClick={() => setLanguage("vi")}>🇻🇳 <span>Tiếng Việt</span></button><button type="button" aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>🇺🇸 <span>English</span></button></div></div></header>
      <main>{view === "accounts" ? <Accounts /> : view === "categories" ? <Categories /> : view === "review" ? <Review /> : view === "assets" ? <Assets /> : view === "data" ? <DataPage /> : view === "ledger" ? <Ledger /> : <Transactions />}</main>
    </div>
  </div></LanguageContext.Provider>;
}

function DateRow({ value, onChange, language, label: labelText, name }: { value: string; onChange: (v: string) => void; language: Language; label?: string; name?: string }) {
  const { tr } = useI18n();
  return <div className="date-row">
    <button type="button" className="date-nav" aria-label={tr("Previous day")} onClick={() => onChange(shiftIsoDate(value, -1))}>‹</button>
    <label className="date-center">
      <span>{formatIsoDateLabel(language, value)}</span>
      <input type="date" name={name} aria-label={labelText ? tr(labelText) : tr("Choose date")} value={value} onChange={e => onChange(e.target.value || todayIso())} required className="date-native" />
    </label>
    <button type="button" className="date-nav" aria-label={tr("Next day")} onClick={() => onChange(shiftIsoDate(value, 1))}>›</button>
  </div>;
}

function AssetDashboard({
  accounts,
  accountBalances,
  savings,
  metals,
  crypto,
  activeTab,
  onSelectTab,
}: {
  accounts: Account[];
  accountBalances: Map<number, string>;
  savings: SavingsAccount[];
  metals: MetalHolding[];
  crypto: CryptoHolding[];
  activeTab: "liquid" | "savings" | "metals" | "crypto";
  onSelectTab: (tab: "liquid" | "savings" | "metals" | "crypto") => void;
}) {
  const { tr } = useI18n();

  let liquidTotal = "0";
  for (const a of accounts) {
    if (a.is_active && a.account_type !== "CREDIT_CARD") {
      const bal = accountBalances.get(a.id);
      if (bal) liquidTotal = sumMoney([liquidTotal, bal]);
    }
  }

  let savingsTotal = "0";
  for (const s of savings) {
    if (s.status === "OPEN" && !s.excluded_from_reports) {
      savingsTotal = sumMoney([savingsTotal, s.principal]);
    }
  }

  let metalsTotal = "0";
  for (const m of metals) {
    if (!m.excluded_from_reports) {
      metalsTotal = sumMoney([metalsTotal, m.total_cost]);
    }
  }

  let cryptoTotal = "0";
  for (const c of crypto) {
    if (!c.excluded_from_reports) {
      cryptoTotal = sumMoney([cryptoTotal, c.total_cost]);
    }
  }

  let creditCardDebt = "0";
  for (const a of accounts) {
    if (a.is_active && a.account_type === "CREDIT_CARD") {
      const bal = accountBalances.get(a.id);
      if (bal && bal.startsWith("-")) {
        creditCardDebt = sumMoney([creditCardDebt, negateMoney(bal)]);
      }
    }
  }

  const totalGrossAssets = sumMoney([liquidTotal, savingsTotal, metalsTotal, cryptoTotal]);
  const netWorth = sumMoney([totalGrossAssets, negateMoney(creditCardDebt)]);

  const grossNum = Number(totalGrossAssets) || 1;
  const liquidPct = Math.max(0, Math.round((Number(liquidTotal) / grossNum) * 100));
  const savingsPct = Math.max(0, Math.round((Number(savingsTotal) / grossNum) * 100));
  const metalsPct = Math.max(0, Math.round((Number(metalsTotal) / grossNum) * 100));
  const cryptoPct = Math.max(0, 100 - liquidPct - savingsPct - metalsPct);

  return (
    <div className="assets-dashboard">
      <div className="net-worth-hero">
        <div className="net-worth-hero-top">
          <div>
            <span className="net-worth-hero-label">{tr("Total Net Worth")}</span>
            <div className="net-worth-hero-amount">{fmtMoneyDisplay(netWorth)} VND</div>
          </div>
          <div className="net-worth-hero-subtotals">
            <div className="net-worth-subtotal">
              <span>{tr("Total Assets")}</span>
              <strong>{fmtMoneyDisplay(totalGrossAssets)} VND</strong>
            </div>
            <div className="net-worth-subtotal">
              <span>{tr("Total Liabilities")}</span>
              <strong style={{ color: "#fca5a5" }}>-{fmtMoneyDisplay(creditCardDebt)} VND</strong>
            </div>
          </div>
        </div>

        <div className="asset-breakdown-container">
          <div className="asset-breakdown-bar">
            {liquidPct > 0 && <div className="asset-breakdown-segment" style={{ width: `${liquidPct}%`, backgroundColor: "#3b82f6" }} title={`Tiền mặt & Ngân hàng: ${liquidPct}%`} />}
            {savingsPct > 0 && <div className="asset-breakdown-segment" style={{ width: `${savingsPct}%`, backgroundColor: "#10b981" }} title={`Tiết kiệm: ${savingsPct}%`} />}
            {metalsPct > 0 && <div className="asset-breakdown-segment" style={{ width: `${metalsPct}%`, backgroundColor: "#f59e0b" }} title={`Kim loại quý: ${metalsPct}%`} />}
            {cryptoPct > 0 && <div className="asset-breakdown-segment" style={{ width: `${cryptoPct}%`, backgroundColor: "#8b5cf6" }} title={`Tiền mã hóa: ${cryptoPct}%`} />}
          </div>
          <div className="asset-breakdown-legend">
            <div className="asset-breakdown-item"><span className="asset-dot" style={{ backgroundColor: "#3b82f6" }} /><span>{tr("Cash & Liquid")} ({liquidPct}%)</span></div>
            <div className="asset-breakdown-item"><span className="asset-dot" style={{ backgroundColor: "#10b981" }} /><span>{tr("Savings")} ({savingsPct}%)</span></div>
            <div className="asset-breakdown-item"><span className="asset-dot" style={{ backgroundColor: "#f59e0b" }} /><span>{tr("Precious metals & Gold")} ({metalsPct}%)</span></div>
            <div className="asset-breakdown-item"><span className="asset-dot" style={{ backgroundColor: "#8b5cf6" }} /><span>{tr("Crypto")} ({cryptoPct}%)</span></div>
          </div>
        </div>
      </div>

      <div className="asset-metric-grid" role="tablist" aria-label={tr("Assets")}>
        <div
          role="tab"
          tabIndex={0}
          aria-selected={activeTab === "liquid"}
          className={`asset-metric-card ${activeTab === "liquid" ? "active" : ""}`}
          onClick={() => onSelectTab("liquid")}
          onKeyDown={e => (e.key === "Enter" || e.key === " ") && onSelectTab("liquid")}
        >
          <div className="asset-metric-header">
            <span>{tr("Cash & Liquid")}</span>
            <IconGlyph iconKey="Wallet" size={18} />
          </div>
          <div className="asset-metric-amount">{fmtMoneyDisplay(liquidTotal)} VND</div>
          <div className="asset-metric-sub">{accounts.filter(a => a.is_active && a.account_type !== "CREDIT_CARD").length} {tr("Accounts")}</div>
        </div>

        <div
          role="tab"
          tabIndex={0}
          aria-selected={activeTab === "savings"}
          className={`asset-metric-card ${activeTab === "savings" ? "active" : ""}`}
          onClick={() => onSelectTab("savings")}
          onKeyDown={e => (e.key === "Enter" || e.key === " ") && onSelectTab("savings")}
        >
          <div className="asset-metric-header">
            <span>{tr("Savings")}</span>
            <IconGlyph iconKey="PiggyBank" size={18} />
          </div>
          <div className="asset-metric-amount">{fmtMoneyDisplay(savingsTotal)} VND</div>
          <div className="asset-metric-sub">{savings.filter(s => s.status === "OPEN").length} {tr("Accounts")}</div>
        </div>

        <div
          role="tab"
          tabIndex={0}
          aria-selected={activeTab === "metals"}
          className={`asset-metric-card ${activeTab === "metals" ? "active" : ""}`}
          onClick={() => onSelectTab("metals")}
          onKeyDown={e => (e.key === "Enter" || e.key === " ") && onSelectTab("metals")}
        >
          <div className="asset-metric-header">
            <span>{tr("Precious metals & Gold")}</span>
            <IconGlyph iconKey="Award" size={18} />
          </div>
          <div className="asset-metric-amount">{fmtMoneyDisplay(metalsTotal)} VND</div>
          <div className="asset-metric-sub">{metals.length} {tr("Holdings")}</div>
        </div>

        <div
          role="tab"
          tabIndex={0}
          aria-selected={activeTab === "crypto"}
          className={`asset-metric-card ${activeTab === "crypto" ? "active" : ""}`}
          onClick={() => onSelectTab("crypto")}
          onKeyDown={e => (e.key === "Enter" || e.key === " ") && onSelectTab("crypto")}
        >
          <div className="asset-metric-header">
            <span>{tr("Crypto")}</span>
            <IconGlyph iconKey="TrendingUp" size={18} />
          </div>
          <div className="asset-metric-amount">{fmtMoneyDisplay(cryptoTotal)} VND</div>
          <div className="asset-metric-sub">{crypto.length} {tr("Holdings")}</div>
        </div>
      </div>
    </div>
  );
}

function MetalEditModal({
  holding,
  brands,
  onDone,
  onCancel,
}: {
  holding: MetalHolding;
  brands: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { tr, label, language } = useI18n();
  const [metalDate, setMetalDate] = useState(holding.purchase_date ?? todayIso());
  const [metalType, setMetalType] = useState(holding.metal_type);
  const [brand, setBrand] = useState(holding.brand);
  const [productType, setProductType] = useState(holding.product_type);
  const initialChi = holding.quantity_grams ? (Number(holding.quantity_grams) / 3.75).toString() : "";
  const [quantityChi, setQuantityChi] = useState(initialChi);
  const [purity, setPurity] = useState(holding.purity ? (Number(holding.purity) * 100).toFixed(2) : "99.99");
  const [price, setPrice] = useState(holding.purchase_price ? (fmtMoney(holding.purchase_price) ?? holding.purchase_price) : "");
  const [totalCost, setTotalCost] = useState(holding.total_cost ? (fmtMoney(holding.total_cost) ?? holding.total_cost) : "");
  const [excluded, setExcluded] = useState(Boolean(holding.excluded_from_reports));

  const update = useMutation({
    mutationFn: (data: MetalUpdateInput) => api.assets.metals.update(holding.id, data),
    onSuccess: onDone,
  });

  function normDecimal(raw: string): string { return raw.trim().replace(",", "."); }
  function percentToFraction(raw: string): string {
    const trimmed = normDecimal(raw);
    if (!trimmed) return "0.9999";
    const negative = trimmed.startsWith("-");
    const [wholeRaw, fracRaw = ""] = trimmed.replace(/^-/, "").split(".");
    const whole = wholeRaw.replace(/\D/g, "") || "0";
    const frac = fracRaw.replace(/\D/g, "");
    const digits = whole + frac;
    const pointPos = whole.length - 2;
    const shifted = pointPos <= 0 ? `0.${"0".repeat(-pointPos)}${digits}` : `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
    const [w, d = ""] = shifted.split(".");
    return `${negative ? "-" : ""}${w || "0"}.${(d + "0000").slice(0, 4)}`;
  }

  function handleChiChange(v: string) {
    setQuantityChi(v);
    const q = Number(normDecimal(v));
    const p = Number(normDecimal(price));
    if (q > 0 && p > 0) setTotalCost(String(Math.round(q * p)));
  }
  function handlePriceChange(v: string) {
    setPrice(v);
    const p = Number(normDecimal(v));
    const q = Number(normDecimal(quantityChi));
    if (q > 0 && p > 0) setTotalCost(String(Math.round(q * p)));
  }
  function handleTotalChange(v: string) {
    setTotalCost(v);
    const t = Number(normDecimal(v));
    const q = Number(normDecimal(quantityChi));
    if (q > 0 && t > 0) setPrice(String(Math.round(t / q)));
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const [whole, fraction = ""] = normDecimal(quantityChi).split(".");
    const scaledChi = BigInt(whole || "0") * BigInt("10000") + BigInt((fraction + "0000").slice(0, 4));
    const scaledGrams = scaledChi * BigInt("375") / BigInt("100");
    const grams = `${scaledGrams / BigInt("10000")}.${String(scaledGrams % BigInt("10000")).padStart(4, "0")}`.replace(/\.?0+$/, "");

    update.mutate({
      metal_type: metalType,
      brand,
      product_type: productType,
      purity: percentToFraction(purity),
      quantity_grams: grams,
      purchase_price: normDecimal(price) || undefined,
      total_cost: normDecimal(totalCost) || undefined,
      purchase_date: metalDate || undefined,
      excluded_from_reports: excluded,
    });
  }

  const productTypes = ["RING", "BAR", "JEWELRY"] as const;

  return (
    <Modal title="Edit metal holding" onClose={onCancel} wide>
      <form onSubmit={submit} className="form">
        <Error error={update.error} />
        <div className="account-form-grid" style={{ gridColumn: "1 / -1", width: "100%" }}>
          <Field label="Type">
            <select value={metalType} onChange={e => setMetalType(e.target.value as "GOLD" | "SILVER")}>
              <option value="GOLD">{tr("Gold")}</option>
              <option value="SILVER">{tr("Silver")}</option>
            </select>
          </Field>
          <Field label="Brand">
            <select value={brand} onChange={e => setBrand(e.target.value)}>
              {brands.map(b => <option value={b} key={b}>{label(b)}</option>)}
            </select>
          </Field>
          <Field label="Product">
            <select value={productType} onChange={e => setProductType(e.target.value)}>
              {productTypes.map(x => <option value={label(x)} key={x}>{label(x)}</option>)}
            </select>
          </Field>
          <Field label="Quantity (chỉ)">
            <input value={quantityChi} onChange={e => handleChiChange(e.target.value)} required inputMode="decimal" />
          </Field>
          <Field label="Purity">
            <div className="amount-row"><input value={purity} onChange={e => setPurity(e.target.value)} inputMode="decimal" /><span className="currency-badge">%</span></div>
          </Field>
          <Field label="Purchase price">
            <div className="amount-row"><MoneyInput value={price} onChange={handlePriceChange} placeholder="0" required /><span className="currency-badge">VND</span></div>
          </Field>
          <Field label="Total cost">
            <div className="amount-row"><MoneyInput value={totalCost} onChange={handleTotalChange} placeholder="0" required /><span className="currency-badge">VND</span></div>
          </Field>
          <div className="full-span">
            <Field label="Purchase date">
              <DateRow value={metalDate} onChange={setMetalDate} language={language} label="Purchase date" />
            </Field>
          </div>
          <div className="full-span">
            <label className="checkbox-row">
              <input type="checkbox" checked={excluded} onChange={e => setExcluded(e.target.checked)} />
              <span>{tr("Exclude from reports")}</span>
            </label>
          </div>
        </div>
        <div className="form-actions" style={{ gridColumn: "1 / -1", marginTop: "14px" }}>
          <Submit pending={update.isPending} text="Save changes" />
          <button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function CryptoEditModal({
  holding,
  onDone,
  onCancel,
}: {
  holding: CryptoHolding;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { tr, language } = useI18n();
  const [cryptoDate, setCryptoDate] = useState(holding.purchase_date ?? todayIso());
  const [symbol, setSymbol] = useState(holding.symbol);
  const [displayName, setDisplayName] = useState(holding.display_name ?? "");
  const [quantity, setQuantity] = useState(holding.quantity);
  const [price, setPrice] = useState(holding.purchase_price ? (fmtMoney(holding.purchase_price) ?? holding.purchase_price) : "");
  const [totalCost, setTotalCost] = useState(holding.total_cost ? (fmtMoney(holding.total_cost) ?? holding.total_cost) : "");
  const [excluded, setExcluded] = useState(Boolean(holding.excluded_from_reports));

  const update = useMutation({
    mutationFn: (data: CryptoUpdateInput) => api.assets.crypto.update(holding.id, data),
    onSuccess: onDone,
  });

  function normDecimal(raw: string): string { return raw.trim().replace(",", "."); }

  function handleQtyChange(v: string) {
    setQuantity(v);
    const q = Number(normDecimal(v));
    const p = Number(normDecimal(price));
    if (q > 0 && p > 0) setTotalCost(String(Math.round(q * p)));
  }
  function handlePriceChange(v: string) {
    setPrice(v);
    const p = Number(normDecimal(v));
    const q = Number(normDecimal(quantity));
    if (q > 0 && p > 0) setTotalCost(String(Math.round(q * p)));
  }
  function handleTotalChange(v: string) {
    setTotalCost(v);
    const t = Number(normDecimal(v));
    const q = Number(normDecimal(quantity));
    if (q > 0 && t > 0) setPrice(String(Math.round(t / q)));
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    update.mutate({
      symbol,
      display_name: displayName || undefined,
      quantity: normDecimal(quantity),
      purchase_price: normDecimal(price) || undefined,
      total_cost: normDecimal(totalCost) || undefined,
      purchase_date: cryptoDate || undefined,
      excluded_from_reports: excluded,
    });
  }

  return (
    <Modal title="Edit crypto holding" onClose={onCancel} wide>
      <form onSubmit={submit} className="form">
        <Error error={update.error} />
        <div className="account-form-grid" style={{ gridColumn: "1 / -1", width: "100%" }}>
          <Field label="Coin code">
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} required />
          </Field>
          <Field label="Name">
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} required />
          </Field>
          <Field label="Quantity">
            <input value={quantity} onChange={e => handleQtyChange(e.target.value)} required inputMode="decimal" />
          </Field>
          <Field label="Purchase price">
            <div className="amount-row"><MoneyInput value={price} onChange={handlePriceChange} placeholder="0" required /><span className="currency-badge">VND</span></div>
          </Field>
          <Field label="Total cost">
            <div className="amount-row"><MoneyInput value={totalCost} onChange={handleTotalChange} placeholder="0" required /><span className="currency-badge">VND</span></div>
          </Field>
          <div className="full-span">
            <Field label="Purchase date">
              <DateRow value={cryptoDate} onChange={setCryptoDate} language={language} label="Purchase date" />
            </Field>
          </div>
          <div className="full-span">
            <label className="checkbox-row">
              <input type="checkbox" checked={excluded} onChange={e => setExcluded(e.target.checked)} />
              <span>{tr("Exclude from reports")}</span>
            </label>
          </div>
        </div>
        <div className="form-actions" style={{ gridColumn: "1 / -1", marginTop: "14px" }}>
          <Submit pending={update.isPending} text="Save changes" />
          <button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function MetalsHoldingsTable({
  metals,
  portfolioRows,
  onEdit,
  onDeleted,
}: {
  metals: MetalHolding[];
  portfolioRows: import("../lib/api").PortfolioRow[];
  onEdit: (m: MetalHolding) => void;
  onDeleted: () => void;
}) {
  const { tr, label } = useI18n();
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.assets.metals.remove(id),
    onSuccess: onDeleted,
  });

  return (
    <div className="holdings-table-wrap">
      <table className="holdings-table">
        <thead>
          <tr>
            <th>{tr("Product")}</th>
            <th>{tr("Brand")}</th>
            <th>{tr("Purity")}</th>
            <th>{tr("Quantity (chỉ)")}</th>
            <th>{tr("Grams")}</th>
            <th>{tr("Purchase price")}</th>
            <th>{tr("Total cost")}</th>
            <th>{tr("Date")}</th>
            <th>{tr("Market price")}</th>
            <th>{tr("Market value")}</th>
            <th>{tr("Profit / Loss")}</th>
            <th>{tr("Edit")} / {tr("Delete")}</th>
          </tr>
        </thead>
        <tbody>
          {metals.length === 0 ? (
            <tr>
              <td colSpan={12} style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
                {tr("No precious metals yet.")}
              </td>
            </tr>
          ) : (
            metals.map(m => {
              const portRow = portfolioRows.find(r => r.id === m.id);
              const currentVal = portRow?.value ?? m.total_cost;
              const chiQty = (Number(m.quantity_grams) / 3.75).toFixed(2);
              const currentValNum = Number(currentVal);
              const totalCostNum = Number(m.total_cost);
              const deltaNum = currentValNum - totalCostNum;
              const pnlPct = totalCostNum > 0 ? ((deltaNum / totalCostNum) * 100).toFixed(2) : "0.00";
              const marketPricePerChi = chiQty && Number(chiQty) > 0 && currentValNum > 0
                ? Math.round(currentValNum / Number(chiQty))
                : null;

              return (
                <tr key={m.id}>
                  <td><strong>{m.product_type}</strong></td>
                  <td>{label(m.brand)}</td>
                  <td>{m.purity ? `${(Number(m.purity) * 100).toFixed(2)}%` : "99.99%"}</td>
                  <td><b>{chiQty}</b> chỉ</td>
                  <td>{m.quantity_grams} g</td>
                  <td>{fmtMoneyDisplay(m.purchase_price)} đ</td>
                  <td><b>{fmtMoneyDisplay(m.total_cost)} đ</b></td>
                  <td>{m.purchase_date}</td>
                  <td>{marketPricePerChi ? `${fmtMoneyDisplay(String(marketPricePerChi))} đ/chỉ` : "—"}</td>
                  <td><strong>{fmtMoneyDisplay(currentVal)} đ</strong></td>
                  <td>
                    <span className={`pnl-pill ${deltaNum > 0 ? "pnl-positive" : deltaNum < 0 ? "pnl-negative" : "pnl-neutral"}`}>
                      {deltaNum > 0 ? "+" : ""}{fmtMoneyDisplay(String(deltaNum))} ({deltaNum > 0 ? "+" : ""}{pnlPct}%)
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button type="button" className="text-button" onClick={() => onEdit(m)}>{tr("Edit")}</button>
                      <button
                        type="button"
                        className="text-button danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`${tr("Confirm delete")}?`)) {
                            deleteMutation.mutate(m.id);
                          }
                        }}
                      >
                        {tr("Delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function CryptoHoldingsTable({
  crypto,
  portfolioRows,
  onEdit,
  onDeleted,
}: {
  crypto: CryptoHolding[];
  portfolioRows: import("../lib/api").PortfolioRow[];
  onEdit: (c: CryptoHolding) => void;
  onDeleted: () => void;
}) {
  const { tr } = useI18n();
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.assets.crypto.remove(id),
    onSuccess: onDeleted,
  });

  return (
    <div className="holdings-table-wrap">
      <table className="holdings-table">
        <thead>
          <tr>
            <th>{tr("Coin code")}</th>
            <th>{tr("Name")}</th>
            <th>{tr("Quantity")}</th>
            <th>{tr("Purchase price")}</th>
            <th>{tr("Total cost")}</th>
            <th>{tr("Date")}</th>
            <th>{tr("Market price")}</th>
            <th>{tr("Market value")}</th>
            <th>{tr("Profit / Loss")}</th>
            <th>{tr("Edit")} / {tr("Delete")}</th>
          </tr>
        </thead>
        <tbody>
          {crypto.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
                {tr("No crypto yet.")}
              </td>
            </tr>
          ) : (
            crypto.map(c => {
              const portRow = portfolioRows.find(r => r.id === c.id);
              const currentVal = portRow?.value ?? c.total_cost;
              const currentValNum = Number(currentVal);
              const totalCostNum = Number(c.total_cost);
              const qtyNum = Number(c.quantity);
              const deltaNum = currentValNum - totalCostNum;
              const pnlPct = totalCostNum > 0 ? ((deltaNum / totalCostNum) * 100).toFixed(2) : "0.00";
              const marketPricePerUnit = qtyNum > 0 && currentValNum > 0
                ? Math.round(currentValNum / qtyNum)
                : null;

              return (
                <tr key={c.id}>
                  <td><strong>{c.symbol}</strong></td>
                  <td>{c.display_name}</td>
                  <td><b>{c.quantity}</b></td>
                  <td>{fmtMoneyDisplay(c.purchase_price)} đ</td>
                  <td><b>{fmtMoneyDisplay(c.total_cost)} đ</b></td>
                  <td>{c.purchase_date}</td>
                  <td>{marketPricePerUnit ? `${fmtMoneyDisplay(String(marketPricePerUnit))} đ` : "—"}</td>
                  <td><strong>{fmtMoneyDisplay(currentVal)} đ</strong></td>
                  <td>
                    <span className={`pnl-pill ${deltaNum > 0 ? "pnl-positive" : deltaNum < 0 ? "pnl-negative" : "pnl-neutral"}`}>
                      {deltaNum > 0 ? "+" : ""}{fmtMoneyDisplay(String(deltaNum))} ({deltaNum > 0 ? "+" : ""}{pnlPct}%)
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button type="button" className="text-button" onClick={() => onEdit(c)}>{tr("Edit")}</button>
                      <button
                        type="button"
                        className="text-button danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`${tr("Confirm delete")}?`)) {
                            deleteMutation.mutate(c.id);
                          }
                        }}
                      >
                        {tr("Delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function Assets() {
  const { tr, label, language } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portfolio"], queryFn: api.portfolio.overview });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const { balances } = useAccountBalances(accountsQ.data);
  const savingsQ = useQuery({ queryKey: ["savings"], queryFn: api.assets.savings.list });
  const metalsQ = useQuery({ queryKey: ["metals"], queryFn: api.assets.metals.list });
  const cryptoQ = useQuery({ queryKey: ["crypto"], queryFn: api.assets.crypto.list });
  const brands = useQuery({ queryKey: ["metal-brands"], queryFn: api.assets.metalBrands });

  const [tab, setTab] = useState<"liquid" | "savings" | "metals" | "crypto">("liquid");
  const [metalQty, setMetalQty] = useState("");
  const [metalDate, setMetalDate] = useState(todayIso());
  const [metalPrice, setMetalPrice] = useState("");
  const [metalTotal, setMetalTotal] = useState("");
  const [cryptoDate, setCryptoDate] = useState(todayIso());
  const [cryptoCurrency, setCryptoCurrency] = useState<"VND" | "USD">("VND");
  const [cryptoQty, setCryptoQty] = useState("");
  const [cryptoPrice, setCryptoPrice] = useState("");
  const [cryptoTotal, setCryptoTotal] = useState("");

  const [editingMetal, setEditingMetal] = useState<MetalHolding | null>(null);
  const [editingCrypto, setEditingCrypto] = useState<CryptoHolding | null>(null);

  const fx = useQuery({ queryKey: ["fx", "usd-vnd"], queryFn: api.fx.usdVnd, enabled: cryptoCurrency === "USD", staleTime: 5 * 60 * 1000 });
  const metal = useMutation({
    mutationFn: api.assets.metals.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["metals"] });
      setMetalQty("");
      setMetalPrice("");
      setMetalTotal("");
    },
  });
  const crypto = useMutation({
    mutationFn: api.assets.crypto.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["crypto"] });
      setCryptoQty("");
      setCryptoPrice("");
      setCryptoTotal("");
    },
  });

  function normDecimal(raw: string): string { return raw.trim().replace(",", "."); }
  function percentToFraction(raw: string): string {
    const trimmed = normDecimal(raw);
    if (!trimmed) return "0.9999";
    const negative = trimmed.startsWith("-");
    const [wholeRaw, fracRaw = ""] = trimmed.replace(/^-/, "").split(".");
    const whole = wholeRaw.replace(/\D/g, "") || "0";
    const frac = fracRaw.replace(/\D/g, "");
    const digits = whole + frac;
    const pointPos = whole.length - 2;
    const shifted = pointPos <= 0 ? `0.${"0".repeat(-pointPos)}${digits}` : `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
    const [w, d = ""] = shifted.split(".");
    return `${negative ? "-" : ""}${w || "0"}.${(d + "0000").slice(0, 4)}`;
  }

  function handleMetalQtyChange(v: string) {
    setMetalQty(v);
    const qNum = Number(normDecimal(v));
    const pNum = Number(normDecimal(metalPrice));
    if (qNum > 0 && pNum > 0) setMetalTotal(String(Math.round(qNum * pNum)));
  }
  function handleMetalPriceChange(v: string) {
    setMetalPrice(v);
    const pNum = Number(normDecimal(v));
    const qNum = Number(normDecimal(metalQty));
    if (qNum > 0 && pNum > 0) setMetalTotal(String(Math.round(qNum * pNum)));
  }
  function handleMetalTotalChange(v: string) {
    setMetalTotal(v);
    const tNum = Number(normDecimal(v));
    const qNum = Number(normDecimal(metalQty));
    if (qNum > 0 && tNum > 0) setMetalPrice(String(Math.round(tNum / qNum)));
  }

  function handleCryptoQtyChange(v: string) {
    setCryptoQty(v);
    const qNum = Number(normDecimal(v));
    if (cryptoCurrency === "VND") {
      const pNum = Number(normDecimal(cryptoPrice));
      if (qNum > 0 && pNum > 0) setCryptoTotal(String(Math.round(qNum * pNum)));
    } else {
      const pUsd = Number(normDecimal(cryptoPrice));
      const rate = fx.data?.rate ? Number(fx.data.rate) : 0;
      if (qNum > 0 && pUsd > 0 && rate > 0) {
        setCryptoTotal(String(Math.round(qNum * Math.round(pUsd * rate))));
      }
    }
  }
  function handleCryptoPriceChange(v: string) {
    setCryptoPrice(v);
    const qNum = Number(normDecimal(cryptoQty));
    if (cryptoCurrency === "VND") {
      const pNum = Number(normDecimal(v));
      if (qNum > 0 && pNum > 0) setCryptoTotal(String(Math.round(qNum * pNum)));
    } else {
      const pUsd = Number(normDecimal(v));
      const rate = fx.data?.rate ? Number(fx.data.rate) : 0;
      if (qNum > 0 && pUsd > 0 && rate > 0) {
        setCryptoTotal(String(Math.round(qNum * Math.round(pUsd * rate))));
      }
    }
  }
  function handleCryptoTotalChange(v: string) {
    setCryptoTotal(v);
    const tNum = Number(normDecimal(v));
    const qNum = Number(normDecimal(cryptoQty));
    if (cryptoCurrency === "VND") {
      if (qNum > 0 && tNum > 0) setCryptoPrice(String(Math.round(tNum / qNum)));
    } else {
      const rate = fx.data?.rate ? Number(fx.data.rate) : 0;
      if (qNum > 0 && tNum > 0 && rate > 0) {
        const unitVnd = tNum / qNum;
        setCryptoPrice((unitVnd / rate).toFixed(2));
      }
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>, kind: "metal" | "crypto") {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "");
    const vd = (n: string) => normDecimal(v(n));
    if (kind === "metal") {
      const [whole, fraction = ""] = normDecimal(metalQty || vd("quantity")).split(".");
      const scaledChi = BigInt(whole || "0") * BigInt("10000") + BigInt((fraction + "0000").slice(0, 4));
      const scaledGrams = scaledChi * BigInt("375") / BigInt("100");
      const grams = `${scaledGrams / BigInt("10000")}.${String(scaledGrams % BigInt("10000")).padStart(4, "0")}`.replace(/\.?0+$/, "");
      metal.mutate({
        metal_type: v("metal_type") as "GOLD" | "SILVER",
        brand: v("brand"),
        product_type: v("product_type"),
        purity: percentToFraction(v("purity")),
        quantity_grams: grams,
        purchase_date: metalDate || v("date"),
        purchase_price: normDecimal(metalPrice) || vd("price"),
        total_cost: normDecimal(metalTotal) || vd("total"),
        excluded_from_reports: f.get("excluded_from_reports") === "on",
      });
      return;
    }
    const code = v("symbol").trim();
    if (!code) return;
    const totals = cryptoPurchaseTotals(normDecimal(cryptoQty), normDecimal(cryptoPrice), cryptoCurrency, fx.data?.rate);
    const finalTotal = normDecimal(cryptoTotal) || totals?.totalVnd;
    const finalPrice = totals?.unitPriceVnd || normDecimal(cryptoPrice);
    if (!finalTotal || !finalPrice) return;
    const identity = await resolveCryptoIdentity(code);
    crypto.mutate({
      coingecko_id: identity.coingecko_id,
      symbol: identity.symbol,
      display_name: identity.display_name,
      quantity: normDecimal(cryptoQty),
      purchase_date: cryptoDate || v("date"),
      purchase_price: finalPrice,
      total_cost: finalTotal,
      excluded_from_reports: f.get("excluded_from_reports") === "on",
    });
  }

  const decimalPattern = "^\\d+([.,]\\d{1,4})?$";
  const productTypes = ["RING", "BAR", "JEWELRY"] as const;

  const forms = {
    metals: <form className="panel form asset-form" onSubmit={e => submit(e, "metal")}>
      <h3>{tr("Precious metals")}</h3>
      <Error error={metal.error} />
      <select name="metal_type"><option value="GOLD">{tr("Gold")}</option><option value="SILVER">{tr("Silver")}</option></select>
      <select name="brand" aria-label={tr("Product catalog")}>{(brands.data ?? []).map(b => <option value={b} key={b}>{label(b)}</option>)}</select>
      <select name="product_type" aria-label={tr("Product")} required defaultValue="">
        <option value="" disabled>{tr("Product")}</option>
        {productTypes.map(x => <option value={label(x)} key={x}>{label(x)}</option>)}
      </select>
      <input name="quantity" placeholder={tr("Quantity (chỉ)")} aria-label={tr("Quantity (chỉ)")} inputMode="decimal" required value={metalQty} onChange={e => handleMetalQtyChange(e.target.value)} />
      <div className="amount-row purity-row">
        <input name="purity" placeholder="99.99" title={tr("Leave blank to use 99.99%")} aria-label={tr("Purity")} inputMode="decimal" pattern={decimalPattern} />
        <span className="currency-badge">%</span>
      </div>
      <div className="amount-row">
        <MoneyInput value={metalPrice} onChange={handleMetalPriceChange} placeholder={tr("Purchase price")} required />
        <span className="currency-badge">VND</span>
      </div>
      <div className="amount-row">
        <MoneyInput value={metalTotal} onChange={handleMetalTotalChange} placeholder={tr("Total cost")} required />
        <span className="currency-badge">VND</span>
      </div>
      <DateRow name="date" value={metalDate} onChange={setMetalDate} language={language} label="Purchase date" />
      <label className="checkbox-row"><input type="checkbox" name="excluded_from_reports" /><span>{tr("Exclude from reports")}</span></label>
      <button className="primary">+ {tr("Add")}</button>
    </form>,

    crypto: <form className="panel form asset-form" onSubmit={e => submit(e, "crypto")}>
      <h3>{tr("Crypto")}</h3>
      <Error error={crypto.error} />
      <input name="symbol" placeholder={tr("Coin code")} aria-label={tr("Coin code")} autoCapitalize="characters" required />
      <input name="quantity" placeholder={tr("Quantity")} inputMode="decimal" required value={cryptoQty} onChange={e => handleCryptoQtyChange(e.target.value)} />
      <div className="amount-row crypto-price-row">
        <MoneyInput value={cryptoPrice} onChange={handleCryptoPriceChange} placeholder={tr("Purchase price")} allowDecimal={cryptoCurrency === "USD"} required />
        <select name="purchase_currency" aria-label={tr("Currency")} value={cryptoCurrency} onChange={e => setCryptoCurrency(e.target.value as "VND" | "USD")}><option value="VND">VND</option><option value="USD">USD</option></select>
      </div>
      {cryptoCurrency === "USD" && <p className="quote-notice" role="status">{fx.isPending ? tr("Loading exchange rate…") : fx.isError || !fx.data ? tr("Exchange rate unavailable") : `${tr("Exchange rate")}: 1 USD ≈ ${fmtMoneyDisplay(fx.data.rate)} VND`}</p>}
      <div className="amount-row">
        <MoneyInput value={cryptoTotal} onChange={handleCryptoTotalChange} placeholder={tr("Total cost")} required />
        <span className="currency-badge">VND</span>
      </div>
      <DateRow name="date" value={cryptoDate} onChange={setCryptoDate} language={language} label="Purchase date" />
      <label className="checkbox-row"><input type="checkbox" name="excluded_from_reports" /><span>{tr("Exclude from reports")}</span></label>
      <button className="primary">+ {tr("Add")}</button>
    </form>,
  };

  const p = q.data;

  function refreshHoldings() {
    qc.invalidateQueries({ queryKey: ["portfolio"] });
    qc.invalidateQueries({ queryKey: ["metals"] });
    qc.invalidateQueries({ queryKey: ["crypto"] });
  }

  const liquidAccounts = (accountsQ.data ?? []).filter(a => a.is_active && a.account_type !== "CREDIT_CARD");

  return (
    <Section title="Assets" subtitle="Manage assets, investments, and net worth in one place.">
      <Loading show={q.isPending || accountsQ.isPending} />
      <Error error={q.error} />

      <AssetDashboard
        accounts={accountsQ.data ?? []}
        accountBalances={balances}
        savings={savingsQ.data ?? []}
        metals={metalsQ.data ?? []}
        crypto={cryptoQ.data ?? []}
        activeTab={tab}
        onSelectTab={setTab}
      />

      {tab === "liquid" && (
        <div className="liquid-accounts-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>{tr("Cash & Bank accounts")}</h3>
            <span className="hint">{liquidAccounts.length} {tr("Accounts")}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {liquidAccounts.length === 0 ? (
              <Empty show={true} text="No accounts yet." />
            ) : (
              liquidAccounts.map(a => {
                const bal = balances.get(a.id);
                return (
                  <div className="liquid-account-row" key={a.id}>
                    <div className="liquid-account-left">
                      <AccountLogo name={a.name} accountType={a.account_type} />
                      <div className="liquid-account-meta">
                        <span className="liquid-account-name">{a.name}</span>
                        <span className="liquid-account-type">{label(a.account_type)} · {a.currency}</span>
                      </div>
                    </div>
                    <div className="liquid-account-bal">
                      {fmtMoneyDisplay(bal) ?? "—"} {a.currency}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === "savings" && <SavingsPanel />}

      {tab === "metals" && (
        <>
          {forms.metals}
          <div className="asset-sections" style={{ marginTop: "18px" }}>
            <MetalsHoldingsTable
              metals={metalsQ.data ?? []}
              portfolioRows={p?.precious_metals ?? []}
              onEdit={m => setEditingMetal(m)}
              onDeleted={refreshHoldings}
            />
          </div>
        </>
      )}

      {tab === "crypto" && (
        <>
          {forms.crypto}
          <div className="asset-sections" style={{ marginTop: "18px" }}>
            <CryptoHoldingsTable
              crypto={cryptoQ.data ?? []}
              portfolioRows={p?.crypto ?? []}
              onEdit={c => setEditingCrypto(c)}
              onDeleted={refreshHoldings}
            />
          </div>
        </>
      )}

      {editingMetal && (
        <MetalEditModal
          holding={editingMetal}
          brands={brands.data ?? []}
          onDone={() => { setEditingMetal(null); refreshHoldings(); }}
          onCancel={() => setEditingMetal(null)}
        />
      )}

      {editingCrypto && (
        <CryptoEditModal
          holding={editingCrypto}
          onDone={() => { setEditingCrypto(null); refreshHoldings(); }}
          onCancel={() => setEditingCrypto(null)}
        />
      )}
    </Section>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { tr } = useI18n();
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal-panel${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={tr(title)}><div className="modal-header"><h3>{tr(title)}</h3><button type="button" className="modal-close" aria-label={tr("Close dialog")} onClick={onClose}>×</button></div><div className="modal-body">{children}</div></div></div>;
}

function sumMoney(values: (string | null | undefined)[]): string {
  const scaled = values.reduce((acc, raw) => {
    if (!raw) return acc;
    const negative = raw.trim().startsWith("-");
    const [whole, fraction = ""] = raw.replace("-", "").split(".");
    const amount = BigInt(whole || "0") * BigInt(10000) + BigInt((fraction + "0000").slice(0, 4) || "0000");
    return acc + (negative ? -amount : amount);
  }, BigInt(0));
  const negative = scaled < BigInt(0);
  const magnitude = negative ? -scaled : scaled;
  const whole = magnitude / BigInt(10000);
  const fraction = (magnitude % BigInt(10000)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? "." + fraction : ""}`;
}

// User report, 2026-08-26 ("tổng chi phí sẽ tính bằng giá mua nhân với số
// lượng, nếu mua bằng usd thì sẽ tự động nhân và chuyển sang vnd"): the
// crypto form needs exact decimal multiplication (price * quantity, and
// price * fx rate for a USD purchase) -- like every other money arithmetic
// helper in this file, this is BigInt digit-shifting, never
// Number()/float, so it can't introduce rounding error. Unlike sumMoney
// (which assumes a fixed 4-decimal money scale on every input), this
// multiplies two decimal strings of ANY precision (a quantity can have up
// to 8 decimals, an FX rate can have 2-6) by shifting each operand to an
// integer by its own decimal-place count, multiplying as BigInt, then
// placing the decimal point back at the sum of both shifts.
function mulDecimal(a: string, b: string): string {
  const parse = (raw: string) => {
    const trimmed = raw.trim();
    const negative = trimmed.startsWith("-");
    const [whole, frac = ""] = trimmed.replace(/^-/, "").split(".");
    const digits = (whole || "0") + frac;
    return { negative, digits: BigInt(digits.replace(/^0+(?=\d)/, "") || "0"), scale: frac.length };
  };
  const pa = parse(a);
  const pb = parse(b);
  const product = pa.digits * pb.digits;
  const scale = pa.scale + pb.scale;
  const negative = (pa.negative !== pb.negative) && product !== BigInt(0);
  const str = product.toString().padStart(scale + 1, "0");
  const whole = str.slice(0, str.length - scale) || "0";
  const frac = scale > 0 ? str.slice(str.length - scale) : "";
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

// User report, 2026-08-26: the crypto purchase price can be entered in
// either VND or USD; total cost is always price * quantity, and a USD
// price is additionally converted to VND first using the live rate from
// GET /api/v1/fx/usd-vnd (see app/api/fx.py). Everything the app stores is
// VND (no currency field anywhere else in the schema -- see the "VND cố
// định" decision in the account-currency work above), so this returns the
// VND-converted per-unit price and total the API actually expects; the
// USD amount the user typed is never sent anywhere.
function cryptoPurchaseTotals(
  quantity: string,
  price: string,
  currency: "VND" | "USD",
  fxRateToVnd: string | undefined,
): { unitPriceVnd: string; totalVnd: string } | null {
  if (!quantity || !price || isZeroMoney(quantity)) return null;
  if (currency === "VND") {
    return { unitPriceVnd: sumMoney([price]), totalVnd: sumMoney([mulDecimal(price, quantity)]) };
  }
  if (!fxRateToVnd) return null;
  const unitPriceVnd = sumMoney([mulDecimal(price, fxRateToVnd)]);
  return { unitPriceVnd, totalVnd: sumMoney([mulDecimal(unitPriceVnd, quantity)]) };
}

// User correction, 2026-08-26 ("sai rồi, tôi muốn được tự nhập mã của coin.
// chỉ tham chiếu giá của coin khi tính giá trị tài sản"): the coin identity
// is now typed by hand (e.g. "BTC"), not picked from a search popover. This
// does a best-effort, non-blocking background lookup against the existing
// coin-catalog search endpoint (GET /assets/crypto/coins, backed by
// CoinGecko) purely so a future live-price lookup at valuation time has a
// real coingecko_id to work with when the typed code matches a known coin.
// It must never gate recording the purchase: on no exact match, or on any
// network/catalog error, it falls back to the typed code verbatim so the
// user's purchase is always saved.
async function resolveCryptoIdentity(code: string): Promise<{ coingecko_id: string; symbol: string; display_name: string }> {
  const trimmed = code.trim();
  const fallback = { coingecko_id: trimmed.toLowerCase(), symbol: trimmed.toLowerCase(), display_name: trimmed.toUpperCase() };
  try {
    const matches = await api.assets.crypto.searchCoins(trimmed);
    const exact = matches.find(m => m.symbol.toLowerCase() === trimmed.toLowerCase());
    if (!exact) return fallback;
    return { coingecko_id: exact.id, symbol: exact.symbol, display_name: exact.name };
  } catch {
    return fallback;
  }
}

function negateMoney(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^-?0(\.0+)?$/.test(trimmed)) return trimmed;
  return trimmed.startsWith("-") ? trimmed.slice(1) : `-${trimmed}`;
}

function isZeroMoney(value: string): boolean {
  return /^-?0(\.0+)?$/.test(value.trim()) || value.trim() === "";
}

/** BUGFIX (reported: "tiền việt nam không có phần lẻ, hãy bỏ phần .0000 đi"):
 * every money amount from the API is a fixed-point Decimal string with
 * exactly 4 decimal places (see apps/api/app/core/money.py), so a plain
 * whole-VND amount like 50000 always serialises as "50000.0000" and was
 * being shown to the user with that literal ".0000" suffix. This trims
 * insignificant trailing zeros for display only -- reusing sumMoney's
 * exact BigInt arithmetic (summing a single value) rather than parsing as
 * a float, so it can never introduce rounding error and a genuine
 * fractional amount (e.g. prorated interest, "1234.5678") is shown in
 * full, not silently rounded away. `null`/`undefined`/`""` pass through
 * unchanged so existing `fmtMoney(x) ?? fallback` call sites keep working. */
function fmtMoney(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "") return value;
  return sumMoney([value]);
}

// User request, 2026-08-26 ("Hiển thị số tiền hãy thêm mặc định dấu chấm
// giữa 3 số, ví dụ 1000000 se được hiển thị là 1.000.000"): every money
// amount shown as read-only DISPLAY text (KPIs, list rows, detail panels)
// now groups whole-number digits with "." every 3 digits from the right.
// This must never touch an editable amount <input>'s controlled value --
// grouping punctuation fed back through the BigInt-based amount parsing in
// submit()/sumMoney() would corrupt it -- so fmtMoney() itself is left
// completely unchanged and still used as-is at every input-feeding call
// site (AccountAdjustForm's target input, Transactions' startEdit()
// pre-filling the composer). fmtMoneyDisplay() is a pure additional
// formatting layer on top of fmtMoney(), applied only where the result is
// rendered as plain text (or into a readOnly/disabled input used purely as
// a visual echo, e.g. the crypto form's computed Total cost preview).
function groupThousands(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return out;
}
function fmtMoneyDisplay(value: string | null | undefined): string | null | undefined {
  const normalized = fmtMoney(value);
  if (normalized == null || normalized === "") return normalized;
  const negative = normalized.startsWith("-");
  const [whole, frac] = normalized.replace("-", "").split(".");
  return `${negative ? "-" : ""}${groupThousands(whole)}${frac ? "," + frac : ""}`;
}

function formatMoneyInput(raw: string, allowDecimal = false): string {
  if (!raw) return "";
  const isNegative = raw.startsWith("-");
  if (allowDecimal) {
    const clean = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    const parts = clean.split(".");
    const intPart = parts[0] ? groupThousands(parts[0].replace(/\D/g, "")) : "0";
    const decPart = parts.length > 1 ? "," + parts.slice(1).join("").replace(/\D/g, "").slice(0, 4) : "";
    return `${isNegative ? "-" : ""}${intPart}${decPart}`;
  }
  // VND money: strictly integer without fractional decimals, grouped with dots every 3 digits
  const cleanDigits = raw.replace(/\D/g, "");
  if (!cleanDigits) return isNegative ? "-" : "";
  const unpadded = cleanDigits.replace(/^0+(?=\d)/, "");
  return `${isNegative ? "-" : ""}${groupThousands(unpadded)}`;
}

function parseMoneyInput(formatted: string, allowDecimal = false): string {
  if (!formatted) return "";
  const isNegative = formatted.startsWith("-");
  if (allowDecimal) {
    const clean = formatted.replace(/[^\d.,]/g, "").replace(",", ".");
    const parts = clean.split(".");
    const intPart = (parts[0] ?? "").replace(/\D/g, "");
    const decPart = parts.length > 1 ? "." + parts.slice(1).join("").replace(/\D/g, "").slice(0, 4) : "";
    return `${isNegative ? "-" : ""}${intPart}${decPart}`;
  }
  // VND money: strictly integer string
  const cleanDigits = formatted.replace(/\D/g, "");
  if (!cleanDigits) return "";
  const unpadded = cleanDigits.replace(/^0+(?=\d)/, "");
  return `${isNegative ? "-" : ""}${unpadded}`;
}

function MoneyInput({
  value,
  onChange,
  className = "amount-input",
  placeholder = "0",
  required = true,
  allowDecimal = false,
  name,
  id,
  autoFocus,
  readOnly,
  disabled,
  title,
}: {
  value: string;
  onChange: (unformatted: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  allowDecimal?: boolean;
  name?: string;
  id?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const displayVal = formatMoneyInput(value, allowDecimal);
  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      name={name}
      id={id}
      className={className}
      placeholder={placeholder}
      required={required}
      autoFocus={autoFocus}
      readOnly={readOnly}
      disabled={disabled}
      title={title}
      value={displayVal}
      onChange={e => {
        const raw = e.target.value;
        const unformatted = parseMoneyInput(raw, allowDecimal);
        onChange(unformatted);
      }}
    />
  );
}

const QUICK_EXPENSE_CATEGORIES = [
  { nameVi: "Ăn uống", nameEn: "Food", icon: "Utensils", match: ["ăn uống", "food", "ăn ngoài", "nhà hàng", "eating"] },
  { nameVi: "Cà phê & Đồ uống", nameEn: "Coffee & Drinks", icon: "Coffee", match: ["cà phê", "coffee", "đồ uống", "cafe", "trà sữa"] },
  { nameVi: "Đi chợ / Siêu thị", nameEn: "Groceries", icon: "Basket", match: ["đi chợ", "siêu thị", "groceries", "chợ", "market"] },
  { nameVi: "Mua sắm", nameEn: "Shopping", icon: "ShoppingBag", match: ["mua sắm", "shopping", "quần áo", "clothes"] },
  { nameVi: "Di chuyển / Xăng xe", nameEn: "Transportation", icon: "Fuel", match: ["di chuyển", "xăng", "transportation", "xe cộ", "fuel"] },
  { nameVi: "Hóa đơn & Tiện ích", nameEn: "Bills & Utilities", icon: "Bolt", match: ["hóa đơn", "tiện ích", "điện", "nước", "internet", "bills", "utilities"] },
  { nameVi: "Nhà cửa", nameEn: "Housing", icon: "Home", match: ["nhà cửa", "nhà ở", "tiền nhà", "home", "housing", "rent"] },
  { nameVi: "Giải trí", nameEn: "Entertainment", icon: "Play", match: ["giải trí", "entertainment", "xem phim", "game", "chơi"] },
  { nameVi: "Sức khỏe", nameEn: "Healthcare", icon: "Heart", match: ["sức khỏe", "thuốc", "khám", "health", "medical", "bệnh"] },
  { nameVi: "Học tập", nameEn: "Education", icon: "Book", match: ["học tập", "giáo dục", "sách", "education", "khóa học"] },
];

function QuickCategoryPills({
  categories,
  selectedCategoryId,
  onSelectCategory,
  language,
}: {
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  language: Language;
}) {
  const { tr } = useI18n();
  return (
    <div className="quick-categories-container">
      <span className="quick-categories-label">{tr("Quick categories")}</span>
      <div className="quick-category-pills" role="toolbar" aria-label={tr("Quick categories")}>
        {QUICK_EXPENSE_CATEGORIES.map(q => {
          const target = categories.find(c => {
            const lower = c.name.toLowerCase();
            return q.match.some(m => lower.includes(m.toLowerCase()));
          });
          const catId = target ? String(target.id) : "";
          const isActive = Boolean(catId && selectedCategoryId === catId);
          const labelText = language === "vi" ? q.nameVi : q.nameEn;
          return (
            <button
              key={q.nameVi}
              type="button"
              className={`quick-chip ${isActive ? "active" : ""}`}
              onClick={() => {
                if (catId) onSelectCategory(catId);
              }}
              title={labelText}
            >
              <CategoryIconBadge name={q.nameEn} icon={q.icon} size={20} iconSize={12} />
              <span>{labelText}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Bulk-fetch every account's balance under one query key, keyed off the id
 * set so it refetches when accounts are added/removed. Used wherever an
 * account list needs to show a live balance (Accounts page, credit-card
 * payment picker) without an N+1 request per render. */
function useAccountBalances(accounts: Account[] | undefined) {
  const ids = (accounts ?? []).map(a => a.id);
  const query = useQuery({
    queryKey: ["account-balances", ids.join(",")],
    queryFn: () => Promise.all(ids.map(id => api.accounts.balance(id))),
    enabled: ids.length > 0,
  });
  const balances = new Map<number, string>((query.data ?? []).map((b: AccountBalance) => [b.account_id, b.balance]));
  return { balances, isPending: ids.length > 0 && query.isPending, error: query.error };
}

function addMonthsLocal(dateText: string, months: number): string {
  if (!dateText || !Number.isFinite(months) || months <= 0) return "";
  const [y, m, d] = dateText.split("-").map(Number);
  if (!y || !m || !d) return "";
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function savingsStatusText(row: SavingsAccount): string {
  const term = row.current_term;
  if (!term || term.status === "CLOSED") return "Settled";
  if (term.status === "EARLY_CLOSED") return "Settled early";
  if (term.maturing_soon) return "Maturing soon";
  if (term.days_to_maturity != null && term.days_to_maturity < 0) return "Matured";
  return "Ongoing";
}

function savingsStatusClass(status: string): string {
  if (status === "Maturing soon") return "warning";
  if (status === "Matured") return "danger";
  if (status === "Settled" || status === "Settled early") return "muted";
  return "";
}

function SavingsPanel() {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const savingsQ = useQuery({ queryKey: ["savings"], queryFn: api.assets.savings.list });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const walletAccounts = (accountsQ.data ?? []).filter(a => a.account_type !== "CREDIT_CARD" && a.is_active);
  const rows = savingsQ.data ?? [];
  const openRows = rows.filter(r => r.status === "OPEN");
  const totalPrincipal = sumMoney(openRows.map(r => r.principal));
  const totalExpectedInterest = sumMoney(openRows.map(r => r.current_term?.expected_interest));
  const maturingSoonCount = openRows.filter(r => r.current_term?.maturing_soon).length;
  function refresh() { qc.invalidateQueries({ queryKey: ["savings"] }); qc.invalidateQueries({ queryKey: ["portfolio"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); }
  return <div className="savings-panel">
    <div className="savings-summary metrics-grid">
      <article className="panel"><h3>{tr("Total principal")}</h3><p className="metric">{fmtMoneyDisplay(totalPrincipal) || "0"}</p></article>
      <article className="panel"><h3>{tr("Expected interest")}</h3><p className="metric">{fmtMoneyDisplay(totalExpectedInterest) || "0"}</p></article>
      <article className="panel"><h3>{tr("Accounts maturing soon")}</h3><p className="metric">{maturingSoonCount}</p></article>
    </div>
    <div className="savings-toolbar"><button type="button" className="primary" onClick={() => setCreateOpen(true)}>+ {tr("Add savings account")}</button></div>
    <Error error={savingsQ.error} />
    <Loading show={savingsQ.isPending} />
    <Empty show={!savingsQ.isPending && rows.length === 0} text="No savings accounts yet." />
    <div className="savings-cards">{rows.map(row => {
      const status = savingsStatusText(row);
      return <button type="button" className="savings-card" key={row.id} onClick={() => setDetailId(row.id)}>
        <div className="savings-card-head"><strong>{row.institution}</strong><span className={`badge ${savingsStatusClass(status)}`}>{tr(status)}</span></div>
        <p className="savings-card-name">{row.name}</p>
        <p className="savings-card-principal">{fmtMoneyDisplay(row.principal)} {row.currency}</p>
        {row.current_term && <p className="savings-card-rate">{tr("Interest rate")}: {row.current_term.annual_rate}%/năm · {row.current_term.term_months} {tr("months")}</p>}
        {row.current_term && <p className="savings-card-dates">{row.current_term.start_date} → {row.current_term.maturity_date}</p>}
        {row.current_term?.status === "ACTIVE" && row.current_term.days_to_maturity != null && <p className="savings-card-countdown">{row.current_term.days_to_maturity >= 0 ? `${tr("Remaining")} ${row.current_term.days_to_maturity} ${tr("days")}` : tr("Matured")}</p>}
      </button>;
    })}</div>
    {createOpen && <Modal title="Add savings account" onClose={() => setCreateOpen(false)}>
      <SavingsCreateForm walletAccounts={walletAccounts} onDone={() => { setCreateOpen(false); refresh(); }} onCancel={() => setCreateOpen(false)} />
    </Modal>}
    {detailId != null && <SavingsDetailDialog id={detailId} walletAccounts={walletAccounts} onClose={() => setDetailId(null)} onChanged={refresh} />}
  </div>;
}

function SavingsCreateForm({ walletAccounts, onDone, onCancel }: { walletAccounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const { tr, label, language } = useI18n();
  const [openedDate, setOpenedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [termMonths, setTermMonths] = useState("12");
  const [principal, setPrincipal] = useState("");
  const create = useMutation({ mutationFn: (input: SavingsCreateInput) => api.assets.savings.create(input), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    create.mutate({
      institution: v("institution"), product_name: v("product_name") || undefined, name: v("name"),
      principal: principal || v("principal"), funding_account_id: Number(v("funding_account_id")), opened_date: openedDate || v("opened_date"),
      term_months: Number(v("term_months")), annual_rate: v("annual_rate"), non_term_rate: v("non_term_rate") || "0",
      interest_payment_method: v("interest_payment_method") as SavingsCreateInput["interest_payment_method"],
      maturity_action: v("maturity_action") as SavingsCreateInput["maturity_action"],
      notes: v("notes") || null,
      excluded_from_reports: f.get("excluded_from_reports") === "on",
    });
  }
  const previewMaturity = addMonthsLocal(openedDate, Number(termMonths));
  return <form className="form savings-form" onSubmit={submit}>
    <Error error={create.error} />
    <fieldset><legend>{tr("Bank / Institution")}</legend>
      <Field label="Institution"><input name="institution" list="bank-catalog-list" required /></Field>
      <datalist id="bank-catalog-list">{bankTemplates.map(bank => <option value={bank} key={bank} />)}</datalist>
      <Field label="Savings product"><input name="product_name" defaultValue="Tiết kiệm có kỳ hạn" /></Field>
      <Field label="Savings account name"><input name="name" required /></Field>
    </fieldset>
    <fieldset><legend>{tr("Deposit amount")}</legend>
      <Field label="Deposit amount"><div className="amount-row"><MoneyInput value={principal} onChange={setPrincipal} placeholder="0" required /><span className="currency-badge">VND</span></div></Field>
      <Field label="Source account"><select name="funding_account_id" required defaultValue="">
        <option value="" disabled>{tr("Select account")}</option>
        {walletAccounts.map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
      </select></Field>
      {walletAccounts.length === 0 && <p className="hint">{tr("No wallet accounts available. Create a cash, bank, or e-wallet account first.")}</p>}
      <Field label="Deposit date"><DateRow name="opened_date" value={openedDate} onChange={setOpenedDate} language={language} label="Deposit date" /></Field>
      <Field label="Term (months)"><input name="term_months" type="number" min={1} step={1} required value={termMonths} onChange={e => setTermMonths(e.target.value)} /></Field>
    </fieldset>
    <fieldset><legend>{tr("Interest rate")} &amp; {tr("Maturity date")}</legend>
      <Field label="Annual interest rate (%/year)"><input name="annual_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" required /></Field>
      <Field label="Demand interest rate (%/year)"><input name="non_term_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue="0" /></Field>
      <Field label="Interest payment method"><select name="interest_payment_method" defaultValue="AT_MATURITY">{(["AT_MATURITY", "UPFRONT", "PERIODIC"] as const).map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
      <Field label="Maturity date"><input value={previewMaturity} disabled readOnly /></Field>
      <Field label="On maturity"><select name="maturity_action" defaultValue="CLOSE">{(["CLOSE", "RENEW_PRINCIPAL", "RENEW_PRINCIPAL_AND_INTEREST"] as const).map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
    </fieldset>
    <fieldset><legend>{tr("Notes")}</legend><Field label="Notes"><input name="notes" /></Field>
      <label className="checkbox-row"><input type="checkbox" name="excluded_from_reports" /><span>{tr("Exclude from reports")}</span></label>
      <p className="hint">{tr("This asset won't be counted in income/expense summary reports.")}</p>
    </fieldset>
    <div className="form-actions"><Submit pending={create.isPending} text="Save savings account" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function SavingsDetailDialog({ id, walletAccounts, onClose, onChanged }: { id: number; walletAccounts: Account[]; onClose: () => void; onChanged: () => void }) {
  const { tr, label } = useI18n();
  const [action, setAction] = useState<"edit" | "close" | "early-close" | "renew" | null>(null);
  const detail = useQuery({ queryKey: ["savings", id], queryFn: () => api.assets.savings.get(id) });
  const qc = useQueryClient();
  function afterAction() { setAction(null); qc.invalidateQueries({ queryKey: ["savings", id] }); onChanged(); }
  const excludeToggle = useMutation({
    mutationFn: (excluded: boolean) => api.assets.savings.update(id, { excluded_from_reports: excluded }),
    onMutate: async (excluded: boolean) => {
      await qc.cancelQueries({ queryKey: ["savings", id] });
      const previous = qc.getQueryData<SavingsAccount>(["savings", id]);
      if (previous) qc.setQueryData(["savings", id], { ...previous, excluded_from_reports: excluded });
      return { previous };
    },
    onError: (_err, _vars, context) => { if (context?.previous) qc.setQueryData(["savings", id], context.previous); },
    onSettled: afterAction,
  });
  const row = detail.data;
  const term = row?.current_term;
  const canCloseNormal = !!term && term.status === "ACTIVE" && term.days_to_maturity != null && term.days_to_maturity <= 0;
  const canEarlyClose = !!term && term.status === "ACTIVE" && term.days_to_maturity != null && term.days_to_maturity > 0;
  const canRenew = !!term && term.status === "ACTIVE" && term.maturity_action !== "CLOSE";
  return <Modal title="Savings account details" onClose={onClose} wide>
    <Loading show={detail.isPending} />
    <Error error={detail.error} />
    {row && !action && <div className="savings-detail">
      <h3>{row.name}</h3>
      <dl className="savings-detail-grid">
        <div><dt>{tr("Institution")}</dt><dd>{row.institution}</dd></div>
        <div><dt>{tr("Savings product")}</dt><dd>{row.product_name}</dd></div>
        <div><dt>{tr("Current principal")}</dt><dd>{fmtMoneyDisplay(row.principal)} {row.currency}</dd></div>
        {term && <div><dt>{tr("Interest rate")}</dt><dd>{term.annual_rate}%/năm</dd></div>}
        {term && <div><dt>{tr("Deposit date")}</dt><dd>{term.start_date}</dd></div>}
        {term && <div><dt>{tr("Term (months)")}</dt><dd>{term.term_months}</dd></div>}
        {term && <div><dt>{tr("Maturity date")}</dt><dd>{term.maturity_date}</dd></div>}
        {term && term.status === "ACTIVE" && <div><dt>{tr("Expected interest")}</dt><dd>{fmtMoneyDisplay(term.expected_interest)}</dd></div>}
        {term && term.status === "ACTIVE" && term.expected_interest && <div><dt>{tr("Projected value at maturity")}</dt><dd>{fmtMoneyDisplay(sumMoney([row.principal, term.expected_interest]))}</dd></div>}
        <div><dt>{tr("On maturity")}</dt><dd>{term ? label(term.maturity_action) : "—"}</dd></div>
        <div><dt>{tr("Notes")}</dt><dd>{row.notes || "—"}</dd></div>
      </dl>
      <Error error={excludeToggle.error} />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={row.excluded_from_reports}
          disabled={excludeToggle.isPending}
          onChange={e => excludeToggle.mutate(e.target.checked)}
        />
        <span>{tr("Exclude from reports")}</span>
      </label>
      <div className="form-actions">
        {row.editable && <button type="button" className="secondary" onClick={() => setAction("edit")}>{tr("Edit")}</button>}
        {canCloseNormal && <button type="button" className="primary" onClick={() => setAction("close")}>{tr("Settle")}</button>}
        {canEarlyClose && <button type="button" className="secondary" onClick={() => setAction("early-close")}>{tr("Early settle")}</button>}
        {canRenew && <button type="button" className="secondary" onClick={() => setAction("renew")}>{tr("Renew")}</button>}
      </div>
      <h4>{tr("Term history")}</h4>
      <Empty show={(row.terms ?? []).length === 0} text="No terms recorded yet." />
      <div className="savings-term-history">{(row.terms ?? []).map(t => <div className="savings-term-row" key={t.id}>
        <strong>{tr("Term")} {t.sequence}</strong>
        <span>{t.start_date} - {t.maturity_date}</span>
        <span>{fmtMoneyDisplay(t.principal)} {row.currency}</span>
        <span>{t.annual_rate}%/năm</span>
        {t.actual_interest != null && <span>{tr("Actual interest received")}: {fmtMoneyDisplay(t.actual_interest)}</span>}
        <span className={`badge ${t.status === "ACTIVE" ? "" : "muted"}`}>{label(t.status)}</span>
      </div>)}</div>
    </div>}
    {row && action === "edit" && <SavingsEditForm row={row} onDone={afterAction} onCancel={() => setAction(null)} />}
    {row && action === "close" && <SavingsCloseForm id={row.id} kind="close" walletAccounts={walletAccounts} onDone={afterAction} onCancel={() => setAction(null)} />}
    {row && action === "early-close" && <SavingsCloseForm id={row.id} kind="early-close" walletAccounts={walletAccounts} onDone={afterAction} onCancel={() => setAction(null)} />}
    {row && action === "renew" && <SavingsRenewForm id={row.id} walletAccounts={walletAccounts} onDone={afterAction} onCancel={() => setAction(null)} />}
  </Modal>;
}

function SavingsEditForm({ row, onDone, onCancel }: { row: SavingsAccount; onDone: () => void; onCancel: () => void }) {
  const { tr, label, language } = useI18n();
  const term = row.current_term;
  const [openedDate, setOpenedDate] = useState(term?.start_date ?? todayIso());
  const patch = useMutation({ mutationFn: (input: SavingsPatchInput) => api.assets.savings.update(row.id, input), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    patch.mutate({
      institution: v("institution"), product_name: v("product_name"), name: v("name"),
      opened_date: openedDate || v("opened_date"), term_months: Number(v("term_months")),
      annual_rate: v("annual_rate"), non_term_rate: v("non_term_rate"),
      maturity_action: v("maturity_action") as SavingsPatchInput["maturity_action"],
      notes: v("notes") || null,
    });
  }
  return <form className="form savings-form" onSubmit={submit}>
    <Error error={patch.error} />
    <Field label="Institution"><input name="institution" defaultValue={row.institution} required /></Field>
    <Field label="Savings product"><input name="product_name" defaultValue={row.product_name} required /></Field>
    <Field label="Savings account name"><input name="name" defaultValue={row.name} required /></Field>
    <Field label="Deposit date"><DateRow name="opened_date" value={openedDate} onChange={setOpenedDate} language={language} label="Deposit date" /></Field>
    <Field label="Term (months)"><input name="term_months" type="number" min={1} step={1} defaultValue={term?.term_months} required /></Field>
    <Field label="Annual interest rate (%/year)"><input name="annual_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue={term?.annual_rate} required /></Field>
    <Field label="Demand interest rate (%/year)"><input name="non_term_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue={term?.non_term_rate} /></Field>
    <Field label="On maturity"><select name="maturity_action" defaultValue={term?.maturity_action ?? "CLOSE"}>{(["CLOSE", "RENEW_PRINCIPAL", "RENEW_PRINCIPAL_AND_INTEREST"] as const).map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
    <Field label="Notes"><input name="notes" defaultValue={row.notes ?? ""} /></Field>
    <div className="form-actions"><Submit pending={patch.isPending} text="Save changes" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function SavingsCloseForm({ id, kind, walletAccounts, onDone, onCancel }: { id: number; kind: "close" | "early-close"; walletAccounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const { tr, label, language } = useI18n();
  const [closedDate, setClosedDate] = useState(todayIso());
  const [actualInterest, setActualInterest] = useState("");
  const [fee, setFee] = useState("");
  const close = useMutation({
    mutationFn: (payload: { closed_date: string; receiving_account_id: number; actual_interest: string; fee?: string }) =>
      kind === "close" ? api.assets.savings.close(id, payload) : api.assets.savings.earlyClose(id, payload),
    onSuccess: onDone,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    close.mutate({ closed_date: closedDate || v("closed_date"), receiving_account_id: Number(v("receiving_account_id")), actual_interest: actualInterest || "0", fee: kind === "early-close" ? (fee || "0") : undefined });
  }
  return <form className="form savings-form" onSubmit={submit}>
    <Error error={close.error} />
    <Field label="Settlement date"><DateRow name="closed_date" value={closedDate} onChange={setClosedDate} language={language} label="Settlement date" /></Field>
    <Field label="Receiving account"><select name="receiving_account_id" required defaultValue="">
      <option value="" disabled>{tr("Select account")}</option>
      {walletAccounts.map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
    </select></Field>
    <Field label="Actual interest received"><div className="amount-row"><MoneyInput value={actualInterest} onChange={setActualInterest} placeholder="0" required /><span className="currency-badge">VND</span></div></Field>
    {kind === "early-close" && <Field label="Fee (optional)"><div className="amount-row"><MoneyInput value={fee} onChange={setFee} placeholder="0" required={false} /><span className="currency-badge">VND</span></div></Field>}
    <div className="form-actions"><Submit pending={close.isPending} text={kind === "close" ? "Settle" : "Early settle"} /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function SavingsRenewForm({ id, walletAccounts, onDone, onCancel }: { id: number; walletAccounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const { tr, label, language } = useI18n();
  const [startDate, setStartDate] = useState(todayIso());
  const [actualInterest, setActualInterest] = useState("");
  const renew = useMutation({ mutationFn: (payload: { start_date: string; actual_interest: string; receiving_account_id?: number }) => api.assets.savings.renew(id, payload), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    const receiving = v("receiving_account_id");
    renew.mutate({ start_date: startDate || v("start_date"), actual_interest: actualInterest || "0", receiving_account_id: receiving ? Number(receiving) : undefined });
  }
  return <form className="form savings-form" onSubmit={submit}>
    <Error error={renew.error} />
    <Field label="Renewal start date"><DateRow name="start_date" value={startDate} onChange={setStartDate} language={language} label="Renewal start date" /></Field>
    <Field label="Actual interest received"><div className="amount-row"><MoneyInput value={actualInterest} onChange={setActualInterest} placeholder="0" /><span className="currency-badge">VND</span></div></Field>
    <Field label="Receiving account"><select name="receiving_account_id" defaultValue="">
      <option value="">{tr("None")}</option>
      {walletAccounts.map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
    </select></Field>
    <div className="form-actions"><Submit pending={renew.isPending} text="Renew" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

// TASK-040: a short, human-readable tail describing what auto-apply did
// with a batch's rows -- shared by the upload status line and the Review
// page's manual "Apply" action so both report the same way.
function applySummary(tr: (text: string) => string, apply: ImportApplyResult | null | undefined): string {
  if (!apply) return "";
  const parts = [`${tr("applied")} ${apply.applied_rows}/${apply.total_rows}`];
  if (apply.unmatched_row_count > 0) {
    const wallets = Object.keys(apply.unmatched_wallets).join(", ");
    parts.push(`${apply.unmatched_row_count} ${tr("rows with unmatched wallet")} (${wallets})`);
  }
  if (apply.invalid_rows.length > 0) parts.push(`${apply.invalid_rows.length} ${tr("invalid rows")}`);
  return ` — ${parts.join("; ")}`;
}
function DataPage() {
  const { tr, label } = useI18n();
  const qc = useQueryClient();
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  // BUGFIX (user report, 2026-08-26: "Chức năng xuất dữ liệu: Lựa chọn tài
  // khoản, ngày bắt đầu, ngày kết thúc"): export used to be two bare links
  // dumping every ledger entry with no way to scope them. All three filters
  // are optional (see app/api/data.py's _export_rows) so leaving them unset
  // still exports everything, same as before.
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const [exportAccountId, setExportAccountId] = useState("");
  const [exportStart, setExportStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
  });
  const [exportEnd, setExportEnd] = useState(() => todayIso());
  function exportUrl(kind: "csv" | "xlsx"): string {
    const params = new URLSearchParams();
    if (exportAccountId) params.set("account_id", exportAccountId);
    if (exportStart) params.set("start_date", exportStart);
    if (exportEnd) params.set("end_date", exportEnd);
    const qs = params.toString();
    return `${base}/api/v1/exports/events.${kind}${qs ? `?${qs}` : ""}`;
  }
  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setStatus(tr("Uploading..."));
    try {
      // TASK-038: fetch() Headers values must be Latin-1/ByteString -- a
      // real Money Lover export filename with Vietnamese diacritics (e.g.
      // "...Tổng cộng...xlsx") makes the browser throw synchronously right
      // here, before any request is sent. Because that throw used to
      // happen outside any try/catch, the click did nothing visible at all
      // ("bấm tải lên không phản hồi"). encodeURIComponent keeps the
      // header ASCII-safe; the backend unquotes it back to the real name.
      const response = await fetch(`${base}/api/v1/imports/money-lover`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(file.name) },
        body: await file.arrayBuffer(),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body) {
        // TASK-040: the upload now pushes matching rows straight into the
        // ledger in the same request (see app.api.data.import_money_lover),
        // so surface that outcome here instead of just "rows imported" --
        // and refresh every view the newly-created events/balances affect.
        setStatus(`${tr("Imported rows")}: ${body.row_count}${applySummary(tr, body.apply)}`);
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["portfolio"] });
        qc.invalidateQueries({ queryKey: ["account-balances"] });
        qc.invalidateQueries({ queryKey: ["imports"] });
      } else {
        setStatus(body?.detail ?? `${tr("Load failed")} (HTTP ${response.status})`);
      }
    } catch (error) {
      // NOTE: this file also declares a component named `Error` (see the
      // `Error` panel component below), which shadows the global `Error`
      // class within this file -- `instanceof Error` here would narrow
      // against that component instead, so `globalThis.Error` is used
      // explicitly to reach the real built-in.
      const message = error instanceof globalThis.Error ? error.message : String(error);
      setStatus(`${tr("Load failed")}: ${message}`);
    } finally {
      setUploading(false);
    }
  }
  return <Section title="Data" subtitle="Import and export personal finance records."><div className="panel data-workflow"><h3>{tr("Import from Money Lover")}</h3><input type="file" accept=".csv,.xlsx" aria-label={tr("Choose file")} onChange={e => setFile(e.target.files?.[0] ?? null)}/><button type="button" className="primary" disabled={!file || uploading} onClick={upload}>{uploading ? tr("Uploading...") : tr("Upload for review")}</button>{status && <p className="hint" role="status">{status}</p>}<p className="hint">{tr("Matching rows are applied straight into your ledger on upload; unmatched wallets are reported so you can fix and re-apply from the Review page.")}</p></div>
    <div className="panel data-workflow"><h3>{tr("Export filters")}</h3>
      <Field label="Account"><select aria-label={tr("Account")} value={exportAccountId} onChange={e => setExportAccountId(e.target.value)}>
        <option value="">{tr("All accounts")}</option>
        {(accountsQ.data ?? []).map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
      </select></Field>
      <Field label="Start date"><input type="date" aria-label={tr("Start date")} value={exportStart} onChange={e => setExportStart(e.target.value)} max={exportEnd || undefined} /></Field>
      <Field label="End date"><input type="date" aria-label={tr("End date")} value={exportEnd} onChange={e => setExportEnd(e.target.value)} min={exportStart || undefined} /></Field>
      <div className="form-actions"><a className="secondary" href={exportUrl("csv")}>{tr("Export CSV")}</a><a className="secondary" href={exportUrl("xlsx")}>{tr("Export XLSX")}</a></div>
    </div>
  </Section>;
}

function Review() {
  const { label, tr } = useI18n();
  const qc = useQueryClient();
  const [applyStatus, setApplyStatus] = useState<Record<number, string>>({});
  const imports = useQuery({ queryKey: ["imports"], queryFn: api.imports.list }); const reconciliation = useQuery({ queryKey: ["reconciliation"], queryFn: api.reconciliation.list });
  // TASK-040: pushes a batch's not-yet-applied rows into the ledger without
  // re-uploading -- how an already-existing batch (imported before this
  // feature shipped) or one with previously-unmatched wallets (since fixed)
  // gets applied. Idempotent, so pressing it again on a fully-applied batch
  // is harmless.
  const apply = useMutation({
    mutationFn: (batchId: number) => api.imports.apply(batchId),
    onSuccess: (result, batchId) => {
      setApplyStatus(prev => ({ ...prev, [batchId]: applySummary(tr, result) }));
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
    },
    onError: (error, batchId) => {
      const message = error instanceof globalThis.Error ? error.message : String(error);
      setApplyStatus(prev => ({ ...prev, [batchId]: `${tr("Load failed")}: ${message}` }));
    },
  });
  return <Section title="Import & reconciliation review" subtitle="Persisted import batches and reconciliation candidates."><div className="review-grid"><article className="panel"><h3>{tr("Import batches")}</h3><Loading show={imports.isPending}/><Error error={imports.error}/><Empty show={!imports.isPending && imports.data?.length === 0} text="No import batches yet."/>{imports.data?.map(x => <div className="review-row" key={x.id}><div><strong>{x.original_filename}</strong><small>{x.source} · {x.row_count} {tr("rows")} · {x.applied_row_count >= x.row_count ? tr("Applied") : `${x.applied_row_count}/${x.row_count} ${tr("applied")}`}</small>{applyStatus[x.id] && <small className="hint">{applyStatus[x.id]}</small>}</div><div className="review-row-actions"><small>{x.imported_at}</small><button type="button" className="secondary" disabled={apply.isPending && apply.variables === x.id} onClick={() => apply.mutate(x.id)}>{apply.isPending && apply.variables === x.id ? tr("Applying...") : x.applied_row_count >= x.row_count ? tr("Re-apply") : tr("Apply")}</button></div></div>)}</article><article className="panel"><h3>{tr("Reconciliation candidates")}</h3><Loading show={reconciliation.isPending}/><Error error={reconciliation.error}/><Empty show={!reconciliation.isPending && reconciliation.data?.length === 0} text="No reconciliation candidates yet."/>{reconciliation.data?.map(x => <div className="review-row" key={x.id}><div><strong>{tr("Raw row")} #{x.source_row_number}</strong><small>{x.transaction_date} · {label(x.event_type)} · {tr("Event")} #{x.financial_event_id}</small></div><span className="badge warning">{label(x.state)}</span></div>)}</article></div></Section>;
}

type TimeScope = "ALL" | "YEAR" | "QUARTER" | "MONTH" | "WEEK" | "DAY" | "CUSTOM";

function AccountPeriodTransactionsModal({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const { tr, language } = useI18n();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);

  const [scope, setScope] = useState<TimeScope>("YEAR");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(currentQuarter);
  const [selectedWeek, setSelectedWeek] = useState<number>(Math.min(5, Math.ceil(now.getDate() / 7)));
  const [selectedDay, setSelectedDay] = useState<string>(todayIso());
  const [customStart, setCustomStart] = useState<string>(`${currentYear}-${pad2(currentMonth)}-01`);
  const [customEnd, setCustomEnd] = useState<string>(todayIso());

  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: api.events.list });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: api.categories.list });

  const { start, end } = (() => {
    if (scope === "ALL") return { start: "1970-01-01", end: "2099-12-31" };
    if (scope === "YEAR") return { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31` };
    if (scope === "QUARTER") {
      const startM = (selectedQuarter - 1) * 3 + 1;
      const endM = selectedQuarter * 3;
      const lastD = new Date(selectedYear, endM, 0).getDate();
      return {
        start: `${selectedYear}-${pad2(startM)}-01`,
        end: `${selectedYear}-${pad2(endM)}-${pad2(lastD)}`,
      };
    }
    if (scope === "MONTH") {
      const lastD = new Date(selectedYear, selectedMonth, 0).getDate();
      return {
        start: `${selectedYear}-${pad2(selectedMonth)}-01`,
        end: `${selectedYear}-${pad2(selectedMonth)}-${pad2(lastD)}`,
      };
    }
    if (scope === "WEEK") {
      const startD = (selectedWeek - 1) * 7 + 1;
      const maxD = new Date(selectedYear, selectedMonth, 0).getDate();
      const endD = Math.min(selectedWeek * 7, maxD);
      return {
        start: `${selectedYear}-${pad2(selectedMonth)}-${pad2(startD)}`,
        end: `${selectedYear}-${pad2(selectedMonth)}-${pad2(endD)}`,
      };
    }
    if (scope === "DAY") {
      return { start: selectedDay, end: selectedDay };
    }
    return { start: customStart || "1970-01-01", end: customEnd || "2099-12-31" };
  })();

  const filteredEvents = (eventsQuery.data ?? [])
    .filter(
      ev =>
        ev.transaction_date >= start &&
        ev.transaction_date <= end &&
        ev.entries.some(e => e.account_id === account.id),
    )
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id);

  let totalIn = "0";
  let totalOut = "0";
  let net = "0";

  for (const ev of filteredEvents) {
    const entry = ev.entries.find(e => e.account_id === account.id);
    if (!entry) continue;
    net = sumMoney([net, entry.amount]);
    if (entry.amount.startsWith("-")) {
      totalOut = sumMoney([totalOut, negateMoney(entry.amount)]);
    } else {
      totalIn = sumMoney([totalIn, entry.amount]);
    }
  }

  const scopes: { id: TimeScope; labelVi: string; labelEn: string }[] = [
    { id: "ALL", labelVi: "Tất cả", labelEn: "All" },
    { id: "YEAR", labelVi: "Năm", labelEn: "Year" },
    { id: "QUARTER", labelVi: "Quý", labelEn: "Quarter" },
    { id: "MONTH", labelVi: "Tháng", labelEn: "Month" },
    { id: "WEEK", labelVi: "Tuần", labelEn: "Week" },
    { id: "DAY", labelVi: "Ngày", labelEn: "Day" },
    { id: "CUSTOM", labelVi: "Khoảng thời gian", labelEn: "Custom range" },
  ];

  const yearsList = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];

  return (
    <Modal title={`${account.name} — ${tr("All transactions in")}`} onClose={onClose} wide>
      <div className="account-year-modal">
        <div className="time-filter-section">
          <div className="time-scope-row">
            {scopes.map(s => {
              const isSel = scope === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`time-scope-chip ${isSel ? "active" : ""}`}
                  onClick={() => setScope(s.id)}
                >
                  <span style={{ fontSize: "0.85em" }}>{isSel ? "✓" : "○"}</span>
                  <span>{language === "vi" ? s.labelVi : s.labelEn}</span>
                </button>
              );
            })}
          </div>

          {scope === "YEAR" && (
            <div className="time-period-tabs-wrap">
              {yearsList.map(y => (
                <button
                  key={y}
                  type="button"
                  className={`time-period-tab ${selectedYear === y ? "active" : ""}`}
                  onClick={() => setSelectedYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {scope === "QUARTER" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button type="button" className="date-nav" onClick={() => setSelectedYear(y => y - 1)}>‹</button>
                <strong style={{ fontSize: "0.9rem" }}>{selectedYear}</strong>
                <button type="button" className="date-nav" onClick={() => setSelectedYear(y => y + 1)}>›</button>
              </div>
              <div className="time-period-tabs-wrap">
                {[1, 2, 3, 4].map(q => (
                  <button
                    key={q}
                    type="button"
                    className={`time-period-tab ${selectedQuarter === q ? "active" : ""}`}
                    onClick={() => setSelectedQuarter(q)}
                  >
                    {language === "vi" ? `Quý ${q}` : `Q${q}`} ({`${(q - 1) * 3 + 1}-${q * 3}`})
                  </button>
                ))}
              </div>
            </div>
          )}

          {scope === "MONTH" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button type="button" className="date-nav" onClick={() => setSelectedYear(y => y - 1)}>‹</button>
                <strong style={{ fontSize: "0.9rem" }}>{selectedYear}</strong>
                <button type="button" className="date-nav" onClick={() => setSelectedYear(y => y + 1)}>›</button>
              </div>
              <div className="time-period-tabs-wrap">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`time-period-tab ${selectedMonth === m ? "active" : ""}`}
                    onClick={() => setSelectedMonth(m)}
                  >
                    {language === "vi" ? `Thg ${m}` : `M${m}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {scope === "WEEK" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button type="button" className="date-nav" onClick={() => setSelectedYear(y => y - 1)}>‹</button>
                <strong style={{ fontSize: "0.9rem" }}>{selectedYear} - Thg {selectedMonth}</strong>
                <button type="button" className="date-nav" onClick={() => setSelectedYear(y => y + 1)}>›</button>
              </div>
              <div className="time-period-tabs-wrap">
                {[1, 2, 3, 4, 5].map(w => (
                  <button
                    key={w}
                    type="button"
                    className={`time-period-tab ${selectedWeek === w ? "active" : ""}`}
                    onClick={() => setSelectedWeek(w)}
                  >
                    {language === "vi" ? `Tuần ${w}` : `W${w}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {scope === "DAY" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div className="time-period-tabs-wrap">
                <button
                  type="button"
                  className={`time-period-tab ${selectedDay === todayIso() ? "active" : ""}`}
                  onClick={() => setSelectedDay(todayIso())}
                >
                  {language === "vi" ? "Hôm nay" : "Today"}
                </button>
                <button
                  type="button"
                  className={`time-period-tab ${selectedDay === shiftIsoDate(todayIso(), -1) ? "active" : ""}`}
                  onClick={() => setSelectedDay(shiftIsoDate(todayIso(), -1))}
                >
                  {language === "vi" ? "Hôm qua" : "Yesterday"}
                </button>
              </div>
              <DateRow value={selectedDay} onChange={setSelectedDay} language={language} label="Choose date" />
            </div>
          )}

          {scope === "CUSTOM" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", width: "100%" }}>
              <div className="field">
                <label style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px", display: "block", color: "var(--text)" }}>{tr("Start date")}</label>
                <DateRow value={customStart} onChange={setCustomStart} language={language} label="Start date" />
              </div>
              <div className="field">
                <label style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px", display: "block", color: "var(--text)" }}>{tr("End date")}</label>
                <DateRow value={customEnd} onChange={setCustomEnd} language={language} label="End date" />
              </div>
            </div>
          )}
        </div>

        <div className="account-year-stats">
          <div className="account-year-stat">
            <span>{tr("Total income")}</span>
            <strong className="positive">+{fmtMoneyDisplay(totalIn)} {account.currency}</strong>
          </div>
          <div className="account-year-stat">
            <span>{tr("Total expense")}</span>
            <strong className="negative">-{fmtMoneyDisplay(totalOut)} {account.currency}</strong>
          </div>
          <div className="account-year-stat">
            <span>{tr("Net change")}</span>
            <strong className={net.startsWith("-") ? "negative" : "positive"}>
              {net.startsWith("-") ? "" : "+"}{fmtMoneyDisplay(net)} {account.currency}
            </strong>
          </div>
        </div>

        <Loading show={eventsQuery.isPending} />
        <Empty show={!eventsQuery.isPending && filteredEvents.length === 0} text="No transactions in this period." />

        <div className="account-year-list">
          {filteredEvents.map(ev => {
            const entry = ev.entries.find(e => e.account_id === account.id);
            if (!entry) return null;
            const cat = categoriesQuery.data?.find(c => c.id === ev.category_id);
            const isNeg = entry.amount.startsWith("-");
            return (
              <div className="account-year-row" key={ev.id}>
                <div className="account-year-row-left">
                  <CategoryIconBadge name={cat?.name ?? ev.event_type} icon={cat?.icon} size={34} />
                  <div className="account-year-row-meta">
                    <span className="account-year-row-cat">{cat ? categoryLabel(language, cat.name) : tr(ev.event_type)}</span>
                    <span className="account-year-row-date">{ev.transaction_date}</span>
                    {ev.note && <span className="account-year-row-note">{ev.note}</span>}
                  </div>
                </div>
                <div className={`account-year-row-amount ${isNeg ? "negative" : "positive"}`}>
                  {isNeg ? "" : "+"}{fmtMoneyDisplay(entry.amount)} {account.currency}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function Accounts() {
  const { label, tr } = useI18n();
  const qc = useQueryClient();
  const [formTarget, setFormTarget] = useState<"new" | Account | null>(null);
  const [adjusting, setAdjusting] = useState<Account | null>(null);
  const [selectedAccountForTxns, setSelectedAccountForTxns] = useState<Account | null>(null);
  const query = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const balances = useAccountBalances(query.data);
  const toggle = useMutation({ mutationFn: (account: Account) => api.accounts.update(account.id, { is_active: !account.is_active }), onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }) });
  const move = useMutation({
    mutationFn: ({ a, b }: { a: Account; b: Account }) => Promise.all([api.accounts.update(a.id, { sort_order: b.sort_order }), api.accounts.update(b.id, { sort_order: a.sort_order })]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
  function moveBy(index: number, delta: number) {
    const list = query.data ?? [];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    move.mutate({ a: list[index], b: list[target] });
  }
  function refresh() { qc.invalidateQueries({ queryKey: ["accounts"] }); qc.invalidateQueries({ queryKey: ["account-balances"] }); qc.invalidateQueries({ queryKey: ["portfolio"] }); qc.invalidateQueries({ queryKey: ["events"] }); }
  return <Section title="Accounts" subtitle="Create, edit, or deactivate the accounts used by ledger entries. Order here also sets the order accounts appear in when recording a transaction.">
    <div className="savings-toolbar"><button type="button" className="primary" onClick={() => setFormTarget("new")}>+ {tr("Add account")}</button></div>
    <Error error={query.error ?? toggle.error ?? balances.error ?? move.error} />
    <Loading show={query.isPending} />
    <Empty show={!query.isPending && query.data?.length === 0} text="No accounts yet." />
    <div className="cards">{query.data?.map((x, i) => {
      const bal = balances.balances.get(x.id);
      const isCreditCard = x.account_type === "CREDIT_CARD";
      const brand = getAccountBrand(x.name, x.account_type);
      return <article
        className={`account-card-clickable ${isCreditCard ? "account-card-credit" : "account-card-bank"} ${!x.is_active ? "inactive" : ""}`}
        key={x.id}
        style={{
          "--brand-color": brand.primaryColor,
          "--brand-gradient": brand.gradient,
          "--brand-tint": brand.cardBgTint,
          borderTop: `4px solid ${brand.primaryColor}`,
        } as React.CSSProperties}
        onClick={e => {
          if ((e.target as HTMLElement).closest("button")) return;
          setSelectedAccountForTxns(x);
        }}
        title="Bấm để xem toàn bộ giao dịch của tài khoản"
      >
        <div className="account-card-brand-bar" style={{ background: brand.gradient }} />
        <div className="account-card-header">
          <span className="account-name">
            <AccountLogo name={x.name} accountType={x.account_type} size={36} />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <strong style={{ fontSize: "0.95rem" }}>{x.name}</strong>
              <span className="account-card-type-tag" style={{ color: brand.primaryColor }}>
                {label(x.account_type)} · {x.currency}
              </span>
            </div>
          </span>
          <Status active={x.is_active} />
        </div>

        <p className="account-balance" style={{ marginTop: "4px" }}>
          {tr(isCreditCard ? "Initial debt" : "Current balance")}:{" "}
          <strong style={{ color: isCreditCard ? "#dc2626" : undefined }}>
            {fmtMoneyDisplay(bal) ?? (balances.isPending ? "…" : "—")} {x.currency}
          </strong>
        </p>

        {isCreditCard && x.credit_limit && <div className="account-credit-info">
          <div className="account-credit-row">
            <span>{tr("Credit limit")}:</span>
            <strong>{fmtMoneyDisplay(x.credit_limit)} VND</strong>
          </div>
          {bal != null && <div className="account-credit-row">
            <span>{tr("Available credit")}:</span>
            <strong className="positive">{fmtMoneyDisplay(sumMoney([x.credit_limit, bal]))} VND</strong>
          </div>}
        </div>}

        <div className="card-actions" onClick={e => e.stopPropagation()}>
          <button type="button" className="text-button" aria-label={tr("Move up")} disabled={move.isPending || i === 0} onClick={() => moveBy(i, -1)}>↑</button>
          <button type="button" className="text-button" aria-label={tr("Move down")} disabled={move.isPending || i === (query.data?.length ?? 0) - 1} onClick={() => moveBy(i, 1)}>↓</button>
          <button type="button" className="text-button" onClick={() => setFormTarget(x)}>{tr("Edit")}</button>
          <button type="button" className="text-button" onClick={() => setAdjusting(x)}>{tr("Adjust balance")}</button>
          <button type="button" className="text-button" disabled={toggle.isPending} onClick={() => toggle.mutate(x)}>{tr(x.is_active ? "Deactivate" : "Activate")}</button>
        </div>
      </article>;
    })}</div>
    {formTarget != null && <Modal title={formTarget === "new" ? "Add account" : "Edit account"} onClose={() => setFormTarget(null)}>
      <AccountFormDialog editing={formTarget === "new" ? null : formTarget} onDone={() => { setFormTarget(null); refresh(); }} onCancel={() => setFormTarget(null)} />
    </Modal>}
    {adjusting && <Modal title="Adjust balance" onClose={() => setAdjusting(null)}>
      <AccountAdjustForm account={adjusting} currentBalance={balances.balances.get(adjusting.id) ?? "0"} onDone={() => { setAdjusting(null); refresh(); }} onCancel={() => setAdjusting(null)} />
    </Modal>}
    {selectedAccountForTxns && <AccountPeriodTransactionsModal account={selectedAccountForTxns} onClose={() => setSelectedAccountForTxns(null)} />}
  </Section>;
}

function BankPickerDropdown({
  selected,
  onSelect,
  accountType = "BANK",
}: {
  selected: string;
  onSelect: (name: string) => void;
  accountType?: AccountType;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const otherBank = bankCatalog[bankCatalog.length - 1];
  const query = search.trim().toLowerCase();

  const filtered = bankCatalog.filter(b => {
    if (!query) return true;
    return (
      b.name.toLowerCase().includes(query) ||
      b.key.toLowerCase().includes(query) ||
      b.aliases.some(a => a.toLowerCase().includes(query))
    );
  });

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        className="bank-picker-trigger"
        onClick={() => setOpen(o => !o)}
      >
        {selected ? (
          <>
            <AccountLogo name={selected} accountType={accountType} size={24} />
            <strong>{selected}</strong>
          </>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: "0.86rem" }}>{tr("Choose bank")}...</span>
        )}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="bank-picker-popover">
          <div className="bank-picker-search">
            <input
              type="text"
              placeholder="Tìm ngân hàng (VD: VCB, Techcom, MB)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="bank-picker-list">
            {bankCategoryOrder.map(cat => {
              const banksInCat = filtered.filter(b => b.category === cat && b.key !== "other");
              if (banksInCat.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="bank-picker-group-title">{bankCategoryLabel[cat]}</div>
                  {banksInCat.map(b => {
                    const isSel = selected === b.name;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={`bank-picker-item ${isSel ? "selected" : ""}`}
                        onClick={() => {
                          onSelect(b.name);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <AccountLogo name={b.name} accountType={accountType} size={24} />
                        <div className="bank-picker-item-info">
                          <span className="bank-picker-item-name">{b.name}</span>
                        </div>
                        {isSel && <span className="bank-picker-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {(query ? filtered.some(b => b.key === "other") : true) && (
              <div>
                <div className="bank-picker-group-title">Khác</div>
                <button
                  type="button"
                  className={`bank-picker-item ${selected === otherBank.name ? "selected" : ""}`}
                  onClick={() => {
                    onSelect(otherBank.name);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <AccountLogo name={otherBank.name} accountType={accountType} size={24} />
                  <div className="bank-picker-item-info">
                    <span className="bank-picker-item-name">{otherBank.name}</span>
                  </div>
                  {selected === otherBank.name && <span className="bank-picker-check">✓</span>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EWalletPickerDropdown({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = ewalletCatalog.filter(w => {
    if (!query) return true;
    return w.name.toLowerCase().includes(query) || w.key.toLowerCase().includes(query);
  });

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        className="bank-picker-trigger"
        onClick={() => setOpen(o => !o)}
      >
        {selected ? (
          <>
            <AccountLogo name={selected} accountType="EWALLET" size={24} />
            <strong>{selected}</strong>
          </>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: "0.86rem" }}>{tr("Choose e-wallet")}...</span>
        )}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="bank-picker-popover">
          <div className="bank-picker-search">
            <input
              type="text"
              placeholder="Tìm ví (VD: MoMo, ZaloPay, Viettel)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="bank-picker-list">
            {filtered.map(w => {
              const isSel = selected === w.name;
              return (
                <button
                  key={w.key}
                  type="button"
                  className={`bank-picker-item ${isSel ? "selected" : ""}`}
                  onClick={() => {
                    onSelect(w.name);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <AccountLogo name={w.name} accountType="EWALLET" size={24} />
                  <div className="bank-picker-item-info">
                    <span className="bank-picker-item-name">{w.name}</span>
                  </div>
                  {isSel && <span className="bank-picker-check">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function parseAccountInfo(account: Account | null) {
  if (!account) {
    return {
      type: "CASH" as AccountType,
      bankName: "Techcombank",
      walletName: "MoMo",
      nickname: "",
      customName: "",
      creditLimit: "",
    };
  }

  const type = account.account_type;
  const name = account.name;
  let bankName = "";
  let walletName = "";
  let nickname = "";
  const customName = name;

  if (type === "BANK" || type === "CREDIT_CARD") {
    const match = name.match(/^(.+?)\s*\((.+)\)$/);
    if (match) {
      const bCandidate = match[1].trim();
      nickname = match[2].trim();
      const found = bankCatalog.find(b => b.name.toLowerCase() === bCandidate.toLowerCase() || b.key.toLowerCase() === bCandidate.toLowerCase());
      bankName = found ? found.name : bCandidate;
    } else {
      const brand = getAccountBrand(name, type);
      const found = bankCatalog.find(b => b.key.toLowerCase() === brand.key.toLowerCase() || b.name.toLowerCase() === brand.name.toLowerCase());
      if (found) {
        bankName = found.name;
        const clean = name.replace(new RegExp(found.name, "i"), "").replace(new RegExp(brand.shortLabel, "i"), "").trim();
        nickname = clean;
      } else {
        bankName = name;
      }
    }
  } else if (type === "EWALLET") {
    const match = name.match(/^(.+?)\s*\((.+)\)$/);
    if (match) {
      const wCandidate = match[1].trim();
      nickname = match[2].trim();
      const found = ewalletCatalog.find(w => w.name.toLowerCase() === wCandidate.toLowerCase() || w.key.toLowerCase() === wCandidate.toLowerCase());
      walletName = found ? found.name : wCandidate;
    } else {
      const brand = getAccountBrand(name, type);
      const found = ewalletCatalog.find(w => w.key.toLowerCase() === brand.key.toLowerCase() || w.name.toLowerCase() === brand.name.toLowerCase());
      if (found) {
        walletName = found.name;
        nickname = name.replace(new RegExp(found.name, "i"), "").trim();
      } else {
        walletName = name;
      }
    }
  }

  return {
    type,
    bankName: bankName || "Techcombank",
    walletName: walletName || "MoMo",
    nickname,
    customName,
    creditLimit: account.credit_limit ? fmtMoney(account.credit_limit) ?? "" : "",
  };
}

function AccountFormDialog({ editing, onDone, onCancel }: { editing: Account | null; onDone: () => void; onCancel: () => void }) {
  const { tr, label } = useI18n();
  const initial = useMemo(() => parseAccountInfo(editing), [editing]);
  const [type, setType] = useState<AccountType>(initial.type);
  const [initialBalance, setInitialBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState(initial.creditLimit);
  const [selectedBankName, setSelectedBankName] = useState(initial.bankName);
  const [selectedWallet, setSelectedWallet] = useState(initial.walletName);
  const [nickname, setNickname] = useState(initial.nickname);
  const [customName, setCustomName] = useState(initial.customName);
  const needsBankSelect = type === "BANK" || type === "CREDIT_CARD";
  const isEWallet = type === "EWALLET";

  const previewName = needsBankSelect
    ? (nickname.trim() ? `${selectedBankName} (${nickname.trim()})` : selectedBankName)
    : isEWallet
    ? (nickname.trim() ? `${selectedWallet} (${nickname.trim()})` : selectedWallet)
    : (customName || "Tiền mặt");
  const previewBrand = getAccountBrand(previewName, type);

  const save = useMutation({
    mutationFn: async (input: { id?: number; name: string; account_type: AccountType; currency: string; initialBalance?: string; credit_limit?: string | null }) => {
      if (input.id) {
        return api.accounts.update(input.id, {
          name: input.name,
          account_type: input.account_type,
          currency: input.currency,
          credit_limit: input.credit_limit,
        });
      }
      const account = await api.accounts.create({
        name: input.name,
        account_type: input.account_type,
        currency: input.currency,
        credit_limit: input.credit_limit,
      });
      if (input.initialBalance && !isZeroMoney(input.initialBalance)) {
        const signedAmount = input.account_type === "CREDIT_CARD" ? negateMoney(input.initialBalance.replace(/^-/, "")) : input.initialBalance;
        const noteText = input.account_type === "CREDIT_CARD" ? tr("Initial debt") : tr("Initial balance");
        await api.events.create({
          event_type: "ADJUSTMENT",
          transaction_date: todayIso(),
          note: noteText,
          entries: [{ account_id: account.id, amount: signedAmount }],
        });
      }
      return account;
    },
    onSuccess: onDone,
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let name = customName.trim();
    if (needsBankSelect) {
      name = nickname.trim() ? `${selectedBankName} (${nickname.trim()})` : selectedBankName;
    } else if (isEWallet) {
      name = nickname.trim() ? `${selectedWallet} (${nickname.trim()})` : selectedWallet;
    }
    save.mutate({
      id: editing?.id,
      name,
      account_type: type,
      currency: "VND",
      initialBalance: editing ? undefined : initialBalance,
      credit_limit: type === "CREDIT_CARD" ? (creditLimit.trim() || undefined) : undefined,
    });
  }

  return <form onSubmit={submit} className="form">
    <Error error={save.error} />
    <div className="account-form-grid" style={{ gridColumn: "1 / -1", width: "100%" }}>
      <Field label="Type"><select value={type} onChange={e => setType(e.target.value as AccountType)}>{accountTypes.map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
      <Field label="Currency"><input value="VND" disabled readOnly /></Field>
      {needsBankSelect ? <>
        <Field label="Choose bank">
          <BankPickerDropdown selected={selectedBankName} onSelect={setSelectedBankName} accountType={type} />
        </Field>
        <Field label="Nickname (optional)"><input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="VD: Thẻ chi tiêu" /></Field>
      </> : isEWallet ? <>
        <Field label="Choose e-wallet">
          <EWalletPickerDropdown selected={selectedWallet} onSelect={setSelectedWallet} />
        </Field>
        <Field label="Nickname (optional)"><input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="VD: Ví chính" /></Field>
      </> : <div className="full-span"><Field label="Name"><input value={customName} onChange={e => setCustomName(e.target.value)} required placeholder="VD: Tiền mặt" /></Field></div>}
      {type === "CREDIT_CARD" && <Field label="Credit limit">
        <div className="amount-row">
          <MoneyInput value={creditLimit} onChange={setCreditLimit} placeholder="0" required={false} />
          <span className="currency-badge">VND</span>
        </div>
      </Field>}
      {!editing && <Field label={type === "CREDIT_CARD" ? "Initial debt" : "Initial balance"}>
        <div className="amount-row">
          <MoneyInput value={initialBalance} onChange={setInitialBalance} placeholder="0" required={false} />
          <span className="currency-badge">VND</span>
        </div>
      </Field>}

      {previewName && (
        <div className="full-span" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: previewBrand.cardBgTint || "#f8f9fa", borderRadius: "10px", border: `1px solid ${previewBrand.primaryColor}40` }}>
          <AccountLogo name={previewName} accountType={type} size={32} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--text)" }}>{previewName}</span>
            <span style={{ fontSize: "0.74rem", color: previewBrand.primaryColor, fontWeight: 650 }}>{previewBrand.name} · {label(type)}</span>
          </div>
        </div>
      )}
    </div>
    <div className="form-actions" style={{ gridColumn: "1 / -1", marginTop: "14px" }}><Submit pending={save.isPending} text={editing ? "Save changes" : "Add account"} /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function AccountAdjustForm({ account, currentBalance, onDone, onCancel }: { account: Account; currentBalance: string; onDone: () => void; onCancel: () => void }) {
  const { tr, language } = useI18n();
  const [adjustDate, setAdjustDate] = useState(todayIso());
  const [target, setTarget] = useState(fmtMoney(currentBalance) ?? currentBalance);
  const delta = sumMoney([target, negateMoney(currentBalance)]);
  const noChange = isZeroMoney(delta);
  const adjust = useMutation({
    mutationFn: (payload: { transaction_date: string; note?: string }) => api.events.create({ event_type: "ADJUSTMENT", transaction_date: payload.transaction_date, note: payload.note, entries: [{ account_id: account.id, amount: delta }] }),
    onSuccess: onDone,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (noChange) return;
    const f = new FormData(e.currentTarget);
    adjust.mutate({ transaction_date: adjustDate || String(f.get("date")), note: String(f.get("note") ?? "").trim() || undefined });
  }
  return <form onSubmit={submit} className="form savings-form">
    <Error error={adjust.error} />
    <p className="hint">{tr("Current balance")}: <strong>{fmtMoneyDisplay(currentBalance)}</strong> {account.currency}</p>
    <Field label="New balance">
      <div className="amount-row">
        <MoneyInput value={target} onChange={setTarget} placeholder="0" required />
        <span className="currency-badge">{account.currency}</span>
      </div>
    </Field>
    <p className="hint">{tr("Difference")}: <strong>{fmtMoneyDisplay(delta)}</strong>{noChange && ` — ${tr("No change to save.")}`}</p>
    <Field label="Adjustment date"><DateRow name="date" value={adjustDate} onChange={setAdjustDate} language={language} label="Adjustment date" /></Field>
    <Field label="Notes"><input name="note" /></Field>
    <div className="form-actions"><Submit pending={adjust.isPending} text="Save changes" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function Categories() {
  const { language, tr } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [iconKey, setIconKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"ALL" | "EXPENSE" | "INCOME">("ALL");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const query = useQuery({ queryKey: ["categories"], queryFn: api.categories.list });

  useEffect(() => {
    if (query.data) setExpanded(new Set(query.data.filter(c => c.parent_id == null).map(c => c.id)));
  }, [query.data]);

  const save = useMutation({
    mutationFn: (input: { id?: number; name: string; parent_id: number | null; icon: string | null }) =>
      input.id ? api.categories.update(input.id, input) : api.categories.create(input),
    onSuccess: () => {
      setEditing(null);
      setEditName("");
      setParentId(null);
      setIconKey(null);
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (category: Category) => api.categories.update(category.id, { is_active: !category.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  function startEdit(node: Category | null) {
    setEditing(node);
    setEditName(node?.name ? categoryLabel(language, node.name) : "");
    setParentId(node?.parent_id ?? null);
    setIconKey(node?.icon ?? null);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editing?.id && !canMoveCategory(editing.id, parentId, query.data ?? [])) return;
    save.mutate({ id: editing?.id, name: editName.trim(), parent_id: parentId, icon: iconKey });
  }

  const all = query.data ?? [];
  const filtered = filterCategoryTree(all, search, n => categoryLabel(language, n)).filter(c => group === "ALL" || (categoryRoot(c, all)?.name === (group === "EXPENSE" ? "Expenses" : "Income")));
  const roots = buildCategoryTree(filtered);

  const render = (node: ReturnType<typeof buildCategoryTree>[number], level = 1): React.ReactNode => {
    const has = node.children.length > 0;
    const open = search ? true : expanded.has(node.id);
    return (
      <div key={node.id} className="category-tree-node">
        <div className="category-tree-row" style={{ paddingLeft: `${(level - 1) * 26 + 10}px` }}>
          <div className="category-tree-left">
            <button
              type="button"
              className="disclosure"
              disabled={!has}
              aria-expanded={has ? open : undefined}
              aria-label={tr(open ? "Collapse" : "Expand")}
              onClick={() => setExpanded(x => toggleCategoryExpansion(x, node.id))}
            >
              {has ? (open ? "▾" : "▸") : "·"}
            </button>
            <CategoryIconBadge name={node.name} icon={node.icon} size={32} />
            <strong className="category-tree-name">{categoryLabel(language, node.name)}</strong>
            {node.orphan && <span className="badge warning">{tr("Other / Unclassified")}</span>}
            <Status active={node.is_active} />
          </div>
          <div className="category-tree-actions">
            <button type="button" className="text-button" onClick={() => startEdit(node)}>{tr("Edit")}</button>
            {level < 3 && (
              <button
                type="button"
                className="text-button"
                onClick={() => startEdit({ id: 0, name: "", parent_id: node.id, is_active: true, icon: null })}
              >
                + {tr("Add child category")}
              </button>
            )}
            <button type="button" className="text-button" onClick={() => toggle.mutate(node)}>
              {tr(node.is_active ? "Deactivate" : "Activate")}
            </button>
          </div>
        </div>
        {open && has && (
          <div className="category-children">
            {node.children.map(child => render(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Section title="Categories" subtitle="Organize events into an optional hierarchy.">
      <div className="category-toolbar">
        <input aria-label={tr("Search category")} placeholder={tr("Search category")} value={search} onChange={e => setSearch(e.target.value)} />
        <div className="segmented">
          {([["ALL", "All"], ["EXPENSE", "Expenses"], ["INCOME", "Income"]] as const).map(([id, labelText]) => (
            <button type="button" className={group === id ? "active" : ""} onClick={() => setGroup(id)} key={id}>
              {tr(labelText)}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={submit} className="form category-form" key={`${editing?.id ?? "new"}-${editing?.parent_id ?? ""}`}>
        <Field label="Name">
          <input name="name" value={editName} onChange={e => setEditName(e.target.value)} required />
        </Field>
        <Field label="Parent">
          <ParentPicker categories={all} editingId={editing?.id || undefined} selectedParentId={parentId} onChange={setParentId} language={language} />
        </Field>
        <Field label="Icon">
          <IconPicker value={iconKey} onChange={setIconKey} language={language} />
        </Field>
        <div className="form-actions">
          <Submit pending={save.isPending} text={editing?.id ? "Save changes" : "Add category"} />
          {editing && <button type="button" className="secondary" onClick={() => startEdit(null)}>{tr("Cancel")}</button>}
        </div>
      </form>
      <Error error={query.error ?? save.error ?? toggle.error} />
      <Loading show={query.isPending} />
      <Empty show={!query.isPending && roots.length === 0} text={search ? "No categories found." : "No categories yet."} />
      <div className="category-tree category-tree-list" role="tree">{roots.map(node => render(node))}</div>
    </Section>
  );
}

function ParentPicker({ categories, editingId, selectedParentId, onChange, language }: { categories: Category[]; editingId?: number; selectedParentId: number | null; onChange: (id: number | null) => void; language: Language }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set(categories.filter(c => c.parent_id == null).map(c => c.id)));
  const root = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-derive default expansion when the category set changes size, not on every re-render
  useEffect(() => { setExpanded(new Set(categories.filter(c => c.parent_id == null).map(c => c.id))); }, [categories.length]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const selected = selectedParentId == null ? null : categories.find(c => c.id === selectedParentId) ?? null;
  const breadcrumb = (category: Category): string => {
    const names: string[] = []; let current: Category | undefined = category; const seen = new Set<number>();
    while (current && !seen.has(current.id)) { seen.add(current.id); names.unshift(categoryLabel(language, current.name)); current = current.parent_id == null ? undefined : categories.find(c => c.id === current!.parent_id); }
    return names.join(" › ");
  };
  const isValid = (id: number) => editingId ? canMoveCategory(editingId, id, categories) : getCategoryDepth(id, categories) < 3;
  // BUGFIX (found via E2E, see docs/qa/QA_STATE.md Batch #2): a category
  // matching the search query but nested under a never-manually-expanded
  // ancestor used to be found by filterCategoryTree yet still filtered out
  // here, so it matched search but never rendered. While a query is active,
  // show every match + ancestor filterCategoryTree already kept, regardless
  // of `expanded` (mirrors the Categories page's own render()'s
  // `open = search ? true : expanded.has(node.id)`).
  const visible = filterCategoryTree(categories, query, n => categoryLabel(language, n)).filter(c => query || c.parent_id == null || expanded.has(c.parent_id));
  return <div className="category-picker" ref={root}>
    <button type="button" className="category-trigger" aria-haspopup="tree" aria-expanded={open} onClick={() => setOpen(x => !x)}>
      {selected && <span aria-hidden="true"><CategoryIcon name={selected.name} icon={selected.icon} size={16} /></span>}
      <span className="category-trigger-label">{selected ? breadcrumb(selected) : ui(language, "None")}</span>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="category-popover" role="tree" aria-label={ui(language, "None")}>
      <input aria-label={ui(language, "Search category")} placeholder={ui(language, "Search category")} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="category-node">
        <span className="disclosure" aria-hidden="true">·</span>
        <button type="button" role="treeitem" aria-selected={selectedParentId == null} className={selectedParentId == null ? "selected" : ""} onClick={() => { onChange(null); setOpen(false); }}>{ui(language, "None")}</button>
      </div>
      {visible.map(category => {
        const level = categoryDepth(category, categories) + 1;
        const hasChildren = categories.some(c => c.parent_id === category.id);
        const valid = isValid(category.id);
        return <div className="category-node" key={category.id} style={{ marginLeft: `${(level - 1) * 18}px` }}>
          <button type="button" className="disclosure" aria-label={ui(language, expanded.has(category.id) ? "Collapse" : "Expand")} aria-expanded={expanded.has(category.id)} onClick={() => setExpanded(x => toggleCategoryExpansion(x, category.id))} disabled={!hasChildren}>{hasChildren ? (expanded.has(category.id) ? "▾" : "▸") : "·"}</button>
          <button type="button" role="treeitem" aria-level={level} aria-disabled={!valid} aria-selected={category.id === selectedParentId} className={`${category.id === selectedParentId ? "selected" : ""}${!valid ? " disabled" : ""}`} disabled={!valid} onClick={() => { if (!valid) return; onChange(category.id); setOpen(false); }}><CategoryIcon name={category.name} icon={category.icon} size={15} /> {categoryLabel(language, category.name)}</button>
        </div>;
      })}
    </div>}
  </div>;
}

/** TASK-036: lets a category be assigned any icon from the library instead
 * of always the name-inferred default (see lib/category-icons.tsx). */
function IconPicker({ value, onChange, language }: { value: string | null; onChange: (key: string | null) => void; language: Language }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="icon-picker" ref={root}>
    <button type="button" className="icon-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(x => !x)}>
      <span className="icon-trigger-swatch" aria-hidden="true"><IconGlyph iconKey={value ?? "Grid"} size={18} /></span>
      <span className="icon-trigger-label">{value ? iconLabel(language, value) : tr("Automatic (by name)")}</span>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="icon-popover" role="menu">
      <button type="button" className={`icon-swatch${value === null ? " selected" : ""}`} onClick={() => { onChange(null); setOpen(false); }} aria-label={tr("Automatic (by name)")} title={tr("Automatic (by name)")}>
        <IconGlyph iconKey="Grid" size={17} />
      </button>
      {ICON_GROUPS.map(g => <div className="icon-group" key={g.label.en}>
        <div className="icon-group-label">{language === "vi" ? g.label.vi : g.label.en}</div>
        <div className="icon-group-grid">
          {g.keys.map(key => <button type="button" key={key} className={`icon-swatch${value === key ? " selected" : ""}`} onClick={() => { onChange(key); setOpen(false); }} aria-label={iconLabel(language, key)} title={iconLabel(language, key)}>
            <IconGlyph iconKey={key} size={17} />
          </button>)}
        </div>
      </div>)}
    </div>}
  </div>;
}

// User request, 2026-08-26: "hãy hiện 1 tài khoản mặc định là tài khoản lần
// cuối ghi giao dịch" -- derives the default account for a new transaction
// from whichever account the most-recently-recorded event actually used,
// rather than persisting a separate "last used" value in client storage.
// Sorting by transaction_date then id (not created-at, which the API
// doesn't expose) means this reflects the last *entered* transaction, which
// naturally "carries forward" after each submit since resetComposer() clears
// the composer and the mutation invalidates ["events"], refetching this
// list with the just-submitted transaction now included.
function lastUsedAccountId(events: FinancialEvent[] | undefined): string {
  if (!events || events.length === 0) return "";
  const last = [...events].sort((a, b) => a.transaction_date < b.transaction_date ? 1 : a.transaction_date > b.transaction_date ? -1 : b.id - a.id)[0];
  const entry = last.entries[0];
  return entry ? String(entry.account_id) : "";
}

function Transactions() {
  const { label, language, tr } = useI18n();
  const qc = useQueryClient();
  const [entries, setEntries] = useState<EntryDraft[]>([{ accountId: "", amount: "" }]);
  const [type, setType] = useState<EventType>("EXPENSE");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => todayIso());
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [cardAccountId, setCardAccountId] = useState("");
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formError, setFormError] = useState("");
  // User request, 2026-08-26: "không tính vào báo cáo đối với giao dịch
  // nhập mới ... Cho phép chỉnh sửa giá trị này ở các menu chỉnh sửa giao
  // dịch" -- opt-in per transaction, defaults false for a new one and is
  // populated from the event being edited by startEdit() below.
  const [excludedFromReports, setExcludedFromReports] = useState(false);
  // TASK-042: "thiết kế thêm tính năng xem chi tiết, chỉnh sửa, xoá giao
  // dịch" -- editingEvent tracks which transaction (if any) the composer
  // below is editing rather than creating; detailEvent tracks which
  // transaction's row was clicked to view its details modal (Edit there
  // sets editingEvent and closes the modal). Both are null in the normal
  // "add a new transaction" state.
  const [editingEvent, setEditingEvent] = useState<FinancialEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<FinancialEvent | null>(null);
  const events = useQuery({ queryKey: ["events"], queryFn: api.events.list });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories.list });
  const { balances } = useAccountBalances(accounts.data);
  // User request, 2026-08-26: default the Select-account row to the last
  // account actually used, without ever overwriting a choice the user is
  // already in the middle of making (guarded on the field still being
  // empty) or an in-progress edit of an existing transaction.
  const firstEntryAccountId = entries[0]?.accountId;
  useEffect(() => {
    if (editingEvent) return;
    if (firstEntryAccountId) return;
    const defaultId = lastUsedAccountId(events.data);
    if (defaultId) setEntries(current => current.map((entry, i) => i === 0 ? { ...entry, accountId: defaultId } : entry));
  }, [events.data, editingEvent, firstEntryAccountId]);
  function resetComposer() {
    setEntries([{ accountId: "", amount: "" }]);
    setTransferFrom(""); setTransferTo(""); setTransferAmount("");
    setCardAccountId(""); setFundingAccountId(""); setPaymentAmount("");
    setDate(todayIso());
    setExcludedFromReports(false);
  }
  const mutation = useMutation({
    mutationFn: (input: EventInput) => editingEvent ? api.events.update(editingEvent.id, input) : api.events.create(input),
    onSuccess: () => {
      resetComposer();
      setEditingEvent(null);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
  const accountNames = new Map(accounts.data?.map(x => [x.id, x.name]));
  const categoriesMap = new Map(categories.data?.map(c => [c.id, c]));
  const categoryNames = new Map(categories.data?.map(x => [x.id, categoryLabel(language, x.name)]));
  const validCategories = categoriesForEventType(type, categories.data ?? []).filter(x => x.is_active);
  const activeAccounts = accounts.data?.filter(x => x.is_active) ?? [];
  const creditCardAccounts = activeAccounts.filter(x => x.account_type === "CREDIT_CARD");
  const fundingAccounts = activeAccounts.filter(x => x.account_type !== "CREDIT_CARD");
  function updateEntry(index: number, field: keyof EntryDraft, value: string) { setEntries(current => current.map((entry, i) => i === index ? { ...entry, [field]: value } : entry)); }
  function changeType(next: EventType) { setType(next); setFormError(""); if (!categoryIsValidForEventType(next, categoryId, categories.data ?? [])) setCategoryId(""); }
  // TASK-042: populate the composer from an existing transaction so Edit
  // reuses the exact same form/validation/submit path as creating one,
  // instead of a second bespoke edit form. Only reachable for
  // composerEventTypes (see startEdit's caller) -- TRANSFER/
  // CREDIT_CARD_PAYMENT's two entries are told apart by sign, matching how
  // submit() itself always books the "from"/funding leg negative.
  function startEdit(event: FinancialEvent) {
    setFormError("");
    setEditingEvent(event);
    setType(event.event_type);
    setDate(event.transaction_date);
    setCategoryId(event.category_id != null ? String(event.category_id) : "");
    setDetailsOpen(Boolean(event.payee_text || event.trip_event_text));
    setExcludedFromReports(event.excluded_from_reports);
    if (event.event_type === "TRANSFER" || event.event_type === "CREDIT_CARD_PAYMENT") {
      const negEntry = event.entries.find(e => e.amount.trim().startsWith("-")) ?? event.entries[0];
      const posEntry = event.entries.find(e => e.id !== negEntry.id) ?? event.entries[1];
      const amount = fmtMoney(posEntry.amount.replace(/^-/, "")) ?? "";
      if (event.event_type === "TRANSFER") { setTransferFrom(String(negEntry.account_id)); setTransferTo(String(posEntry.account_id)); setTransferAmount(amount); }
      else { setFundingAccountId(String(negEntry.account_id)); setCardAccountId(String(posEntry.account_id)); setPaymentAmount(amount); }
    } else {
      const entry = event.entries[0];
      setEntries([{ accountId: String(entry.account_id), amount: fmtMoney(entry.amount.replace(/^-/, "")) ?? "" }]);
    }
  }
  function cancelEdit() {
    resetComposer();
    setCategoryId("");
    setType("EXPENSE");
    setDetailsOpen(false);
    setFormError("");
    setEditingEvent(null);
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const f = new FormData(e.currentTarget);
    if (type === "TRANSFER" && (!transferFrom || !transferTo || transferFrom === transferTo)) { setFormError(tr("Choose two different accounts")); return; }
    if (type === "CREDIT_CARD_PAYMENT" && (!cardAccountId || !fundingAccountId)) { setFormError(tr("Choose two different accounts")); return; }
    if (type === "EXPENSE" || type === "INCOME") {
      // TASK-041: "ràng buộc dữ liệu cho việc nhập chi tiêu, phải đầy đủ số
      // tiền, ngày tháng, loại chi tiêu" -- account, amount, and category
      // were all previously optional here: an unselected account silently
      // sent account_id: 0 (which the backend would reject as a foreign-key
      // violation with no clean message, not a validation error), and an
      // unselected category silently saved as uncategorized with no
      // warning at all. Date can't be missing -- dateRow's onChange always
      // falls back to today() -- so it needs no extra check here.
      if (!entries[0]?.accountId) { setFormError(tr("Choose an account")); return; }
      if (!entries[0]?.amount?.trim()) { setFormError(tr("Enter an amount")); return; }
      // Only require a category when there's actually one to pick --
      // otherwise a user with every category deactivated would be locked
      // out of recording anything at all.
      if (validCategories.length > 0 && !categoryIsValidForEventType(type, categoryId, categories.data ?? [])) { setFormError(tr("Choose a category")); return; }
    }
    const submittedEntries = type === "TRANSFER"
      ? [{ account_id: Number(transferFrom), amount: `-${transferAmount}` }, { account_id: Number(transferTo), amount: transferAmount }]
      : type === "CREDIT_CARD_PAYMENT"
      ? [{ account_id: Number(fundingAccountId), amount: `-${paymentAmount}` }, { account_id: Number(cardAccountId), amount: paymentAmount }]
      // BUGFIX (reported: recording an EXPENSE from a ZaloPay e-wallet
      // added to the balance instead of subtracting): the backend's
      // ledger service trusts the caller's signed amount as-is (see
      // app/services/ledger.py -- it never flips signs itself), and this
      // single-entry EXPENSE/INCOME path used to send the amount the user
      // typed completely unsigned. The Expense/Income segmented control
      // above is now the sole source of sign -- any "-" the user might
      // still type is stripped first so it can't double-negate -- exactly
      // mirroring how app/services/moneylover_normalize.py already signs
      // amounts for the Money Lover import path.
      : entries.map(entry => {
          const magnitude = entry.amount.trim().replace(/^-/, "");
          return { account_id: Number(entry.accountId), amount: type === "EXPENSE" ? negateMoney(magnitude) : magnitude };
        });
    mutation.mutate({ event_type: type, transaction_date: date, category_id: categoryIsValidForEventType(type, categoryId, categories.data ?? []) ? Number(categoryId) : null, payee_text: String(f.get("payee") ?? "").trim() || undefined, trip_event_text: String(f.get("trip") ?? "").trim() || undefined, note: String(f.get("note") ?? "").trim() || undefined, excluded_from_reports: excludedFromReports, entries: submittedEntries });
  }
  const amountCurrency = (type === "TRANSFER" ? activeAccounts.find(a => String(a.id) === transferFrom)
    : type === "CREDIT_CARD_PAYMENT" ? activeAccounts.find(a => String(a.id) === fundingAccountId)
    : activeAccounts.find(a => String(a.id) === entries[0]?.accountId))?.currency ?? "VND";
  const dateRow = <DateRow value={date} onChange={setDate} language={language} />;
  {/* TASK-037: 26px matches AccountLogo/CategoryIcon in the other .row-icon slots below (32px container, ~26px content) so every composer row reads at the same visual weight. */}
  const noteRow = <div className="note-row"><span className="row-icon" aria-hidden="true"><IconGlyph iconKey="Notebook" size={26} /></span><input name="note" placeholder={tr("Add a note")} defaultValue={editingEvent?.note ?? ""} className="note-input" /></div>;
  // User request, 2026-08-26 (UI redesign): "Đưa danh sách các giao dịch
  // sang góc bên phải, chỉ đưa 20 giao dịch gần nhất theo thời gian hoặc
  // các giao dịch tương lai nếu có" -- the old full-width table of every
  // transaction is gone from this page (the new "Sổ giao dịch"/Ledger page
  // is where the full, filterable history now lives); this page's right
  // column instead shows a short recency-ranked slice: if any transaction
  // is dated after today, those future transactions are shown (soonest
  // first) instead of history, otherwise the 20 most recent past/today
  // transactions are shown (most recent first).
  const todayStr = todayIso();
  const allEvents = events.data ?? [];
  const futureEvents = allEvents.filter(x => x.transaction_date > todayStr).sort((a, b) => a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : a.id - b.id);
  const recentEvents = futureEvents.length > 0
    ? futureEvents.slice(0, 20)
    : [...allEvents].sort((a, b) => a.transaction_date < b.transaction_date ? 1 : a.transaction_date > b.transaction_date ? -1 : b.id - a.id).slice(0, 20);
  const showingFuture = futureEvents.length > 0;
  return <section className="transactions-page">
    <div className="transactions-layout">
      <div className="transactions-composer-col">
        {/* TASK-042: keying the form on the edit target forces React to remount
            it (and its uncontrolled payee/trip/note inputs) whenever editingEvent
            changes -- from null to an event when Edit is clicked, between two
            different events, or back to null on cancel/save -- so those
            inputs' defaultValue is re-applied instead of sticking to whatever
            was typed for the previously-edited transaction. */}
        <form onSubmit={submit} className="event-form composer" key={editingEvent ? `edit-${editingEvent.id}` : "new"}>
          {editingEvent && <p className="hint editing-banner" role="status">{tr("Editing transaction")} #{editingEvent.id} · <button type="button" className="text-button" onClick={cancelEdit}>{tr("Cancel")}</button></p>}
          <div className="type-row"><div className="segmented" role="group" aria-label={tr("Type")}>{composerEventTypes.map(x => <button type="button" className={type === x ? "active" : ""} onClick={() => changeType(x)} key={x}>{label(x)}</button>)}</div></div>
          <div className="txn-card">
            {type === "TRANSFER" ? <>
              <AccountRow label="From account" accounts={activeAccounts} value={transferFrom} onChange={setTransferFrom} balances={balances} />
              <AccountRow label="To account" accounts={activeAccounts} value={transferTo} onChange={setTransferTo} balances={balances} />
              <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><MoneyInput className="amount-input" value={transferAmount} onChange={setTransferAmount} placeholder="0" required /></div>
              {formError && <p className="error" role="alert">{formError}</p>}
            </> : type === "CREDIT_CARD_PAYMENT" ? <>
              {creditCardAccounts.length === 0 ? <p className="hint">{tr("No credit card accounts available. Create one first.")}</p> : fundingAccounts.length === 0 ? <p className="hint">{tr("No wallet accounts available. Create a cash, bank, or e-wallet account first.")}</p> : <>
                <AccountRow label="Credit card" accounts={creditCardAccounts} value={cardAccountId} onChange={setCardAccountId} balances={balances} />
                <AccountRow label="From account" accounts={fundingAccounts} value={fundingAccountId} onChange={setFundingAccountId} balances={balances} />
                <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><MoneyInput className="amount-input" value={paymentAmount} onChange={setPaymentAmount} placeholder="0" required /></div>
              </>}
              {formError && <p className="error" role="alert">{formError}</p>}
            </> : <>
              <AccountRow label="Select account" accounts={activeAccounts} value={entries[0]?.accountId ?? ""} onChange={v => updateEntry(0, "accountId", v)} balances={balances} />
              <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><MoneyInput className="amount-input" value={entries[0]?.amount ?? ""} onChange={v => updateEntry(0, "amount", v)} placeholder="0" required /></div>
              {formError && <p className="error" role="alert">{formError}</p>}
            </>}
            {validCategories.length > 0 && <CategoryPicker key={type} categories={validCategories} selected={categoryId} onChange={setCategoryId} language={language} />}
            {type === "EXPENSE" && <QuickCategoryPills categories={categories.data ?? []} selectedCategoryId={categoryId} onSelectCategory={(catId) => { setType("EXPENSE"); setCategoryId(catId); }} language={language} />}
            {noteRow}
            {dateRow}
          </div>
          <button type="button" className="secondary details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>{detailsOpen ? tr("Hide details") : `+ ${tr("Add details")}`}</button>
          {detailsOpen && <div className="form event-details">
            <Field label="Payee"><input name="payee" defaultValue={editingEvent?.payee_text ?? ""} /></Field>
            <Field label="Trip / event"><input name="trip" defaultValue={editingEvent?.trip_event_text ?? ""} /></Field>
            <label className="checkbox-row">
              <input type="checkbox" checked={excludedFromReports} onChange={e => setExcludedFromReports(e.target.checked)} />
              <span>{tr("Exclude from reports")}</span>
            </label>
            <p className="hint">{tr("This transaction won't be counted in income/expense summary reports.")}</p>
          </div>}
          <div className="form-actions"><Submit pending={mutation.isPending} text={editingEvent ? "Save changes" : "Record transaction"} />{editingEvent && <button type="button" className="secondary" onClick={cancelEdit}>{tr("Cancel")}</button>}</div>
        </form>
        <Error error={events.error ?? accounts.error ?? categories.error ?? mutation.error} />
      </div>
      <aside className="transactions-recent-col">
        <div className="panel recent-panel">
          <h3>{showingFuture ? tr("Future") : tr("Transactions")}</h3>
          <Loading show={events.isPending} />
          <Empty show={!events.isPending && recentEvents.length === 0} text="No transactions yet." />
          {/* TASK-042: same click-to-open-details behavior as the old full
              table, just in a compact recency-ranked list instead of every
              row -- tabIndex + onKeyDown keep it keyboard-reachable. */}
          <div className="recent-list">{recentEvents.map(x => {
            const parentCategoryName = (() => {
              if (!x.category_id) return undefined;
              const cat = categoriesMap.get(x.category_id);
              if (!cat?.parent_id) return undefined;
              const parent = categoriesMap.get(cat.parent_id);
              if (!parent || parent.parent_id == null || parent.name === "Expenses" || parent.name === "Income") return undefined;
              return categoryLabel(language, parent.name);
            })();
            const noteOrDetail = x.payee_text ?? x.trip_event_text ?? x.note;
            const subtitle = parentCategoryName ? (noteOrDetail ? `${parentCategoryName} · ${noteOrDetail}` : parentCategoryName) : noteOrDetail;
            return <div className="recent-row" tabIndex={0} key={x.id} onClick={() => setDetailEvent(x)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailEvent(x); } }}>
              <div className="recent-row-main"><span className="event-type">{label(x.event_type)}{x.category_id && <small> · {categoryNames.get(x.category_id) ?? `${tr("Category")} #${x.category_id}`}</small>}{x.excluded_from_reports && <span className="badge muted" title={tr("This transaction won't be counted in income/expense summary reports.")}>{tr("Excluded from reports")}</span>}</span><small>{x.transaction_date}</small></div>
              {subtitle && <div className="recent-row-detail"><small>{subtitle}</small></div>}
              <div className="recent-row-entries">{x.entries.map(e => <span className="entry" key={e.id}><b>{fmtMoneyDisplay(e.amount)}</b> · {accountNames.get(e.account_id) ?? `${tr("Account")} #${e.account_id}`}</span>)}</div>
            </div>;
          })}</div>
        </div>
      </aside>
    </div>
    {detailEvent && <TransactionDetailModal
      event={detailEvent}
      accounts={accounts.data ?? []}
      categories={categories.data ?? []}
      language={language}
      onClose={() => setDetailEvent(null)}
      onEdit={() => { const target = detailEvent; setDetailEvent(null); startEdit(target); }}
    />}
  </section>;
}

/** TASK-042: read-only detail view for one transaction, plus Edit/Delete
 * for the four event types the composer itself owns (see
 * composerEventTypes / EDITABLE_EVENT_TYPES on the backend) -- everything
 * else (ADJUSTMENT, INTEREST, SAVINGS_*, ASSET_*) is shown read-only with
 * a pointer to where it's actually managed, since editing/deleting those
 * here would desync the domain records that own them (e.g. a SavingsTerm's
 * own recorded interest). Category is shown as its full root-to-leaf
 * breadcrumb ("chi tiết giao dịch sẽ hiển thị theo đúng danh mục chi tiêu
 * ở level nhỏ nhất... trong level ăn uống") via categoryPath(), not just
 * the bare leaf name the compact table row already shows. */
function TransactionDetailModal({ event, accounts, categories, language, onClose, onEdit }: { event: FinancialEvent; accounts: Account[]; categories: Category[]; language: Language; onClose: () => void; onEdit: () => void }) {
  const { label, tr } = useI18n();
  const qc = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.events.remove(event.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); onClose(); },
  });
  const editable = composerEventTypes.includes(event.event_type);
  const category = categories.find(c => c.id === event.category_id);
  const accountNames = new Map(accounts.map(a => [a.id, a.name]));
  return <Modal title="Transaction details" onClose={onClose}>
    <div className="txn-detail">
      <dl className="detail-grid">
        <div><dt>{tr("Date")}</dt><dd>{formatIsoDateLabel(language, event.transaction_date)}</dd></div>
        <div><dt>{tr("Type")}</dt><dd>{label(event.event_type)}</dd></div>
        {category && <div><dt>{tr("Category")}</dt><dd>{categoryPath(category, categories, n => categoryLabel(language, n))}</dd></div>}
        {event.payee_text && <div><dt>{tr("Payee")}</dt><dd>{event.payee_text}</dd></div>}
        {event.trip_event_text && <div><dt>{tr("Trip / event")}</dt><dd>{event.trip_event_text}</dd></div>}
        {event.note && <div><dt>{tr("Note")}</dt><dd>{event.note}</dd></div>}
        {event.excluded_from_reports && <div><dt>{tr("Exclude from reports")}</dt><dd>{tr("Excluded from reports")}</dd></div>}
      </dl>
      <div className="detail-entries">{event.entries.map(e => <div className="entry" key={e.id}><b>{fmtMoneyDisplay(e.amount)}</b> · {accountNames.get(e.account_id) ?? `${tr("Account")} #${e.account_id}`}</div>)}</div>
      <Error error={remove.error} />
      {editable ? <div className="form-actions">
        <button type="button" className="text-button" onClick={onEdit}>{tr("Edit")}</button>
        {!confirmingDelete
          ? <button type="button" className="text-button danger" onClick={() => setConfirmingDelete(true)}>{tr("Delete")}</button>
          : <>
            <button type="button" className="text-button danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? tr("Deleting...") : tr("Confirm delete")}</button>
            <button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>{tr("Cancel")}</button>
          </>}
      </div> : <p className="hint">{tr("This transaction type is managed on its own page and can't be edited or deleted here.")}</p>}
    </div>
  </Modal>;
}

// User request, 2026-08-26 (UI redesign, new "Sổ giao dịch" page): splits a
// TRANSFER/CREDIT_CARD_PAYMENT event's two entries into its negative
// ("from"/funding) and positive ("to"/card) legs -- the same convention
// Transactions()'s startEdit() already relies on to tell them apart, reused
// here so LedgerComposerForm can pre-fill a duplicated transfer the same
// way the composer's own Edit does.
function splitTransferEntries(event: FinancialEvent) {
  const negEntry = event.entries.find(e => e.amount.trim().startsWith("-")) ?? event.entries[0];
  const posEntry = event.entries.find(e => e.id !== negEntry.id) ?? event.entries[1];
  return { negEntry, posEntry };
}

/** User request, 2026-08-26 (UI redesign, new "Sổ giao dịch" page): the
 * Ledger's floating "+ Thêm giao dịch" button and its detail panel's "Sao
 * chép" (Duplicate) action both need a composer that always CREATES a new
 * event (never edits one in place) -- Transactions()'s own composer is
 * deliberately left untouched (it's the heavily-tested, existing create/
 * edit flow for the Giao dịch page) rather than generalized to cover this
 * too, to avoid any risk of regressing it. This is therefore an
 * intentionally-duplicated, independent copy of that composer's markup and
 * submit validation, adapted to: (a) always POST via api.events.create
 * regardless of `duplicateFrom`, (b) default the account to whichever
 * account the Ledger page currently has selected when there's nothing to
 * duplicate, and (c) pre-fill every field (including the original date --
 * user answer, 2026-08-26: "Mở lại form nhập, điền sẵn dữ liệu để xem/sửa
 * trước khi lưu", i.e. duplicate copies everything for review, not just a
 * blank form) from `duplicateFrom` when duplicating. */
function LedgerComposerForm({ accounts, categories, defaultAccountId, editingEvent, onClose, onSaved }: {
  accounts: Account[]; categories: Category[]; defaultAccountId: number; editingEvent: FinancialEvent | null; onClose: () => void; onSaved: () => void;
}) {
  const { label, language, tr } = useI18n();
  const initial = editingEvent;
  const isTransferLike = !!initial && (initial.event_type === "TRANSFER" || initial.event_type === "CREDIT_CARD_PAYMENT");
  const initialTransfer = initial && isTransferLike ? splitTransferEntries(initial) : null;
  const [type, setType] = useState<EventType>(initial && composerEventTypes.includes(initial.event_type) ? initial.event_type : "EXPENSE");
  const [categoryId, setCategoryId] = useState(initial?.category_id != null ? String(initial.category_id) : "");
  const [date, setDate] = useState(() => initial ? initial.transaction_date : todayIso());
  const [entries, setEntries] = useState<EntryDraft[]>(() => {
    if (initial && !isTransferLike) {
      const entry = initial.entries[0];
      return [{ accountId: String(entry.account_id), amount: fmtMoney(entry.amount.replace(/^-/, "")) ?? "" }];
    }
    return [{ accountId: String(defaultAccountId), amount: "" }];
  });
  const [transferFrom, setTransferFrom] = useState(initial?.event_type === "TRANSFER" && initialTransfer ? String(initialTransfer.negEntry.account_id) : "");
  const [transferTo, setTransferTo] = useState(initial?.event_type === "TRANSFER" && initialTransfer ? String(initialTransfer.posEntry.account_id) : "");
  const [transferAmount, setTransferAmount] = useState(initial?.event_type === "TRANSFER" && initialTransfer ? fmtMoney(initialTransfer.posEntry.amount.replace(/^-/, "")) ?? "" : "");
  const [cardAccountId, setCardAccountId] = useState(initial?.event_type === "CREDIT_CARD_PAYMENT" && initialTransfer ? String(initialTransfer.posEntry.account_id) : "");
  const [fundingAccountId, setFundingAccountId] = useState(initial?.event_type === "CREDIT_CARD_PAYMENT" && initialTransfer ? String(initialTransfer.negEntry.account_id) : "");
  const [paymentAmount, setPaymentAmount] = useState(initial?.event_type === "CREDIT_CARD_PAYMENT" && initialTransfer ? fmtMoney(initialTransfer.posEntry.amount.replace(/^-/, "")) ?? "" : "");
  const [detailsOpen, setDetailsOpen] = useState(Boolean(initial?.payee_text || initial?.trip_event_text));
  const [formError, setFormError] = useState("");
  const [excludedFromReports, setExcludedFromReports] = useState(initial?.excluded_from_reports ?? false);
  const mutation = useMutation({
    mutationFn: (input: EventInput) => editingEvent ? api.events.update(editingEvent.id, input) : api.events.create(input),
    onSuccess: onSaved,
  });

  function updateEntry(index: number, field: keyof EntryDraft, value: string) { setEntries(current => current.map((entry, i) => i === index ? { ...entry, [field]: value } : entry)); }
  function changeType(next: EventType) { setType(next); setFormError(""); if (!categoryIsValidForEventType(next, categoryId, categories)) setCategoryId(""); }
  const validCategories = categoriesForEventType(type, categories).filter(x => x.is_active);
  const creditCardAccounts = accounts.filter(x => x.account_type === "CREDIT_CARD");
  const fundingAccounts = accounts.filter(x => x.account_type !== "CREDIT_CARD");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const f = new FormData(e.currentTarget);
    if (type === "TRANSFER" && (!transferFrom || !transferTo || transferFrom === transferTo)) { setFormError(tr("Choose two different accounts")); return; }
    if (type === "CREDIT_CARD_PAYMENT" && (!cardAccountId || !fundingAccountId)) { setFormError(tr("Choose two different accounts")); return; }
    if (type === "EXPENSE" || type === "INCOME") {
      if (!entries[0]?.accountId) { setFormError(tr("Choose an account")); return; }
      if (!entries[0]?.amount?.trim()) { setFormError(tr("Enter an amount")); return; }
      if (validCategories.length > 0 && !categoryIsValidForEventType(type, categoryId, categories)) { setFormError(tr("Choose a category")); return; }
    }
    const submittedEntries = type === "TRANSFER"
      ? [{ account_id: Number(transferFrom), amount: `-${transferAmount}` }, { account_id: Number(transferTo), amount: transferAmount }]
      : type === "CREDIT_CARD_PAYMENT"
      ? [{ account_id: Number(fundingAccountId), amount: `-${paymentAmount}` }, { account_id: Number(cardAccountId), amount: paymentAmount }]
      : entries.map(entry => {
          const magnitude = entry.amount.trim().replace(/^-/, "");
          return { account_id: Number(entry.accountId), amount: type === "EXPENSE" ? negateMoney(magnitude) : magnitude };
        });
    mutation.mutate({ event_type: type, transaction_date: date, category_id: categoryIsValidForEventType(type, categoryId, categories) ? Number(categoryId) : null, payee_text: String(f.get("payee") ?? "").trim() || undefined, trip_event_text: String(f.get("trip") ?? "").trim() || undefined, note: String(f.get("note") ?? "").trim() || undefined, excluded_from_reports: excludedFromReports, entries: submittedEntries });
  }

  const amountCurrency = (type === "TRANSFER" ? accounts.find(a => String(a.id) === transferFrom)
    : type === "CREDIT_CARD_PAYMENT" ? accounts.find(a => String(a.id) === fundingAccountId)
    : accounts.find(a => String(a.id) === entries[0]?.accountId))?.currency ?? "VND";
  const dateRow = <DateRow value={date} onChange={setDate} language={language} />;
  const noteRow = <div className="note-row"><span className="row-icon" aria-hidden="true"><IconGlyph iconKey="Notebook" size={26} /></span><input name="note" placeholder={tr("Add a note")} defaultValue={initial?.note ?? ""} className="note-input" /></div>;

  return <form onSubmit={submit} className="event-form composer">
    <div className="type-row"><div className="segmented" role="group" aria-label={tr("Type")}>{composerEventTypes.map(x => <button type="button" className={type === x ? "active" : ""} onClick={() => changeType(x)} key={x}>{label(x)}</button>)}</div></div>
    <div className="txn-card">
      {type === "TRANSFER" ? <>
        <AccountRow label="From account" accounts={accounts} value={transferFrom} onChange={setTransferFrom} />
        <AccountRow label="To account" accounts={accounts} value={transferTo} onChange={setTransferTo} />
        <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><MoneyInput className="amount-input" value={transferAmount} onChange={setTransferAmount} placeholder="0" required /></div>
        {formError && <p className="error" role="alert">{formError}</p>}
      </> : type === "CREDIT_CARD_PAYMENT" ? <>
        {creditCardAccounts.length === 0 ? <p className="hint">{tr("No credit card accounts available. Create one first.")}</p> : fundingAccounts.length === 0 ? <p className="hint">{tr("No wallet accounts available. Create a cash, bank, or e-wallet account first.")}</p> : <>
          <AccountRow label="Credit card" accounts={creditCardAccounts} value={cardAccountId} onChange={setCardAccountId} />
          <AccountRow label="From account" accounts={fundingAccounts} value={fundingAccountId} onChange={setFundingAccountId} />
          <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><MoneyInput className="amount-input" value={paymentAmount} onChange={setPaymentAmount} placeholder="0" required /></div>
        </>}
        {formError && <p className="error" role="alert">{formError}</p>}
      </> : <>
        <AccountRow label="Select account" accounts={accounts} value={entries[0]?.accountId ?? ""} onChange={v => updateEntry(0, "accountId", v)} />
        <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><MoneyInput className="amount-input" value={entries[0]?.amount ?? ""} onChange={v => updateEntry(0, "amount", v)} placeholder="0" required /></div>
        {formError && <p className="error" role="alert">{formError}</p>}
      </>}
      {validCategories.length > 0 && <CategoryPicker key={type} categories={validCategories} selected={categoryId} onChange={setCategoryId} language={language} />}
      {type === "EXPENSE" && <QuickCategoryPills categories={categories} selectedCategoryId={categoryId} onSelectCategory={(catId) => { setType("EXPENSE"); setCategoryId(catId); }} language={language} />}
      {noteRow}
      {dateRow}
    </div>
    <button type="button" className="secondary details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>{detailsOpen ? tr("Hide details") : `+ ${tr("Add details")}`}</button>
    {detailsOpen && <div className="form event-details">
      <Field label="Payee"><input name="payee" defaultValue={initial?.payee_text ?? ""} /></Field>
      <Field label="Trip / event"><input name="trip" defaultValue={initial?.trip_event_text ?? ""} /></Field>
      <label className="checkbox-row">
        <input type="checkbox" checked={excludedFromReports} onChange={e => setExcludedFromReports(e.target.checked)} />
        <span>{tr("Exclude from reports")}</span>
      </label>
      <p className="hint">{tr("This transaction won't be counted in income/expense summary reports.")}</p>
    </div>}
    <Error error={mutation.error} />
    <div className="form-actions"><Submit pending={mutation.isPending} text={editingEvent ? "Save changes" : "Record transaction"} /><button type="button" className="secondary" onClick={onClose}>{tr("Cancel")}</button></div>
  </form>;
}

function LedgerDetailPanel({ event, accountNames, categories, language, onEdit, onDeleted }: {
  event: FinancialEvent; accountNames: Map<number, string>; categories: Category[]; language: Language; onEdit: () => void; onDeleted: () => void;
}) {
  const { label, tr } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = useMutation({ mutationFn: () => api.events.remove(event.id), onSuccess: onDeleted });
  const editable = composerEventTypes.includes(event.event_type);
  const category = categories.find(c => c.id === event.category_id);
  return <div className="ledger-detail-panel">
    <h3>{tr("Transaction details")}</h3>
    <dl className="detail-grid">
      <div><dt>{tr("Date")}</dt><dd>{formatIsoDateLabel(language, event.transaction_date)}</dd></div>
      <div><dt>{tr("Type")}</dt><dd>{label(event.event_type)}</dd></div>
      {category && <div><dt>{tr("Category")}</dt><dd>{categoryPath(category, categories, n => categoryLabel(language, n))}</dd></div>}
      {event.payee_text && <div><dt>{tr("Payee")}</dt><dd>{event.payee_text}</dd></div>}
      {event.trip_event_text && <div><dt>{tr("Trip / event")}</dt><dd>{event.trip_event_text}</dd></div>}
      {event.note && <div><dt>{tr("Note")}</dt><dd>{event.note}</dd></div>}
      {event.excluded_from_reports && <div><dt>{tr("Exclude from reports")}</dt><dd>{tr("Excluded from reports")}</dd></div>}
    </dl>
    <div className="detail-entries">{event.entries.map(e => <div className="entry" key={e.id}><b>{fmtMoneyDisplay(e.amount)}</b> · {accountNames.get(e.account_id) ?? `${tr("Account")} #${e.account_id}`}</div>)}</div>
    <Error error={remove.error} />
    {editable ? <div className="form-actions">
      <button type="button" className="text-button" onClick={onEdit}>{tr("Edit")}</button>
      {!confirmingDelete
        ? <button type="button" className="text-button danger" onClick={() => setConfirmingDelete(true)}>{tr("Delete")}</button>
        : <>
          <button type="button" className="text-button danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? tr("Deleting...") : tr("Confirm delete")}</button>
          <button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>{tr("Cancel")}</button>
        </>}
    </div> : <p className="hint">{tr("This transaction type is managed on its own page and can't be edited or deleted here.")}</p>}
  </div>;
}

/** User request, 2026-08-26 (UI redesign): the new "Sổ giao dịch" page --
 * an account switcher + live balance header, a horizontally-scrolling row
 * of auto-generated month tabs (earliest transaction month for the
 * selected account through this month, plus a "TƯƠNG LAI" bucket when
 * future-dated transactions exist), a period summary (opening/closing/net,
 * computed client-side from the already-fetched event list -- no new
 * backend endpoint), a transaction list grouped by day with per-day
 * subtotals, a right-side detail panel, and a floating "+ Thêm giao dịch"
 * button. Deliberately skips the reference image's "Xem báo cáo cho giai
 * đoạn này" link per the user's own instruction to leave it out of this
 * pass. */
function Ledger() {
  const { label, language, tr } = useI18n();
  const qc = useQueryClient();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const eventsQ = useQuery({ queryKey: ["events"], queryFn: api.events.list });
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: api.categories.list });
  const activeAccounts = (accountsQ.data ?? []).filter(a => a.is_active);
  const { balances } = useAccountBalances(activeAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<number | "ALL" | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [detailEventId, setDetailEventId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState<"new" | "edit" | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<number>>(new Set());
  const [confirmModal, setConfirmModal] = useState<"bulk" | "all" | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // User answer (AskUserQuestion, 2026-08-26): default selected account =
  // "Tài khoản đầu tiên theo thứ tự sắp xếp hiện có (giống trang Tài
  // khoản)" -- accounts.list() is already returned in sort_order (see
  // Accounts(), which renders query.data in API order with no client
  // sort), so the first active account in that order is the default.
  useEffect(() => {
    if (selectedAccountId == null && activeAccounts.length > 0) setSelectedAccountId(activeAccounts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccounts.length, selectedAccountId]);

  const isAllAccounts = selectedAccountId === "ALL";

  const balanceQ = useQuery({
    queryKey: ["account-balance", selectedAccountId],
    queryFn: () => api.accounts.balance(selectedAccountId as number),
    enabled: typeof selectedAccountId === "number",
  });

  const allAccountsBalance = sumMoney(Array.from(balances.values()));
  const currentBalance = isAllAccounts ? allAccountsBalance : balanceQ.data?.balance;

  const accountEvents = selectedAccountId == null
    ? []
    : isAllAccounts
    ? (eventsQ.data ?? [])
    : (eventsQ.data ?? []).filter(e => e.entries.some(en => en.account_id === selectedAccountId));

  function entryAmountFor(event: FinancialEvent): string {
    if (isAllAccounts) {
      if (event.event_type === "TRANSFER" || event.event_type === "CREDIT_CARD_PAYMENT") {
        const split = splitTransferEntries(event);
        return split ? split.posEntry.amount : "0";
      }
      return sumMoney(event.entries.map(e => e.amount));
    }
    const entry = event.entries.find(e => e.account_id === selectedAccountId);
    return entry ? entry.amount : "0";
  }

  const todayStr = todayIso();
  const hasFuture = accountEvents.some(e => e.transaction_date > todayStr);
  const currentMonthKey = todayStr.slice(0, 7);
  const pastEvents = accountEvents.filter(e => e.transaction_date <= todayStr);
  const earliestMonthKey = pastEvents.length > 0
    ? pastEvents.reduce((min, e) => e.transaction_date.slice(0, 7) < min ? e.transaction_date.slice(0, 7) : min, currentMonthKey)
    : currentMonthKey;

  function shiftMonthKey(key: string, delta: number): string {
    const [y, m] = key.split("-").map(Number);
    const total = (m - 1) + delta;
    const year = y + Math.floor(total / 12);
    const month = ((total % 12) + 12) % 12;
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  // User answer (AskUserQuestion, 2026-08-26): "Danh sách tháng cuộn ngang,
  // tự sinh từ tháng có giao dịch sớm nhất tới nay" -- guard bounds the
  // generation loop against a corrupt/garbage transaction_date ever
  // causing it to run away; any real account's history is far short of
  // 1200 months.
  const months: string[] = [];
  for (let key = earliestMonthKey, guard = 0; key <= currentMonthKey && guard < 1200; key = shiftMonthKey(key, 1), guard++) {
    months.push(key);
  }
  const lastMonthKey = shiftMonthKey(currentMonthKey, -1);
  function monthLabel(key: string): string {
    if (key === "FUTURE") return tr("Future");
    if (key === currentMonthKey) return tr("This month");
    if (key === lastMonthKey) return tr("Last month");
    const [y, m] = key.split("-");
    return `${m}/${y}`;
  }

  // Defaults to (and resets to, on every account switch) the current month
  useEffect(() => {
    setSelectedMonthKey(currentMonthKey);
    setSelectedEventIds(new Set());
    setConfirmModal(null);
  }, [selectedAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedEventIds(new Set());
    setConfirmModal(null);
  }, [selectedMonthKey]);

  const activeMonthKey = selectedMonthKey ?? currentMonthKey;
  const isFutureBucket = activeMonthKey === "FUTURE";
  const periodStart = isFutureBucket ? shiftIsoDate(todayStr, 1) : `${activeMonthKey}-01`;
  const periodEnd = isFutureBucket
    ? accountEvents.reduce((max, e) => e.transaction_date > max ? e.transaction_date : max, periodStart)
    : (() => { const [y, m] = activeMonthKey.split("-").map(Number); return new Date(y, m, 0).toISOString().slice(0, 10); })();

  function balanceAsOf(cutoffIso: string): string {
    if (isAllAccounts) {
      return sumMoney(accountEvents.filter(e => e.transaction_date <= cutoffIso).flatMap(e => e.entries.map(en => en.amount)));
    }
    return sumMoney(accountEvents.filter(e => e.transaction_date <= cutoffIso).map(e => entryAmountFor(e)));
  }
  const openingBalance = balanceAsOf(shiftIsoDate(periodStart, -1));
  const closingBalance = balanceAsOf(periodEnd);
  const netChange = sumMoney([closingBalance, negateMoney(openingBalance)]);

  const periodEvents = accountEvents
    .filter(e => e.transaction_date >= periodStart && e.transaction_date <= periodEnd)
    .sort((a, b) => a.transaction_date < b.transaction_date ? 1 : a.transaction_date > b.transaction_date ? -1 : b.id - a.id);
  const groupedByDay = new Map<string, FinancialEvent[]>();
  for (const e of periodEvents) {
    const list = groupedByDay.get(e.transaction_date) ?? [];
    list.push(e);
    groupedByDay.set(e.transaction_date, list);
  }

  const allPeriodEventIds = periodEvents.map(e => e.id);
  const allSelected = periodEvents.length > 0 && allPeriodEventIds.every(id => selectedEventIds.has(id));
  const someSelected = selectedEventIds.size > 0;

  function toggleSelect(id: number, ev: React.MouseEvent) {
    ev.stopPropagation();
    setSelectedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(allPeriodEventIds));
    }
  }

  const categoriesMap = new Map((categoriesQ.data ?? []).map(c => [c.id, c]));
  const categoryNames = new Map((categoriesQ.data ?? []).map(x => [x.id, categoryLabel(language, x.name)]));
  const accountNames = new Map((accountsQ.data ?? []).map(x => [x.id, x.name]));
  const detailEvent = detailEventId != null ? (eventsQ.data ?? []).find(e => e.id === detailEventId) ?? null : null;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["account-balance"] });
    qc.invalidateQueries({ queryKey: ["account-balances"] });
    qc.invalidateQueries({ queryKey: ["portfolio"] });
  }

  if (accountsQ.isPending) return <section className="ledger-page"><Loading show /></section>;
  if (!accountsQ.isPending && (accountsQ.data ?? []).length === 0) return <section className="ledger-page"><Empty show text="No accounts yet. Create one first." /></section>;

  const composerDefaultAccountId = typeof selectedAccountId === "number" ? selectedAccountId : (activeAccounts[0]?.id ?? 1);

  return <section className="ledger-page">
    <div className="ledger-header">
      <AccountRow
        label="Select account"
        accounts={activeAccounts}
        value={selectedAccountId != null ? String(selectedAccountId) : ""}
        onChange={v => setSelectedAccountId(v === "ALL" ? "ALL" : Number(v))}
        balances={balances}
        allowAll
      />
      <div className="ledger-balance">
        <span>{tr("Current balance")}</span>
        <strong>{fmtMoneyDisplay(currentBalance) ?? (balanceQ.isPending ? "…" : "—")}</strong>
      </div>
    </div>
    <div className="ledger-months" role="tablist">
      {months.map(key => <button type="button" role="tab" aria-selected={activeMonthKey === key} className={activeMonthKey === key ? "active" : ""} onClick={() => setSelectedMonthKey(key)} key={key}>{monthLabel(key)}</button>)}
      {hasFuture && <button type="button" role="tab" aria-selected={isFutureBucket} className={isFutureBucket ? "active" : ""} onClick={() => setSelectedMonthKey("FUTURE")}>{tr("Future")}</button>}
    </div>
    <div className="ledger-summary">
      <div><span>{tr("Opening balance")}</span><strong>{fmtMoneyDisplay(openingBalance)}</strong></div>
      <div><span>{tr("Closing balance")}</span><strong>{fmtMoneyDisplay(closingBalance)}</strong></div>
      <div><span>{tr("Net change")}</span><strong className={netChange.startsWith("-") ? "negative" : "positive"}>{fmtMoneyDisplay(netChange)}</strong></div>
    </div>
    <div className="ledger-body">
      <div className="ledger-list">
        <Loading show={eventsQ.isPending} />
        <Empty show={!eventsQ.isPending && periodEvents.length === 0} text="No transactions in this period." />
        {periodEvents.length > 0 && <div className="ledger-toolbar">
          <div className="ledger-toolbar-left">
            <label className="ledger-select-all" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleSelectAll}
                aria-label={tr("Select all")}
              />
              <span>{tr("Select all")}</span>
            </label>
            {someSelected && <span className="ledger-selected-count">{tr("Selected")}: {selectedEventIds.size}/{periodEvents.length}</span>}
          </div>
          <div className="ledger-toolbar-right">
            {someSelected && <button
              type="button"
              className="text-button danger"
              onClick={() => { setDeleteError(""); setConfirmModal("bulk"); }}
            >
              {tr("Delete selected")} ({selectedEventIds.size})
            </button>}
            {someSelected && <button
              type="button"
              className="text-button"
              onClick={() => setSelectedEventIds(new Set())}
            >
              {tr("Deselect all")}
            </button>}
            <button
              type="button"
              className="text-button danger"
              onClick={() => { setDeleteError(""); setConfirmModal("all"); }}
            >
              {tr("Delete all")}
            </button>
          </div>
        </div>}
        {[...groupedByDay.entries()].map(([dateIso, dayEvents]) => {
          const daySubtotal = isAllAccounts
            ? sumMoney(dayEvents.flatMap(e => e.entries.map(en => en.amount)))
            : sumMoney(dayEvents.map(e => entryAmountFor(e)));
          return <div className="ledger-day" key={dateIso}>
            <div className="ledger-day-heading">
              <span>{formatIsoDateLabel(language, dateIso)}</span>
              <b className={daySubtotal.startsWith("-") ? "negative" : "positive"}>{fmtMoneyDisplay(daySubtotal)}</b>
            </div>
            {dayEvents.map(e => {
              const isSelected = selectedEventIds.has(e.id);
              const isDetail = detailEventId === e.id;
              const parentCategoryName = (() => {
                if (!e.category_id) return undefined;
                const cat = categoriesMap.get(e.category_id);
                if (!cat?.parent_id) return undefined;
                const parent = categoriesMap.get(cat.parent_id);
                if (!parent || parent.parent_id == null || parent.name === "Expenses" || parent.name === "Income") return undefined;
                return categoryLabel(language, parent.name);
              })();
              return <div
                className={`ledger-row${isDetail ? " selected" : ""}`}
                tabIndex={0}
                key={e.id}
                onClick={() => setDetailEventId(e.id)}
                onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setDetailEventId(e.id); } }}
              >
                <input
                  type="checkbox"
                  className="ledger-checkbox"
                  checked={isSelected}
                  onClick={ev => toggleSelect(e.id, ev)}
                  onChange={() => {}}
                  aria-label={`${tr("Select")} #${e.id}`}
                />
                <span className="event-type">
                  {label(e.event_type)}
                  {e.category_id && <small> · {categoryNames.get(e.category_id) ?? `${tr("Category")} #${e.category_id}`}</small>}
                </span>
                <small>
                  {isAllAccounts ? (
                    <span className="ledger-row-account">
                      {e.event_type === "TRANSFER" || e.event_type === "CREDIT_CARD_PAYMENT" ? (() => {
                        const split = splitTransferEntries(e);
                        return split ? `${accountNames.get(split.negEntry.account_id) ?? "—"} → ${accountNames.get(split.posEntry.account_id) ?? "—"}` : "";
                      })() : (
                        accountNames.get(e.entries[0]?.account_id) ?? ""
                      )}
                      {(e.payee_text || e.trip_event_text || e.note) && " · "}
                    </span>
                  ) : parentCategoryName ? (
                    <span className="ledger-row-parent-category">
                      {parentCategoryName}
                      {(e.payee_text || e.trip_event_text || e.note) && " · "}
                    </span>
                  ) : null}
                  {e.payee_text ?? e.trip_event_text ?? e.note ?? ""}
                </small>
                <b className={entryAmountFor(e).startsWith("-") ? "negative" : "positive"}>
                  {fmtMoneyDisplay(entryAmountFor(e))}
                </b>
              </div>;
            })}
          </div>;
        })}
      </div>
      <aside className="ledger-detail">
        {detailEvent ? <LedgerDetailPanel
          event={detailEvent}
          accountNames={accountNames}
          categories={categoriesQ.data ?? []}
          language={language}
          onEdit={() => setComposerOpen("edit")}
          onDeleted={() => {
            setSelectedEventIds(prev => {
              const next = new Set(prev);
              next.delete(detailEvent.id);
              return next;
            });
            setDetailEventId(null);
            refresh();
          }}
        /> : <p className="hint">{tr("Select a transaction to see its details.")}</p>}
      </aside>
    </div>
    <button type="button" className="ledger-fab" onClick={() => setComposerOpen("new")}>+ {tr("Add transaction")}</button>
    {composerOpen && <Modal title={composerOpen === "edit" ? "Edit transaction" : "Add transaction"} onClose={() => setComposerOpen(null)}>
      <LedgerComposerForm
        accounts={activeAccounts}
        categories={categoriesQ.data ?? []}
        defaultAccountId={composerDefaultAccountId}
        editingEvent={composerOpen === "edit" ? detailEvent : null}
        onClose={() => setComposerOpen(null)}
        onSaved={() => { setComposerOpen(null); refresh(); }}
      />
    </Modal>}
    {confirmModal != null && <Modal
      title={confirmModal === "bulk" ? "Confirm delete transactions" : "Delete all transactions"}
      onClose={() => { if (!isDeleting) { setConfirmModal(null); setDeleteError(""); } }}
    >
      <div className="delete-confirm-body">
        {confirmModal === "bulk" ? <>
          <p>
            {tr("Are you sure you want to delete")} <strong>{selectedEventIds.size}</strong> {tr("transactions? This action cannot be undone.")}
          </p>
          {(() => {
            const selectedEvents = periodEvents.filter(e => selectedEventIds.has(e.id));
            const protectedCount = selectedEvents.filter(e => !composerEventTypes.includes(e.event_type)).length;
            return protectedCount > 0 ? (
              <p className="hint warning-text">
                {tr("Note: System-managed transactions (Savings, Assets, Adjustments) will be preserved.")}
              </p>
            ) : null;
          })()}
        </> : <>
          <p>
            {tr("Are you sure you want to delete all transactions in this period? This action cannot be undone.")}
          </p>
          <p className="hint">
            {tr("Period")}: <strong>{monthLabel(activeMonthKey)}</strong> ({periodEvents.length} {tr("transactions")})
          </p>
          {(() => {
            const protectedCount = periodEvents.filter(e => !composerEventTypes.includes(e.event_type)).length;
            return protectedCount > 0 ? (
              <p className="hint warning-text">
                {tr("Note: System-managed transactions (Savings, Assets, Adjustments) will be preserved.")}
              </p>
            ) : null;
          })()}
        </>}
        {deleteError && <p className="error" role="alert">{deleteError}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="text-button danger"
            disabled={isDeleting}
            onClick={async () => {
              setIsDeleting(true);
              setDeleteError("");
              try {
                const targetIds = confirmModal === "bulk"
                  ? Array.from(selectedEventIds)
                  : periodEvents.map(e => e.id);
                const targetEvents = (eventsQ.data ?? []).filter(e => targetIds.includes(e.id));
                const editableEvents = targetEvents.filter(e => composerEventTypes.includes(e.event_type));
                if (editableEvents.length === 0) {
                  setDeleteError(tr("No editable transactions selected."));
                  setIsDeleting(false);
                  return;
                }
                await Promise.all(editableEvents.map(e => api.events.remove(e.id)));
                setSelectedEventIds(new Set());
                setConfirmModal(null);
                if (detailEventId && targetIds.includes(detailEventId)) {
                  setDetailEventId(null);
                }
                refresh();
              } catch (err: unknown) {
                const message = err instanceof globalThis.Error ? err.message : tr("Load failed");
                setDeleteError(message || tr("Load failed"));
              } finally {
                setIsDeleting(false);
              }
            }}
          >
            {isDeleting ? tr("Deleting...") : confirmModal === "bulk" ? tr("Confirm delete") : tr("Confirm delete all")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={isDeleting}
            onClick={() => { setConfirmModal(null); setDeleteError(""); }}
          >
            {tr("Cancel")}
          </button>
        </div>
      </div>
    </Modal>}
  </section>;
}

/** TASK-036: a tappable row (icon + name + chevron) that opens a popover
 * list of accounts -- the same interaction shape Moneylover uses for its
 * account/category rows -- instead of a plain <select>. */
function AccountRow({ label: labelText, accounts, value, onChange, balances, allowAll }: { label: string; accounts: Account[]; value: string; onChange: (value: string) => void; balances?: Map<number, string>; allowAll?: boolean }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const isAll = allowAll && value === "ALL";
  const chosen = isAll ? null : accounts.find(a => String(a.id) === value);
  const totalBalance = allowAll && balances ? sumMoney(Array.from(balances.values())) : undefined;
  const chosenBalance = isAll ? totalBalance : chosen ? balances?.get(chosen.id) : undefined;
  return <div className="row-picker" ref={root}>
    <button type="button" className="row-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(x => !x)}>
      <span className="row-icon" aria-hidden="true">{isAll ? <IconGlyph iconKey="Wallet" size={26} /> : chosen ? <AccountLogo name={chosen.name} accountType={chosen.account_type} size={26} /> : <IconGlyph iconKey="Wallet" size={26} />}</span>
      <span className="row-label">{isAll ? tr("All accounts") : chosen ? chosen.name : tr(labelText)}</span>
      {chosenBalance != null && <span className="row-balance">{fmtMoneyDisplay(chosenBalance)}</span>}
      <span className="row-chevron" aria-hidden="true">›</span>
    </button>
    {open && <div className="row-popover" role="listbox">
      {allowAll && <button type="button" role="option" aria-selected={value === "ALL"} className={`row-option${value === "ALL" ? " selected" : ""}`} onClick={() => { onChange("ALL"); setOpen(false); }}>
        <IconGlyph iconKey="Wallet" size={26} /> <span>{tr("All accounts")}</span>
        {totalBalance != null && <span className="row-balance">{fmtMoneyDisplay(totalBalance)}</span>}
      </button>}
      {accounts.length === 0 && !allowAll && <p className="hint">{tr("No accounts yet.")}</p>}
      {accounts.map(a => <button type="button" key={a.id} role="option" aria-selected={String(a.id) === value} className={`row-option${String(a.id) === value ? " selected" : ""}`} onClick={() => { onChange(String(a.id)); setOpen(false); }}>
        <AccountLogo name={a.name} accountType={a.account_type} size={26} /> <span>{a.name}</span>
        {balances?.get(a.id) != null && <span className="row-balance">{fmtMoneyDisplay(balances.get(a.id)!)}</span>}
      </button>)}
    </div>}
  </div>;
}

function CategoryPicker({ categories, selected, onChange, language }: { categories: Category[]; selected: string; onChange: (value: string) => void; language: Language }) { const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [expanded, setExpanded] = useState<Set<number>>(new Set(categories.filter(c => c.parent_id == null).map(c => c.id))); const root = useRef<HTMLDivElement>(null); const chosen = categories.find(x => String(x.id) === selected); const visible = filterCategoryTree(categories, query, n => categoryLabel(language, n)).filter(c => query || c.parent_id == null || expanded.has(c.parent_id)); useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", close); document.addEventListener("keydown", escape); return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); }; }, [open]); return <div className="category-picker row-picker" ref={root}><button type="button" className="row-trigger" aria-haspopup="tree" aria-expanded={open} onClick={() => setOpen(x => !x)}><span className="row-icon" aria-hidden="true"><CategoryIcon name={chosen?.name ?? "Other"} icon={chosen?.icon} size={26} /></span><span className="row-label">{chosen ? categoryLabel(language, chosen.name) : ui(language, "Choose category")}</span><span className="row-chevron" aria-hidden="true">›</span></button>{open && <div className="category-popover" role="tree" aria-label={ui(language, "Choose category")}><input aria-label={ui(language, "Search category")} placeholder={ui(language, "Search category")} value={query} onChange={e => setQuery(e.target.value)} />{visible.map(category => { const level = categoryDepth(category, categories) + 1; const hasChildren = categories.some(c => c.parent_id === category.id); return <div className="category-node" key={category.id} style={{ marginLeft: `${(level - 1) * 18}px` }}><button type="button" className="disclosure" aria-label={ui(language, expanded.has(category.id) ? "Collapse" : "Expand")} aria-expanded={expanded.has(category.id)} onClick={() => setExpanded(x => toggleCategoryExpansion(x, category.id))} disabled={!hasChildren}>{hasChildren ? (expanded.has(category.id) ? "▾" : "▸") : "·"}</button><button type="button" role="treeitem" aria-level={level} aria-selected={String(category.id) === selected} className={String(category.id) === selected ? "selected" : ""} onClick={() => { onChange(String(category.id)); setOpen(false); }}><CategoryIcon name={category.name} icon={category.icon} size={15} /> {categoryLabel(language, category.name)}</button></div>; })}</div>}</div>; }

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { const { tr } = useI18n(); return <section><div className="section-title"><h2>{tr(title)}</h2><p>{tr(subtitle)}</p></div>{children}</section>; }
function Field({ label: text, children }: { label: string; children: React.ReactNode }) { const { tr } = useI18n(); return <label><span>{tr(text)}</span>{children}</label>; }
function Submit({ pending, text }: { pending: boolean; text: string }) { const { tr } = useI18n(); return <button className="primary" disabled={pending}>{pending ? tr("Saving…") : tr(text)}</button>; }
function Status({ active }: { active: boolean }) { const { tr } = useI18n(); return <small className={`status ${active ? "active-status" : ""}`}>{tr(active ? "Active" : "Inactive")}</small>; }
function Error({ error }: { error: Error | null }) { const { tr } = useI18n(); return error ? <p className="error" role="alert">{tr(transactionUiKeys.loadFailed)}</p> : null; }
function Loading({ show }: { show: boolean }) { const { tr } = useI18n(); return show ? <p className="notice" role="status" aria-live="polite">{tr("Loading…")}</p> : null; }
function Empty({ show, text }: { show: boolean; text: string }) { const { tr } = useI18n(); return show ? <p className="notice">{tr(text)}</p> : null; }
