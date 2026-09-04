"use client";

import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { api, Account, AccountBalance, AccountType, Category, CryptoHolding, CryptoUpdateInput, EventInput, EventType, FinancialEvent, ImportApplyResult, MetalHolding, MetalUpdateInput, SavingsAccount, SavingsCreateInput, SavingsPatchInput } from "../lib/api";
import { categoryLabel, copy, enumLabel, Language, transactionUiKeys, ui, useLanguage } from "../lib/i18n";
import { buildCategoryTree, categoriesForEventType, categoryDepth, categoryIsValidForEventType, categoryPath, filterCategoryTree, toggleCategoryExpansion, canMoveCategory, categoryRoot, getCategoryDepth } from "../lib/category-tree";
import { CategoryIcon, CategoryIconBadge, IconGlyph, ICON_GROUPS, iconLabel } from "../lib/category-icons";
import { bankCatalog, bankCategoryLabel, bankCategoryOrder, ewalletCatalog } from "../lib/bank-catalog";
import { AccountLogo, getAccountBrand } from "../lib/account-logos";

type View = "transactions" | "ledger" | "reports" | "accounts" | "categories" | "assets" | "data";
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
  { view: "reports", icon: "BarChart" },
  { view: "accounts", icon: "CreditCard" },
  { view: "categories", icon: "Grid" },
  { view: "assets", icon: "PiggyBank" },
  { view: "data", icon: "Folder" },
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
function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = (m - 1) + delta;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
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

function invalidateAllFinancialQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["events"] });
  qc.invalidateQueries({ queryKey: ["account-balance"] });
  qc.invalidateQueries({ queryKey: ["account-balances"] });
  qc.invalidateQueries({ queryKey: ["accounts"] });
  qc.invalidateQueries({ queryKey: ["portfolio"] });
  qc.invalidateQueries({ queryKey: ["savings"] });
  qc.invalidateQueries({ queryKey: ["metals"] });
  qc.invalidateQueries({ queryKey: ["crypto"] });
  qc.invalidateQueries({ queryKey: ["reconciliation"] });
  qc.invalidateQueries({ queryKey: ["imports"] });
}

const LanguageContext = createContext<Language>("vi");
function useI18n() {
  const language = useContext(LanguageContext);
  return { language, tr: (text: string) => ui(language, text), label: (value: string) => enumLabel(language, value) };
}

export default function Home() {
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const [view, setView] = useState<View>("transactions");
  const [language, setLanguage] = useLanguage();
  const t = copy[language];

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  return <LanguageContext.Provider value={language}><div className="app-shell">
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-add-btn"
        onClick={() => setView("transactions")}
        title={language === "vi" ? "Thêm ghi chép" : "Add record"}
      >
        <span className="sidebar-add-btn-main">
          <IconGlyph iconKey="Plus" size={18} />
          <span>{language === "vi" ? "Thêm ghi chép" : "Add record"}</span>
        </span>
        <span className="sidebar-add-btn-arrow" aria-hidden="true">
          <IconGlyph iconKey="ChevronDown" size={16} />
        </span>
      </button>
      <nav aria-label={ui(language, "Main navigation")}>{navItems.map(({ view: item, icon }) => <button type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => setView(item)} key={item}><span className="nav-icon" aria-hidden="true"><IconGlyph iconKey={icon} size={20} /></span><span>{t[item as keyof typeof t] ?? item}</span></button>)}</nav>
    </aside>
    <div className="app-content">
      <header className="topbar">
        <div className="header-tools">
          <div className="topbar-user-section">
            {user ? (
              <>
                <div className="user-badge-pill">
                  <span style={{ fontWeight: 600 }}>{user.display_name || user.username}</span>
                  {user.is_admin && <span className="user-role-admin">Admin</span>}
                </div>
                {user.is_admin && (
                  <Link href="/users" className="btn-user-action">
                    Quản lý user
                  </Link>
                )}
                <button type="button" className="btn-user-action" onClick={logout}>
                  Đăng xuất
                </button>
              </>
            ) : (
              <Link href="/login" className="btn-user-action" style={{ background: "#2563eb", color: "#fff", borderColor: "#2563eb" }}>
                Đăng nhập
              </Link>
            )}
          </div>
          <div className="language" role="group" aria-label={t.language}><button type="button" aria-pressed={language === "vi"} className={language === "vi" ? "active" : ""} onClick={() => setLanguage("vi")}>🇻🇳 <span>Tiếng Việt</span></button><button type="button" aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>🇺🇸 <span>English</span></button></div>
        </div>
      </header>
      <main>{view === "accounts" ? <Accounts /> : view === "categories" ? <Categories /> : view === "reports" ? <Reports /> : view === "assets" ? <Assets /> : view === "data" ? <DataPage /> : view === "ledger" ? <Ledger /> : <Transactions />}</main>
    </div>
  </div></LanguageContext.Provider>;
}

function DateRow({ value, onChange, language, label: labelText, name }: { value: string; onChange: (v: string) => void; language: Language; label?: string; name?: string }) {
  const { tr } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className="date-row">
    <button type="button" className="date-nav" aria-label={tr("Previous day")} onClick={() => onChange(shiftIsoDate(value, -1))}>‹</button>
    <label
      className="date-center"
      onClick={() => {
        try { inputRef.current?.showPicker?.(); } catch {}
      }}
      style={{ cursor: "pointer" }}
    >
      <span>{formatIsoDateLabel(language, value)}</span>
      <input
        ref={inputRef}
        type="date"
        name={name}
        aria-label={labelText ? tr(labelText) : tr("Choose date")}
        value={value}
        onChange={e => onChange(e.target.value || todayIso())}
        onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
        required
        className="date-native"
        style={{ cursor: "pointer" }}
      />
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
  portfolioMetals,
  portfolioCrypto,
  activeTab,
  onSelectTab,
}: {
  accounts: Account[];
  accountBalances: Map<number, string>;
  savings: SavingsAccount[];
  metals: MetalHolding[];
  crypto: CryptoHolding[];
  portfolioMetals?: import("../lib/api").PortfolioRow[];
  portfolioCrypto?: import("../lib/api").PortfolioRow[];
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
      const portRow = portfolioMetals?.find(r => r.id === m.id);
      const currentUnitPrice = portRow?.quote?.valuation_price;
      const hasLiveQuote = portRow?.quote?.state !== "UNAVAILABLE" && !!currentUnitPrice;
      const chiQtyExact = (Number(m.quantity_grams) / 3.75).toFixed(4);
      const mVal = hasLiveQuote && currentUnitPrice
        ? sumMoney([mulDecimal(currentUnitPrice, chiQtyExact)])
        : (portRow?.value ?? m.total_cost);
      metalsTotal = sumMoney([metalsTotal, mVal]);
    }
  }

  let cryptoTotal = "0";
  for (const c of crypto) {
    if (!c.excluded_from_reports) {
      const portRow = portfolioCrypto?.find(r => r.id === c.id);
      const currentUnitPrice = portRow?.quote?.valuation_price;
      const hasLiveQuote = portRow?.quote?.state !== "UNAVAILABLE" && !!currentUnitPrice;
      const cVal = hasLiveQuote && currentUnitPrice
        ? sumMoney([mulDecimal(currentUnitPrice, c.quantity)])
        : (portRow?.value ?? c.total_cost);
      cryptoTotal = sumMoney([cryptoTotal, cVal]);
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
            <th>{tr("Quantity (chỉ)")}</th>
            <th>{tr("Purchase price")}</th>
            <th>{tr("Total cost")}</th>
            <th>{tr("Market price")}</th>
            <th>{tr("Market value")}</th>
            <th>{tr("Profit / Loss")}</th>
            <th>{tr("Edit")} / {tr("Delete")}</th>
          </tr>
        </thead>
        <tbody>
          {metals.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
                {tr("No precious metals yet.")}
              </td>
            </tr>
          ) : (
            metals.map(m => {
              const portRow = portfolioRows.find(r => r.id === m.id);
              // Giá hiện tại bằng giá cập nhật mới nhất từ BTMC (đ/chỉ)
              const currentUnitPrice = portRow?.quote?.valuation_price ?? null;
              const hasLiveQuote = portRow?.quote?.state !== "UNAVAILABLE" && !!currentUnitPrice;
              const chiQty = (Number(m.quantity_grams) / 3.75).toFixed(2);
              const chiQtyExact = (Number(m.quantity_grams) / 3.75).toFixed(4);

              // Giá trị thị trường bằng số lượng nhân giá hiện tại
              const currentVal = hasLiveQuote && currentUnitPrice
                ? sumMoney([mulDecimal(currentUnitPrice, chiQtyExact)])
                : (portRow?.value ?? m.total_cost);

              const currentValNum = Number(currentVal);
              const totalCostNum = Number(m.total_cost);
              const deltaNum = currentValNum - totalCostNum;
              const pnlPct = totalCostNum > 0 ? ((deltaNum / totalCostNum) * 100).toFixed(2) : "0.00";

              return (
                <tr key={m.id}>
                  <td><strong>{m.product_type}</strong></td>
                  <td>{label(m.brand)}</td>
                  <td><b>{chiQty}</b> chỉ</td>
                  <td>{fmtMoneyDisplay(m.purchase_price)} đ</td>
                  <td><b>{fmtMoneyDisplay(m.total_cost)} đ</b></td>
                  <td>
                    {hasLiveQuote && currentUnitPrice ? (
                      <div>
                        <div><strong>{fmtMoneyDisplay(currentUnitPrice)} đ/chỉ</strong></div>
                        {portRow?.quote?.provider && (
                          <span className="badge" style={{ fontSize: "0.68rem", display: "inline-block", marginTop: "2px", background: "#e0f2fe", color: "#0369a1" }}>
                            {portRow.quote.provider}
                          </span>
                        )}
                        {portRow?.quote?.state === "STALE" && (
                          <span className="badge muted" style={{ fontSize: "0.68rem", display: "inline-block", marginTop: "2px", marginLeft: "4px" }}>
                            STALE
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
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
              // Giá hiện tại bằng giá cập nhật mới nhất từ CoinMarketCap
              const currentUnitPrice = portRow?.quote?.valuation_price ?? null;
              const hasLiveQuote = portRow?.quote?.state !== "UNAVAILABLE" && !!currentUnitPrice;

              // Giá trị thị trường bằng số lượng nhân giá hiện tại
              const currentVal = hasLiveQuote && currentUnitPrice
                ? sumMoney([mulDecimal(currentUnitPrice, c.quantity)])
                : (portRow?.value ?? c.total_cost);

              const currentValNum = Number(currentVal);
              const totalCostNum = Number(c.total_cost);
              const deltaNum = currentValNum - totalCostNum;
              const pnlPct = totalCostNum > 0 ? ((deltaNum / totalCostNum) * 100).toFixed(2) : "0.00";

              return (
                <tr key={c.id}>
                  <td><strong>{c.symbol.toUpperCase()}</strong></td>
                  <td>{c.display_name || c.symbol.toUpperCase()}</td>
                  <td><b>{c.quantity}</b></td>
                  <td>{fmtMoneyDisplay(c.purchase_price)} đ</td>
                  <td><b>{fmtMoneyDisplay(c.total_cost)} đ</b></td>
                  <td>{c.purchase_date}</td>
                  <td>
                    {hasLiveQuote && currentUnitPrice ? (
                      <div>
                        <div><strong>{fmtMoneyDisplay(currentUnitPrice)} đ</strong></div>
                        {portRow?.quote?.provider && (
                          <span className="badge" style={{ fontSize: "0.68rem", display: "inline-block", marginTop: "2px", background: "#e0f2fe", color: "#0369a1" }}>
                            {portRow.quote.provider}
                          </span>
                        )}
                        {portRow?.quote?.state === "STALE" && (
                          <span className="badge muted" style={{ fontSize: "0.68rem", display: "inline-block", marginTop: "2px", marginLeft: "4px" }}>
                            STALE
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
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

const PIE_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#6366f1", // Indigo
  "#84cc16", // Lime
  "#64748b", // Slate
];

function polarToCartesian(cx: number, cy: number, r: number, angleDegrees: number) {
  const rad = ((angleDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const angleDiff = endAngle - startAngle;
  if (angleDiff >= 359.99) {
    return `M ${cx} ${cy - rOuter} A ${rOuter} ${rOuter} 0 1 0 ${cx} ${cy + rOuter} A ${rOuter} ${rOuter} 0 1 0 ${cx} ${cy - rOuter} M ${cx} ${cy - rInner} A ${rInner} ${rInner} 0 1 1 ${cx} ${cy + rInner} A ${rInner} ${rInner} 0 1 1 ${cx} ${cy - rInner} Z`;
  }
  const outerStart = polarToCartesian(cx, cy, rOuter, startAngle);
  const outerEnd = polarToCartesian(cx, cy, rOuter, endAngle);
  const innerStart = polarToCartesian(cx, cy, rInner, endAngle);
  const innerEnd = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArcFlag = angleDiff <= 180 ? "0" : "1";

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z"
  ].join(" ");
}

interface PieSliceData {
  label: string;
  value: number;
  color?: string;
  formattedValue?: string;
}

function ReportDonutChart({
  title,
  data,
  totalLabel,
  totalValueFormatted,
  height = 300,
  legendPosition = "bottom",
}: {
  title?: string;
  data: PieSliceData[];
  totalLabel?: string;
  totalValueFormatted?: string;
  height?: number;
  legendPosition?: "bottom" | "right";
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = useMemo(() => data.reduce((acc, d) => acc + (d.value > 0 ? d.value : 0), 0), [data]);

  const slices = useMemo(() => {
    if (total <= 0) return [];
    let currentAngle = 0;
    return data
      .filter(d => d.value > 0)
      .map((d, i) => {
        const angle = (d.value / total) * 360;
        const start = currentAngle;
        const end = currentAngle + angle;
        currentAngle = end;
        const color = d.color || PIE_COLORS[i % PIE_COLORS.length];
        const pct = ((d.value / total) * 100).toFixed(1);
        return { ...d, startAngle: start, endAngle: end, color, pct, index: i };
      });
  }, [data, total]);

  if (total <= 0 || slices.length === 0) {
    return (
      <div className="report-chart-box" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: height }}>
        {title && <h4 style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 700, color: "var(--text)" }}>{title}</h4>}
        <p style={{ color: "var(--muted)", fontSize: "0.84rem" }}>Chưa có dữ liệu</p>
      </div>
    );
  }

  const activeSlice = hoveredIdx !== null ? slices.find(s => s.index === hoveredIdx) : null;
  const isRightLegend = legendPosition === "right";
  const size = isRightLegend ? 170 : 190;
  const center = size / 2;
  const rOuter = isRightLegend ? 72 : 82;
  const rInner = isRightLegend ? 44 : 50;

  return (
    <div className="report-chart-box" style={isRightLegend ? { width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" } : undefined}>
      {title && <h4 style={{ margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 700, color: "var(--text)" }}>{title}</h4>}
      <div style={{
        display: "flex",
        flexDirection: isRightLegend ? "row" : "column",
        alignItems: "center",
        justifyContent: isRightLegend ? "space-around" : "center",
        gap: isRightLegend ? "16px" : "14px",
        width: "100%",
      }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
            {slices.map((slice) => {
              const isHovered = hoveredIdx === slice.index;
              const path = describeArc(center, center, isHovered ? rOuter + 4 : rOuter, isHovered ? rInner - 2 : rInner, slice.startAngle, slice.endAngle);
              return (
                <path
                  key={slice.index}
                  d={path}
                  fill={slice.color}
                  opacity={hoveredIdx === null || isHovered ? 1 : 0.4}
                  style={{
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                  onMouseEnter={() => setHoveredIdx(slice.index)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
            <text
              x={center}
              y={activeSlice ? center - 6 : center - 4}
              textAnchor="middle"
              style={{ fontSize: isRightLegend ? "0.68rem" : "0.72rem", fill: "var(--muted)", fontWeight: 600, pointerEvents: "none" }}
            >
              {activeSlice ? (activeSlice.label.length > 12 ? activeSlice.label.slice(0, 11) + "…" : activeSlice.label) : (totalLabel || "Tổng")}
            </text>
            <text
              x={center}
              y={activeSlice ? center + 10 : center + 12}
              textAnchor="middle"
              style={{ fontSize: activeSlice ? (isRightLegend ? "0.78rem" : "0.86rem") : (isRightLegend ? "0.82rem" : "0.92rem"), fill: "var(--text)", fontWeight: 700, pointerEvents: "none" }}
            >
              {activeSlice ? `${activeSlice.pct}%` : (totalValueFormatted || fmtMoneyDisplay(String(Math.round(total))))}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: isRightLegend ? 0 : "14px",
          width: isRightLegend ? "auto" : "100%",
          flex: isRightLegend ? 1 : undefined,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: isRightLegend ? "10px" : "6px",
          maxHeight: "220px",
          overflowY: "auto",
          paddingRight: "4px"
        }}>
          {slices.slice(0, 8).map((s) => (
            <div
              key={s.index}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: isRightLegend ? "0.82rem" : "0.78rem",
                padding: isRightLegend ? "4px 6px" : "3px 6px",
                borderRadius: "6px",
                cursor: "pointer",
                background: hoveredIdx === s.index ? "rgba(0, 0, 0, 0.05)" : "transparent",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={() => setHoveredIdx(s.index)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{s.label}</span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: "8px" }}>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.formattedValue || fmtMoneyDisplay(String(Math.round(s.value)))}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.74rem", fontWeight: 600, minWidth: "34px", textAlign: "right" }}>{s.pct}%</span>
              </div>
            </div>
          ))}
          {slices.length > 8 && (
            <div style={{ fontSize: "0.74rem", color: "var(--muted)", textAlign: "center", marginTop: "2px" }}>
              + {slices.length - 8} mục khác
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LiquidAccountsDashboard({
  accounts,
  balances,
  language,
}: {
  accounts: Account[];
  balances: Map<number, string>;
  language: Language;
}) {
  const { tr } = useI18n();

  const cashAccounts = accounts.filter(a => a.account_type === "CASH");
  const bankAccounts = accounts.filter(a => a.account_type === "BANK");
  const ewalletAccounts = accounts.filter(a => a.account_type === "EWALLET");

  const cashTotal = cashAccounts.reduce((acc, a) => acc + Math.max(0, Number(balances.get(a.id) || 0)), 0);
  const bankTotal = bankAccounts.reduce((acc, a) => acc + Math.max(0, Number(balances.get(a.id) || 0)), 0);
  const ewalletTotal = ewalletAccounts.reduce((acc, a) => acc + Math.max(0, Number(balances.get(a.id) || 0)), 0);

  const grandTotal = cashTotal + bankTotal + ewalletTotal;

  const cashPct = grandTotal > 0 ? (cashTotal / grandTotal) * 100 : 0;
  const bankPct = grandTotal > 0 ? (bankTotal / grandTotal) * 100 : 0;
  const ewalletPct = grandTotal > 0 ? (ewalletTotal / grandTotal) * 100 : 0;

  const typeConfig = [
    {
      type: "CASH",
      name: language === "vi" ? "Tiền mặt" : "Cash",
      count: cashAccounts.length,
      amount: cashTotal,
      pct: cashPct,
      color: "#10b981", // Emerald green
    },
    {
      type: "BANK",
      name: language === "vi" ? "Tài khoản ngân hàng" : "Bank accounts",
      count: bankAccounts.length,
      amount: bankTotal,
      pct: bankPct,
      color: "#0084d6", // Sky blue
    },
    {
      type: "EWALLET",
      name: language === "vi" ? "Ví điện tử" : "E-wallets",
      count: ewalletAccounts.length,
      amount: ewalletTotal,
      pct: ewalletPct,
      color: "#8b5cf6", // Purple
    },
  ];

  const pieData: PieSliceData[] = typeConfig.map(t => ({
    label: t.name,
    value: t.amount,
    color: t.color,
    formattedValue: `${fmtMoneyDisplay(String(Math.round(t.amount))) ?? "0"} đ`,
  }));

  return (
    <div className="liquid-dashboard-grid">
      {/* Cột trái: Dạng thanh */}
      <div className="liquid-dash-card">
        <div className="liquid-dash-header">
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.5px" }}>
              {language === "vi" ? "Tổng số dư thanh toán" : "Total liquid balance"}
            </span>
            <strong style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {fmtMoneyDisplay(String(Math.round(grandTotal))) ?? "0"} <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>đ</span>
            </strong>
          </div>
          <span className="badge muted" style={{ fontSize: "0.76rem", padding: "4px 10px", borderRadius: "999px" }}>
            {accounts.length} {tr("Accounts")}
          </span>
        </div>

        <div className="liquid-bars-list">
          {typeConfig.map(item => (
            <div className="liquid-bar-item" key={item.type}>
              <div className="liquid-bar-row-top">
                <div className="liquid-bar-label-group">
                  <span
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: item.color,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span className="liquid-bar-title">{item.name}</span>
                  <span className="liquid-bar-count">({item.count} {language === "vi" ? "TK" : "accs"})</span>
                </div>
                <div className="liquid-bar-val-group">
                  <span className="liquid-bar-amt">{fmtMoneyDisplay(String(Math.round(item.amount))) ?? "0"} đ</span>
                  <span className="liquid-bar-pct" style={{ color: item.color }}>{item.pct.toFixed(1)}%</span>
                </div>
              </div>

              <div className="liquid-progress-track">
                <div
                  className="liquid-progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, item.pct))}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cột phải: Biểu đồ tròn với chú thích bên phải, không có tiêu đề */}
      <div className="liquid-dash-card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ReportDonutChart
          data={pieData}
          totalLabel={language === "vi" ? "Tổng cộng" : "Total"}
          totalValueFormatted={`${fmtMoneyDisplay(String(Math.round(grandTotal))) ?? "0"} đ`}
          legendPosition="right"
          height={180}
        />
      </div>
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
  const [addModal, setAddModal] = useState<"metal" | "crypto" | null>(null);
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
      invalidateAllFinancialQueries(qc);
      setMetalQty("");
      setMetalPrice("");
      setMetalTotal("");
      setAddModal(null);
    },
  });
  const crypto = useMutation({
    mutationFn: api.assets.crypto.create,
    onSuccess: () => {
      invalidateAllFinancialQueries(qc);
      setCryptoQty("");
      setCryptoPrice("");
      setCryptoTotal("");
      setAddModal(null);
    },
  });
  const syncCryptoMutation = useMutation({
    mutationFn: api.assets.crypto.syncPrices,
    onSuccess: (res) => {
      invalidateAllFinancialQueries(qc);
      alert(`Đã cập nhật giá từ CoinMarketCap cho ${res.updated_count} loại tiền mã hoá (Tỷ giá: ${fmtMoneyDisplay(res.usd_vnd_rate)} đ/USD)`);
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
      alert(`Lỗi cập nhật giá CoinMarketCap: ${msg}`);
    },
  });
  const syncMetalsMutation = useMutation({
    mutationFn: api.assets.metals.syncPrices,
    onSuccess: (res) => {
      invalidateAllFinancialQueries(qc);
      alert(`Đã cập nhật giá vàng cho ${res.updated_count} danh mục kim loại quý`);
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
      alert(`Lỗi cập nhật giá vàng: ${msg}`);
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

  const [metalDeduct, setMetalDeduct] = useState<boolean>(true);
  const [metalFundingAccount, setMetalFundingAccount] = useState<string>("");
  const [cryptoDeduct, setCryptoDeduct] = useState<boolean>(true);
  const [cryptoFundingAccount, setCryptoFundingAccount] = useState<string>("");

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
      const fId = metalDeduct ? Number(metalFundingAccount || v("funding_account_id") || (liquidAccounts[0]?.id ? String(liquidAccounts[0].id) : "0")) : undefined;
      metal.mutate({
        metal_type: v("metal_type") as "GOLD" | "SILVER",
        brand: v("brand"),
        product_type: v("product_type"),
        purity: percentToFraction(v("purity")),
        quantity_grams: grams,
        purchase_date: metalDate || v("date"),
        purchase_price: normDecimal(metalPrice) || vd("price"),
        total_cost: normDecimal(metalTotal) || vd("total"),
        funding_account_id: fId && fId > 0 ? fId : undefined,
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
    const fId = cryptoDeduct ? Number(cryptoFundingAccount || v("funding_account_id") || (liquidAccounts[0]?.id ? String(liquidAccounts[0].id) : "0")) : undefined;
    crypto.mutate({
      coingecko_id: identity.coingecko_id,
      symbol: identity.symbol,
      display_name: identity.display_name,
      quantity: normDecimal(cryptoQty),
      purchase_date: cryptoDate || v("date"),
      purchase_price: finalPrice,
      total_cost: finalTotal,
      funding_account_id: fId && fId > 0 ? fId : undefined,
      excluded_from_reports: f.get("excluded_from_reports") === "on",
    });
  }

  const [selectedBrand, setSelectedBrand] = useState<string>("ALL");
  const [selectedProduct, setSelectedProduct] = useState<string>("ALL");
  const [selectedCoin, setSelectedCoin] = useState<string>("ALL");

  const decimalPattern = "^\\d+([.,]\\d{1,4})?$";
  const productTypes = ["RING", "BAR", "JEWELRY"] as const;

  const p = q.data;

  function refreshHoldings() {
    invalidateAllFinancialQueries(qc);
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
        portfolioMetals={p?.precious_metals}
        portfolioCrypto={p?.crypto}
        activeTab={tab}
        onSelectTab={setTab}
      />

      {tab === "liquid" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
          <LiquidAccountsDashboard
            accounts={liquidAccounts}
            balances={balances}
            language={language}
          />

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
        </div>
      )}

      {tab === "savings" && <SavingsPanel />}

      {tab === "metals" && (() => {
        const metalsList = metalsQ.data ?? [];
        const distinctBrands = Array.from(new Set(metalsList.map(m => m.brand))).filter(Boolean);
        const distinctProducts = Array.from(new Set(metalsList.map(m => m.product_type))).filter(Boolean);

        const filteredMetals = metalsList.filter(m => {
          const matchBrand = selectedBrand === "ALL" || m.brand === selectedBrand;
          const matchProduct = selectedProduct === "ALL" || m.product_type === selectedProduct;
          return matchBrand && matchProduct;
        });

        const metalsTotalCost = sumMoney(filteredMetals.map(m => m.total_cost));
        const metalsValuation = sumMoney(filteredMetals.map(m => {
          const portRow = p?.precious_metals?.find(r => r.id === m.id);
          const currentUnitPrice = portRow?.quote?.valuation_price;
          const hasLiveQuote = portRow?.quote?.state !== "UNAVAILABLE" && !!currentUnitPrice;
          const chiQtyExact = (Number(m.quantity_grams) / 3.75).toFixed(4);
          return hasLiveQuote && currentUnitPrice
            ? sumMoney([mulDecimal(currentUnitPrice, chiQtyExact)])
            : (portRow?.value ?? m.total_cost);
        }));
        const metalsNetPl = sumMoney([metalsValuation, negateMoney(metalsTotalCost)]);
        const metalsRoi = Number(metalsTotalCost) > 0
          ? ((Number(metalsNetPl) / Number(metalsTotalCost)) * 100).toFixed(2)
          : "0.00";
        const metalsTotalGrams = filteredMetals.reduce((acc, m) => acc + Number(m.quantity_grams), 0);
        const metalsTotalChi = (metalsTotalGrams / 3.75).toFixed(2);
        const isPos = Number(metalsNetPl) > 0;
        const isNeg = Number(metalsNetPl) < 0;

        return (
          <div style={{ width: "100%" }}>
            {/* 1. Dashboard đơn giản cho Kim loại quý */}
            <div className="asset-kpi-grid">
              <div className="asset-kpi-card">
                <span>{tr("Total valuation")}</span>
                <strong>{fmtMoneyDisplay(metalsValuation) || "0"} đ</strong>
                <small className="hint">{filteredMetals.length} {tr("Holdings")}</small>
              </div>
              <div className="asset-kpi-card">
                <span>{tr("Total invested")}</span>
                <strong>{fmtMoneyDisplay(metalsTotalCost) || "0"} đ</strong>
                <small className="hint">{tr("Total cost")}</small>
              </div>
              <div className="asset-kpi-card">
                <span>{tr("Net profit / loss")}</span>
                <strong style={{ color: isPos ? "#16a34a" : isNeg ? "#dc2626" : "inherit" }}>
                  {isPos ? "+" : ""}{fmtMoneyDisplay(metalsNetPl)} đ
                </strong>
                <small style={{ color: isPos ? "#16a34a" : isNeg ? "#dc2626" : "inherit", fontWeight: 700 }}>
                  {isPos ? "+" : ""}{metalsRoi}% ROI
                </small>
              </div>
              <div className="asset-kpi-card">
                <span>{tr("Total quantity")}</span>
                <strong>{metalsTotalChi} chỉ</strong>
                <small className="hint">{metalsTotalGrams.toFixed(2)} g</small>
              </div>
            </div>

            {/* 2. Toolbar với Tiêu đề, Bộ lọc & Nút thêm */}
            <div className="asset-type-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <h3 style={{ margin: 0 }}>{tr("Precious metals holdings")}</h3>
                {distinctBrands.length > 0 && (
                  <select
                    value={selectedBrand}
                    onChange={e => setSelectedBrand(e.target.value)}
                    aria-label={tr("Brand")}
                    style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--card)", fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    <option value="ALL">{tr("All brands")}</option>
                    {distinctBrands.map(b => (
                      <option key={b} value={b}>{label(b)}</option>
                    ))}
                  </select>
                )}
                {distinctProducts.length > 0 && (
                  <select
                    value={selectedProduct}
                    onChange={e => setSelectedProduct(e.target.value)}
                    aria-label={tr("Product")}
                    style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--card)", fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    <option value="ALL">{tr("All products")}</option>
                    {distinctProducts.map(prod => (
                      <option key={prod} value={prod}>{label(prod)}</option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={syncMetalsMutation.isPending}
                  onClick={() => syncMetalsMutation.mutate()}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  {syncMetalsMutation.isPending ? "Đang lấy giá..." : "🔄 Cập nhật giá vàng"}
                </button>
                <button type="button" className="primary" onClick={() => setAddModal("metal")}>
                  + {tr("Add gold / silver")}
                </button>
              </div>
            </div>

            {/* 3. Danh sách chi tiết hiện ở dưới full trang */}
            <MetalsHoldingsTable
              metals={filteredMetals}
              portfolioRows={p?.precious_metals ?? []}
              onEdit={m => setEditingMetal(m)}
              onDeleted={refreshHoldings}
            />
          </div>
        );
      })()}

      {tab === "crypto" && (() => {
        const cryptoList = cryptoQ.data ?? [];
        const distinctCoins = Array.from(new Set(cryptoList.map(c => c.symbol.toUpperCase()))).filter(Boolean);

        const filteredCrypto = cryptoList.filter(c => {
          return selectedCoin === "ALL" || c.symbol.toUpperCase() === selectedCoin.toUpperCase();
        });

        const cryptoTotalCost = sumMoney(filteredCrypto.map(c => c.total_cost));
        const cryptoValuation = sumMoney(filteredCrypto.map(c => {
          const portRow = p?.crypto?.find(r => r.id === c.id);
          const currentUnitPrice = portRow?.quote?.valuation_price;
          const hasLiveQuote = portRow?.quote?.state !== "UNAVAILABLE" && !!currentUnitPrice;
          return hasLiveQuote && currentUnitPrice
            ? sumMoney([mulDecimal(currentUnitPrice, c.quantity)])
            : (portRow?.value ?? c.total_cost);
        }));
        const cryptoNetPl = sumMoney([cryptoValuation, negateMoney(cryptoTotalCost)]);
        const cryptoRoi = Number(cryptoTotalCost) > 0
          ? ((Number(cryptoNetPl) / Number(cryptoTotalCost)) * 100).toFixed(2)
          : "0.00";
        const isPos = Number(cryptoNetPl) > 0;
        const isNeg = Number(cryptoNetPl) < 0;

        return (
          <div style={{ width: "100%" }}>
            {/* 1. Dashboard đơn giản cho Crypto */}
            <div className="asset-kpi-grid">
              <div className="asset-kpi-card">
                <span>{tr("Total valuation")}</span>
                <strong>{fmtMoneyDisplay(cryptoValuation) || "0"} đ</strong>
                <small className="hint">{filteredCrypto.length} {tr("Holdings")}</small>
              </div>
              <div className="asset-kpi-card">
                <span>{tr("Total invested")}</span>
                <strong>{fmtMoneyDisplay(cryptoTotalCost) || "0"} đ</strong>
                <small className="hint">{tr("Total cost")}</small>
              </div>
              <div className="asset-kpi-card">
                <span>{tr("Net profit / loss")}</span>
                <strong style={{ color: isPos ? "#16a34a" : isNeg ? "#dc2626" : "inherit" }}>
                  {isPos ? "+" : ""}{fmtMoneyDisplay(cryptoNetPl)} đ
                </strong>
                <small style={{ color: isPos ? "#16a34a" : isNeg ? "#dc2626" : "inherit", fontWeight: 700 }}>
                  {isPos ? "+" : ""}{cryptoRoi}% ROI
                </small>
              </div>
              <div className="asset-kpi-card">
                <span>{tr("Coins")}</span>
                <strong>{filteredCrypto.length}</strong>
                <small className="hint">{tr("Active")}</small>
              </div>
            </div>

            {/* 2. Toolbar với Tiêu đề, Bộ lọc & Nút thêm */}
            <div className="asset-type-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h3 style={{ margin: 0 }}>{tr("Crypto holdings")}</h3>
                {distinctCoins.length > 0 && (
                  <select
                    value={selectedCoin}
                    onChange={e => setSelectedCoin(e.target.value)}
                    aria-label={tr("Coin")}
                    style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--card)", fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    <option value="ALL">{tr("All coins")}</option>
                    {distinctCoins.map(coin => (
                      <option key={coin} value={coin}>{coin}</option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={syncCryptoMutation.isPending}
                  onClick={() => syncCryptoMutation.mutate()}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  {syncCryptoMutation.isPending ? "Đang lấy giá..." : "🔄 Cập nhật giá CoinMarketCap"}
                </button>
                <button type="button" className="primary" onClick={() => setAddModal("crypto")}>
                  + {tr("Add crypto")}
                </button>
              </div>
            </div>

            {/* 3. Danh sách chi tiết hiện ở dưới full trang */}
            <CryptoHoldingsTable
              crypto={filteredCrypto}
              portfolioRows={p?.crypto ?? []}
              onEdit={c => setEditingCrypto(c)}
              onDeleted={refreshHoldings}
            />
          </div>
        );
      })()}

      {addModal === "metal" && (
        <Modal title="Add gold / silver" onClose={() => setAddModal(null)}>
          <form className="form asset-form" onSubmit={e => submit(e, "metal")}>
            <Error error={metal.error} />
            <Field label="Type">
              <select name="metal_type">
                <option value="GOLD">{tr("Gold")}</option>
                <option value="SILVER">{tr("Silver")}</option>
              </select>
            </Field>
            <Field label="Brand">
              <select name="brand" aria-label={tr("Product catalog")}>
                {(brands.data ?? []).map(b => <option value={b} key={b}>{label(b)}</option>)}
              </select>
            </Field>
            <Field label="Product">
              <select name="product_type" aria-label={tr("Product")} required defaultValue="">
                <option value="" disabled>{tr("Product")}</option>
                {productTypes.map(x => <option value={label(x)} key={x}>{label(x)}</option>)}
              </select>
            </Field>
            <Field label="Quantity (chỉ)">
              <input name="quantity" placeholder={tr("Quantity (chỉ)")} aria-label={tr("Quantity (chỉ)")} inputMode="decimal" required value={metalQty} onChange={e => handleMetalQtyChange(e.target.value)} />
            </Field>
            <Field label="Purity">
              <div className="amount-row purity-row">
                <input name="purity" placeholder="99.99" title={tr("Leave blank to use 99.99%")} aria-label={tr("Purity")} inputMode="decimal" pattern={decimalPattern} />
                <span className="currency-badge">%</span>
              </div>
            </Field>
            <Field label="Purchase price">
              <div className="amount-row">
                <MoneyInput value={metalPrice} onChange={handleMetalPriceChange} placeholder={tr("Purchase price")} required />
                <span className="currency-badge">VND</span>
              </div>
            </Field>
            <Field label="Total cost">
              <div className="amount-row">
                <MoneyInput value={metalTotal} onChange={handleMetalTotalChange} placeholder={tr("Total cost")} required />
                <span className="currency-badge">VND</span>
              </div>
            </Field>
            <Field label="Purchase date">
              <DateRow name="date" value={metalDate} onChange={setMetalDate} language={language} label="Purchase date" />
            </Field>
            <label className="checkbox-row">
              <input type="checkbox" checked={metalDeduct} onChange={e => setMetalDeduct(e.target.checked)} />
              <span>{tr("Deduct from payment account")}</span>
            </label>
            {metalDeduct && (
              <Field label="Payment account">
                <select
                  name="funding_account_id"
                  aria-label={tr("Payment account")}
                  value={metalFundingAccount || (liquidAccounts[0]?.id ? String(liquidAccounts[0].id) : "")}
                  onChange={e => setMetalFundingAccount(e.target.value)}
                  required
                >
                  {liquidAccounts.map(a => (
                    <option value={a.id} key={a.id}>
                      {a.name} ({fmtMoneyDisplay(balances.get(a.id) ?? "0")} VND)
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className="checkbox-row">
              <input type="checkbox" name="excluded_from_reports" />
              <span>{tr("Exclude from reports")}</span>
            </label>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={metal.isPending}>+ {tr("Add")}</button>
              <button type="button" className="secondary" onClick={() => setAddModal(null)}>{tr("Cancel")}</button>
            </div>
          </form>
        </Modal>
      )}

      {addModal === "crypto" && (
        <Modal title="Add crypto" onClose={() => setAddModal(null)}>
          <form className="form asset-form" onSubmit={e => submit(e, "crypto")}>
            <Error error={crypto.error} />
            <Field label="Coin code">
              <input name="symbol" placeholder={tr("Coin code")} aria-label={tr("Coin code")} autoCapitalize="characters" required />
            </Field>
            <Field label="Quantity">
              <input name="quantity" placeholder={tr("Quantity")} inputMode="decimal" required value={cryptoQty} onChange={e => handleCryptoQtyChange(e.target.value)} />
            </Field>
            <Field label="Purchase price">
              <div className="amount-row crypto-price-row">
                <MoneyInput name="purchase_price" value={cryptoPrice} onChange={handleCryptoPriceChange} placeholder={tr("Purchase price")} allowDecimal={cryptoCurrency === "USD"} required />
                <select name="purchase_currency" aria-label={tr("Currency")} value={cryptoCurrency} onChange={e => setCryptoCurrency(e.target.value as "VND" | "USD")}>
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </Field>
            {cryptoCurrency === "USD" && (
              <p className="quote-notice" role="status">
                {fx.isPending ? tr("Loading exchange rate…") : fx.isError || !fx.data ? tr("Exchange rate unavailable") : `${tr("Exchange rate")}: 1 USD ≈ ${fmtMoneyDisplay(fx.data.rate)} VND`}
              </p>
            )}
            <Field label="Total cost">
              <div className="amount-row">
                <MoneyInput name="total_cost" value={cryptoTotal} onChange={handleCryptoTotalChange} placeholder={tr("Total cost")} required />
                <span className="currency-badge">VND</span>
              </div>
            </Field>
            <Field label="Purchase date">
              <DateRow name="date" value={cryptoDate} onChange={setCryptoDate} language={language} label="Purchase date" />
            </Field>
            <label className="checkbox-row">
              <input type="checkbox" checked={cryptoDeduct} onChange={e => setCryptoDeduct(e.target.checked)} />
              <span>{tr("Deduct from payment account")}</span>
            </label>
            {cryptoDeduct && (
              <Field label="Payment account">
                <select
                  name="funding_account_id"
                  aria-label={tr("Payment account")}
                  value={cryptoFundingAccount || (liquidAccounts[0]?.id ? String(liquidAccounts[0].id) : "")}
                  onChange={e => setCryptoFundingAccount(e.target.value)}
                  required
                >
                  {liquidAccounts.map(a => (
                    <option value={a.id} key={a.id}>
                      {a.name} ({fmtMoneyDisplay(balances.get(a.id) ?? "0")} VND)
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className="checkbox-row">
              <input type="checkbox" name="excluded_from_reports" />
              <span>{tr("Exclude from reports")}</span>
            </label>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={crypto.isPending}>+ {tr("Add")}</button>
              <button type="button" className="secondary" onClick={() => setAddModal(null)}>{tr("Cancel")}</button>
            </div>
          </form>
        </Modal>
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
const MAJOR_CRYPTO_MAP: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  BNB: { id: "binancecoin", name: "BNB" },
  SOL: { id: "solana", name: "Solana" },
  USDT: { id: "tether", name: "Tether" },
  USDC: { id: "usd-coin", name: "USD Coin" },
  XRP: { id: "ripple", name: "XRP" },
  ADA: { id: "cardano", name: "Cardano" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  LINK: { id: "chainlink", name: "Chainlink" },
  DOT: { id: "polkadot", name: "Polkadot" },
  NEAR: { id: "near", name: "NEAR Protocol" },
  SUI: { id: "sui", name: "Sui" },
  APT: { id: "aptos", name: "Aptos" },
  TON: { id: "the-open-network", name: "Toncoin" },
  SHIB: { id: "shiba-inu", name: "Shiba Inu" },
  PEPE: { id: "pepe", name: "Pepe" },
};

async function resolveCryptoIdentity(code: string): Promise<{ coingecko_id: string; symbol: string; display_name: string }> {
  const trimmed = code.trim();
  const upper = trimmed.toUpperCase();
  if (MAJOR_CRYPTO_MAP[upper]) {
    return {
      coingecko_id: MAJOR_CRYPTO_MAP[upper].id,
      symbol: upper,
      display_name: upper,
    };
  }
  const fallback = { coingecko_id: trimmed.toLowerCase(), symbol: upper, display_name: upper };
  try {
    const matches = await api.assets.crypto.searchCoins(trimmed);
    const exact = matches.find(m => m.symbol.toUpperCase() === upper);
    if (!exact) return fallback;
    return { coingecko_id: exact.id, symbol: upper, display_name: upper };
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
  const [whole] = normalized.replace("-", "").split(".");
  return `${negative ? "-" : ""}${groupThousands(whole || "0")}`;
}

function fmtRate(rate: string | number | null | undefined): string {
  if (rate == null || rate === "") return "";
  const str = String(rate).trim();
  if (!str.includes(".")) return str;
  const stripped = str.replace(/\.?0+$/, "");
  return stripped || "0";
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
  const { tr, language } = useI18n();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [selectedBank, setSelectedBank] = useState<string>("ALL");
  const [searchName, setSearchName] = useState<string>("");

  const savingsQ = useQuery({ queryKey: ["savings"], queryFn: api.assets.savings.list });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const walletAccounts = (accountsQ.data ?? []).filter(a => a.account_type !== "CREDIT_CARD" && a.is_active);
  const rows = savingsQ.data ?? [];

  const distinctBanks = Array.from(new Set(rows.map(r => r.institution))).filter(Boolean);
  const displayRows = rows.filter(r => {
    if (selectedBank !== "ALL" && r.institution !== selectedBank) return false;
    if (searchName.trim() && !r.name.toLowerCase().includes(searchName.trim().toLowerCase())) return false;
    return true;
  });

  const openRows = displayRows.filter(r => r.status === "OPEN");
  const totalPrincipal = sumMoney(openRows.map(r => r.principal));
  const totalExpectedInterest = sumMoney(openRows.map(r => r.current_term?.expected_interest));
  const totalProjectedMaturity = sumMoney([totalPrincipal, totalExpectedInterest]);

  // Find nearest maturing open savings account
  const nearestAccount = [...openRows]
    .filter(r => r.current_term?.days_to_maturity != null)
    .sort((a, b) => (a.current_term?.days_to_maturity ?? 99999) - (b.current_term?.days_to_maturity ?? 99999))[0] ?? null;

  function refresh() {
    invalidateAllFinancialQueries(qc);
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.assets.savings.remove(id),
    onSuccess: refresh,
  });

  return (
    <div className="savings-panel" style={{ width: "100%" }}>
      {/* 1. Dashboard tổng hợp Tiết kiệm */}
      <div className="asset-kpi-grid">
        <div className="asset-kpi-card">
          <span>{tr("Total principal")}</span>
          <strong>{fmtMoneyDisplay(totalPrincipal) || "0"} đ</strong>
          <small className="hint">{openRows.length} {tr("Active accounts count")}</small>
        </div>
        <div className="asset-kpi-card">
          <span>{tr("Total expected interest")}</span>
          <strong style={{ color: "#16a34a" }}>{fmtMoneyDisplay(totalExpectedInterest) || "0"} đ</strong>
          <small className="hint">{tr("At maturity")}</small>
        </div>
        <div className="asset-kpi-card">
          <span>{tr("Total projected maturity value")}</span>
          <strong style={{ color: "#0284c7" }}>{fmtMoneyDisplay(totalProjectedMaturity) || "0"} đ</strong>
          <small className="hint">{tr("Principal")} + {tr("Expected interest")}</small>
        </div>
        <div className="asset-kpi-card" style={{ borderColor: nearestAccount?.current_term?.maturing_soon ? "#f97316" : undefined }}>
          <span>{tr("Nearest maturity account")}</span>
          {nearestAccount && nearestAccount.current_term ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nearestAccount.name} · <span style={{ color: "var(--muted)", fontWeight: 500 }}>{nearestAccount.institution}</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: nearestAccount.current_term.days_to_maturity != null && nearestAccount.current_term.days_to_maturity <= 7 ? "#ea580c" : "var(--muted)" }}>
                {nearestAccount.current_term.maturity_date} ({nearestAccount.current_term.days_to_maturity != null && nearestAccount.current_term.days_to_maturity >= 0 ? `${nearestAccount.current_term.days_to_maturity} ${tr("days")}` : tr("Matured")})
              </div>
              <div style={{ fontSize: "0.78rem", marginTop: "2px" }}>
                <span>{tr("Principal")}: <b>{fmtMoneyDisplay(nearestAccount.principal)} đ</b></span>
                <span style={{ marginLeft: "6px", color: "#16a34a" }}>· {tr("Projected value at maturity")}: <b>{fmtMoneyDisplay(sumMoney([nearestAccount.principal, nearestAccount.current_term.expected_interest]))} đ</b></span>
              </div>
            </div>
          ) : (
            <>
              <strong style={{ fontSize: "1rem", color: "var(--muted)" }}>{tr("No maturing accounts")}</strong>
              <small className="hint">{tr("No active terms")}</small>
            </>
          )}
        </div>
      </div>

      {/* 2. Toolbar với Tiêu đề, Bộ lọc Ngân hàng & Bộ lọc Tên sổ & Nút thêm */}
      <div className="asset-type-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>{tr("Savings holdings")}</h3>
          {distinctBanks.length > 0 && (
            <select
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              aria-label={tr("Bank")}
              style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--card)", fontSize: "0.85rem", fontWeight: 600, height: "36px", cursor: "pointer" }}
            >
              <option value="ALL">{tr("All banks")}</option>
              {distinctBanks.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <input
              type="text"
              placeholder={language === "vi" ? "Lọc theo tên sổ..." : "Filter by name..."}
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              style={{
                padding: "6px 28px 6px 12px",
                borderRadius: "8px",
                border: "1px solid var(--line)",
                background: "var(--card)",
                fontSize: "0.85rem",
                minWidth: "170px",
                height: "36px",
                color: "var(--text)"
              }}
              aria-label={language === "vi" ? "Lọc theo tên sổ" : "Filter by name"}
            />
            {searchName && (
              <button
                type="button"
                onClick={() => setSearchName("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: "0.9rem",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                title={language === "vi" ? "Xoá tìm kiếm" : "Clear filter"}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <button type="button" className="primary" onClick={() => setCreateOpen(true)}>
          + {tr("Add savings account")}
        </button>
      </div>

      <Error error={savingsQ.error} />
      <Loading show={savingsQ.isPending} />

      {/* 3. Danh sách chi tiết hiện ở dưới full trang */}
      <div className="holdings-table-wrap">
        <table className="holdings-table">
          <thead>
            <tr>
              <th>{tr("Institution")}</th>
              <th>{tr("Savings account name")}</th>
              <th>{tr("Principal")}</th>
              <th>{tr("Interest rate")}</th>
              <th>{tr("Term (months)")}</th>
              <th>{tr("Deposit date")}</th>
              <th>{tr("Maturity date")}</th>
              <th>{tr("Expected interest")}</th>
              <th>{tr("Status")}</th>
              <th>{tr("Edit")} / {tr("Delete")}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
                  {tr("No savings accounts yet.")}
                </td>
              </tr>
            ) : (
              displayRows.map(row => {
                const status = savingsStatusText(row);
                const term = row.current_term;
                return (
                  <tr key={row.id} onClick={() => setDetailId(row.id)} style={{ cursor: "pointer" }}>
                    <td><strong>{row.institution}</strong></td>
                    <td>{row.name}</td>
                    <td><strong>{fmtMoneyDisplay(row.principal)} {row.currency}</strong></td>
                    <td>{term ? `${fmtRate(term.annual_rate)}%/năm` : "—"}</td>
                    <td>{term ? `${term.term_months} ${tr("months")}` : "—"}</td>
                    <td>{term?.start_date ?? row.opened_date}</td>
                    <td>{term?.maturity_date ?? "—"}</td>
                    <td>{term?.expected_interest ? `${fmtMoneyDisplay(term.expected_interest)} đ` : "—"}</td>
                    <td><span className={`badge ${savingsStatusClass(status)}`}>{tr(status)}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button type="button" className="text-button" onClick={() => setDetailId(row.id)}>
                          {tr("Details")}
                        </button>
                        <button
                          type="button"
                          className="text-button danger"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm(tr("Are you sure you want to delete this savings account?"))) {
                              deleteMutation.mutate(row.id);
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

      {createOpen && (
        <Modal title="Add savings account" onClose={() => setCreateOpen(false)}>
          <SavingsCreateForm
            walletAccounts={walletAccounts}
            onDone={() => { setCreateOpen(false); refresh(); }}
            onCancel={() => setCreateOpen(false)}
          />
        </Modal>
      )}

      {detailId != null && (
        <SavingsDetailDialog
          id={detailId}
          walletAccounts={walletAccounts}
          onClose={() => setDetailId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function SavingsCreateForm({ walletAccounts, onDone, onCancel }: { walletAccounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const { tr, label, language } = useI18n();
  const { balances } = useAccountBalances(walletAccounts);
  const [openedDate, setOpenedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [termMonths, setTermMonths] = useState("12");
  const [principal, setPrincipal] = useState("");
  const [savingsDeduct, setSavingsDeduct] = useState(true);
  const [savingsFundingAccount, setSavingsFundingAccount] = useState("");
  const create = useMutation({ mutationFn: (input: SavingsCreateInput) => api.assets.savings.create(input), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    const fId = savingsDeduct ? Number(savingsFundingAccount || v("funding_account_id") || (walletAccounts[0]?.id ? String(walletAccounts[0].id) : "0")) : undefined;
    create.mutate({
      institution: v("institution"), product_name: v("product_name") || undefined, name: v("name"),
      principal: principal || v("principal"), funding_account_id: fId && fId > 0 ? fId : undefined, opened_date: openedDate || v("opened_date"),
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
      <Field label="Deposit date"><DateRow name="opened_date" value={openedDate} onChange={setOpenedDate} language={language} label="Deposit date" /></Field>
      <Field label="Term (months)"><input name="term_months" type="number" min={1} step={1} required value={termMonths} onChange={e => setTermMonths(e.target.value)} /></Field>
      <label className="checkbox-row" style={{ marginTop: "4px" }}>
        <input type="checkbox" checked={savingsDeduct} onChange={e => setSavingsDeduct(e.target.checked)} />
        <span>{tr("Deduct from payment account")}</span>
      </label>
      {savingsDeduct && (
        <Field label="Payment account">
          <select
            name="funding_account_id"
            aria-label={tr("Payment account")}
            value={savingsFundingAccount || (walletAccounts[0]?.id ? String(walletAccounts[0].id) : "")}
            onChange={e => setSavingsFundingAccount(e.target.value)}
            required
          >
            {walletAccounts.map(a => (
              <option value={a.id} key={a.id}>
                {a.name} ({fmtMoneyDisplay(balances.get(a.id) ?? "0")} VND)
              </option>
            ))}
          </select>
        </Field>
      )}
      {savingsDeduct && walletAccounts.length === 0 && <p className="hint">{tr("No wallet accounts available. Create a cash, bank, or e-wallet account first.")}</p>}
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

  const deleteSavings = useMutation({
    mutationFn: () => api.assets.savings.remove(id),
    onSuccess: () => {
      invalidateAllFinancialQueries(qc);
      onClose();
      onChanged();
    },
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
        {term && <div><dt>{tr("Interest rate")}</dt><dd>{fmtRate(term.annual_rate)}%/năm</dd></div>}
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
      <div className="form-actions" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        {row.editable && <button type="button" className="secondary" onClick={() => setAction("edit")}>{tr("Edit")}</button>}
        {canCloseNormal && <button type="button" className="primary" onClick={() => setAction("close")}>{tr("Settle")}</button>}
        {canEarlyClose && <button type="button" className="secondary" onClick={() => setAction("early-close")}>{tr("Early settle")}</button>}
        {canRenew && <button type="button" className="secondary" onClick={() => setAction("renew")}>{tr("Renew")}</button>}
        <button
          type="button"
          className="text-button danger"
          style={{ marginLeft: "auto" }}
          disabled={deleteSavings.isPending}
          onClick={() => {
            if (window.confirm(tr("Are you sure you want to delete this savings account?"))) {
              deleteSavings.mutate();
            }
          }}
        >
          {deleteSavings.isPending ? tr("Deleting...") : tr("Delete savings account")}
        </button>
      </div>
      <h4>{tr("Term history")}</h4>
      <Empty show={(row.terms ?? []).length === 0} text="No terms recorded yet." />
      <div className="savings-term-history">{(row.terms ?? []).map(t => <div className="savings-term-row" key={t.id}>
        <strong>{tr("Term")} {t.sequence}</strong>
        <span>{t.start_date} - {t.maturity_date}</span>
        <span>{fmtMoneyDisplay(t.principal)} {row.currency}</span>
        <span>{fmtRate(t.annual_rate)}%/năm</span>
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
    <Field label="Annual interest rate (%/year)"><input name="annual_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue={term?.annual_rate ? fmtRate(term.annual_rate) : ""} required /></Field>
    <Field label="Demand interest rate (%/year)"><input name="non_term_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue={term?.non_term_rate ? fmtRate(term.non_term_rate) : "0"} /></Field>
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
function BackupPanel() {
  const { tr, language } = useI18n();
  const qc = useQueryClient();

  const backupsQ = useQuery({
    queryKey: ["backups"],
    queryFn: api.backup.list,
  });

  const [backupMode, setBackupMode] = useState<"project" | "download">("project");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Restore state
  const [uploadRestoreFile, setUploadRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    mode: "project" | "upload";
    filename?: string;
    file?: File;
  }>({ open: false, mode: "project" });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; filename?: string }>({ open: false });
  const [isDeleting, setIsDeleting] = useState(false);

  const createProjectBackup = useMutation({
    mutationFn: api.backup.createProject,
    onSuccess: data => {
      setStatusMsg({ type: "success", text: data.message || tr("Backup created successfully.") });
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: err => {
      setStatusMsg({ type: "error", text: err instanceof globalThis.Error ? err.message : String(err) });
    },
  });

  async function handleCreateBackup() {
    setStatusMsg(null);
    if (backupMode === "project") {
      createProjectBackup.mutate();
    } else {
      setIsBackingUp(true);
      try {
        const { blob, filename } = await api.backup.createDownload();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        setStatusMsg({ type: "success", text: tr("Backup created successfully.") });
      } catch (err) {
        setStatusMsg({ type: "error", text: err instanceof globalThis.Error ? err.message : String(err) });
      } finally {
        setIsBackingUp(false);
      }
    }
  }

  async function executeRestore() {
    setStatusMsg(null);
    setIsRestoring(true);
    try {
      if (confirmModal.mode === "project" && confirmModal.filename) {
        const res = await api.backup.restoreProject(confirmModal.filename);
        setStatusMsg({ type: "success", text: res.message || tr("Restore completed successfully.") });
      } else if (confirmModal.mode === "upload" && confirmModal.file) {
        const fileBytes = await confirmModal.file.arrayBuffer();
        const data = await api.backup.restoreUpload(fileBytes);
        setStatusMsg({ type: "success", text: data.message || tr("Restore completed successfully.") });
        setUploadRestoreFile(null);
      }
      setConfirmModal({ open: false, mode: "project" });
      invalidateAllFinancialQueries(qc);
    } catch (err) {
      setStatusMsg({ type: "error", text: err instanceof globalThis.Error ? err.message : String(err) });
      setConfirmModal({ open: false, mode: "project" });
    } finally {
      setIsRestoring(false);
    }
  }

  async function executeDelete() {
    if (!deleteModal.filename) return;
    setIsDeleting(true);
    try {
      const res = await api.backup.remove(deleteModal.filename);
      setStatusMsg({ type: "success", text: res.message || tr("Backup deleted successfully.") });
      qc.invalidateQueries({ queryKey: ["backups"] });
      setDeleteModal({ open: false });
    } catch (err) {
      setStatusMsg({ type: "error", text: err instanceof globalThis.Error ? err.message : String(err) });
      setDeleteModal({ open: false });
    } finally {
      setIsDeleting(false);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {statusMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: statusMsg.type === "success" ? "#e6f4ea" : "#fce8e6",
            color: statusMsg.type === "success" ? "#137333" : "#c5221f",
            border: `1px solid ${statusMsg.type === "success" ? "#ceead6" : "#fad2cf"}`,
            fontWeight: 500,
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* 1. Tạo bản sao lưu & Khôi phục từ file */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        <div className="panel data-workflow">
          <h3 style={{ margin: 0 }}>{tr("Create backup")}</h3>
          <p className="hint" style={{ margin: 0 }}>
            {language === "vi"
              ? "Sao lưu toàn bộ dữ liệu hiện tại trong cơ sở dữ liệu (tài khoản, giao dịch, danh mục, tài sản, tiết kiệm)."
              : "Backup entire database including accounts, transactions, categories, assets, and savings."}
          </p>

          <div className="backup-radio-group">
            <label className="backup-radio-label">
              <input
                type="radio"
                name="backup_mode"
                checked={backupMode === "project"}
                onChange={() => setBackupMode("project")}
              />
              <span>{tr("Save to project folder")}</span>
              <small>(backup/)</small>
            </label>
            <label className="backup-radio-label">
              <input
                type="radio"
                name="backup_mode"
                checked={backupMode === "download"}
                onChange={() => setBackupMode("download")}
              />
              <span>{tr("Download to computer")}</span>
              <small>(.db)</small>
            </label>
          </div>

          <button
            type="button"
            className="primary"
            disabled={createProjectBackup.isPending || isBackingUp}
            onClick={handleCreateBackup}
            style={{ width: "fit-content" }}
          >
            {createProjectBackup.isPending || isBackingUp
              ? (language === "vi" ? "Đang sao lưu..." : "Backing up...")
              : backupMode === "project"
              ? `+ ${tr("Save to project folder")}`
              : `⬇ ${tr("Download to computer")}`}
          </button>
        </div>

        <div className="panel data-workflow">
          <h3 style={{ margin: 0 }}>{tr("Restore from uploaded file")}</h3>
          <p className="hint" style={{ margin: 0 }}>
            {language === "vi"
              ? "Tải lên file sao lưu SQLite (.db) từ máy tính để khôi phục lại toàn bộ dữ liệu."
              : "Upload a SQLite backup file (.db) to restore all database contents."}
          </p>
          <input
            type="file"
            accept=".db,.sqlite,.sqlite3"
            aria-label={tr("Choose backup file (.db)")}
            onChange={e => setUploadRestoreFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="secondary"
            disabled={!uploadRestoreFile || isRestoring}
            onClick={() => setConfirmModal({ open: true, mode: "upload", file: uploadRestoreFile! })}
            style={{ width: "fit-content", borderColor: "#ea868f", color: "#c5221f" }}
          >
            {tr("Restore from uploaded file")}
          </button>
        </div>
      </div>

      {/* 2. Danh sách các bản sao lưu trong project */}
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{tr("Project backups")}</h3>
          <button
            type="button"
            className="secondary"
            onClick={() => qc.invalidateQueries({ queryKey: ["backups"] })}
            style={{ padding: "4px 10px", fontSize: "0.82rem" }}
          >
            {language === "vi" ? "Làm mới" : "Refresh"}
          </button>
        </div>

        <Loading show={backupsQ.isPending} />
        <Error error={backupsQ.error} />
        <Empty show={!backupsQ.isPending && (backupsQ.data?.length ?? 0) === 0} text="No backups found in project." />

        {(backupsQ.data?.length ?? 0) > 0 && (
          <div style={{ overflowX: "auto", width: "100%" }}>
            <table className="table full-width" style={{ width: "100%", textAlign: "left" }}>
              <thead>
                <tr>
                  <th>{language === "vi" ? "Tên file sao lưu" : "Backup filename"}</th>
                  <th>{tr("Size")}</th>
                  <th>{tr("Created at")}</th>
                  <th style={{ textAlign: "right" }}>{tr("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {backupsQ.data?.map(b => (
                  <tr key={b.filename}>
                    <td>
                      <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{b.filename}</span>
                      {b.is_db && (
                        <span
                          style={{
                            marginLeft: "8px",
                            fontSize: "0.75rem",
                            background: "var(--accent-soft)",
                            color: "var(--accent)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: 600,
                          }}
                        >
                          SQLite DB
                        </span>
                      )}
                    </td>
                    <td>{formatBytes(b.size_bytes)}</td>
                    <td>{b.formatted_date}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "14px" }}>
                        <a
                          href={api.backup.downloadUrl(b.filename)}
                          download={b.filename}
                          style={{
                            textDecoration: "none",
                            color: "var(--accent)",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        >
                          {tr("Download")}
                        </a>
                        {b.is_db && (
                          <button
                            type="button"
                            disabled={isRestoring || isDeleting}
                            onClick={() => setConfirmModal({ open: true, mode: "project", filename: b.filename })}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#0084d6",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              padding: 0,
                              cursor: "pointer",
                            }}
                          >
                            {tr("Restore")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isRestoring || isDeleting}
                          onClick={() => setDeleteModal({ open: true, filename: b.filename })}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#c5221f",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            padding: 0,
                            cursor: "pointer",
                          }}
                        >
                          {tr("Delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Restore */}
      {confirmModal.open && (
        <Modal title="Confirm restore" onClose={() => setConfirmModal({ open: false, mode: "project" })}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "12px",
                borderRadius: "8px",
                background: "#fce8e6",
                border: "1px solid #fad2cf",
                color: "#c5221f",
                fontWeight: 500,
                fontSize: "0.9rem",
              }}
            >
              ⚠️ {tr("Warning: Restoring will overwrite all current database records.")}
            </div>

            <p style={{ margin: 0 }}>
              {confirmModal.mode === "project" ? (
                <span>
                  {language === "vi"
                    ? `Bạn có chắc chắn muốn khôi phục cơ sở dữ liệu từ bản sao lưu `
                    : `Are you sure you want to restore database from `}
                  <strong>{confirmModal.filename}</strong>?
                </span>
              ) : (
                <span>
                  {language === "vi"
                    ? `Bạn có chắc chắn muốn khôi phục cơ sở dữ liệu từ file tải lên `
                    : `Are you sure you want to restore database from file `}
                  <strong>{confirmModal.file?.name}</strong>?
                </span>
              )}
            </p>

            <div className="form-actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmModal({ open: false, mode: "project" })}
              >
                {tr("Cancel")}
              </button>
              <button
                type="button"
                className="primary"
                disabled={isRestoring}
                onClick={executeRestore}
                style={{ background: "#c5221f", borderColor: "#c5221f" }}
              >
                {isRestoring ? (language === "vi" ? "Đang khôi phục..." : "Restoring...") : tr("Confirm restore")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for Delete Backup */}
      {deleteModal.open && deleteModal.filename && (
        <Modal title="Delete backup" onClose={() => setDeleteModal({ open: false })}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ margin: 0 }}>
              {language === "vi"
                ? `Bạn có chắc chắn muốn xoá bản sao lưu `
                : `Are you sure you want to delete backup `}
              <strong style={{ fontFamily: "monospace" }}>{deleteModal.filename}</strong>?
            </p>
            <p className="hint" style={{ margin: 0, color: "#c5221f" }}>
              {language === "vi" ? "Thao tác này không thể hoàn tác." : "This action cannot be undone."}
            </p>

            <div className="form-actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setDeleteModal({ open: false })}
                disabled={isDeleting}
              >
                {tr("Cancel")}
              </button>
              <button
                type="button"
                className="primary"
                disabled={isDeleting}
                onClick={executeDelete}
                style={{ background: "#c5221f", borderColor: "#c5221f" }}
              >
                {isDeleting ? (language === "vi" ? "Đang xoá..." : "Deleting...") : (language === "vi" ? "Xoá bản sao lưu" : "Delete backup")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function formatVnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

function BankStatementModal({
  initialAccountId,
  initialStart,
  initialEnd,
  onClose,
}: {
  initialAccountId?: string | number;
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
}) {
  const { tr, label, language } = useI18n();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const accounts = accountsQ.data ?? [];

  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId ? String(initialAccountId) : "");
  const [startDate, setStartDate] = useState<string>(initialStart ?? "");
  const [endDate, setEndDate] = useState<string>(initialEnd ?? "");

  const setQuickRange = (range: "all" | "this_month" | "last_month" | "this_year") => {
    const d = new Date();
    if (range === "all") {
      setStartDate("");
      setEndDate("");
    } else if (range === "this_month") {
      setStartDate(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`);
      setEndDate(todayIso());
    } else if (range === "last_month") {
      const firstLastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const lastLastMonth = new Date(d.getFullYear(), d.getMonth(), 0);
      setStartDate(`${firstLastMonth.getFullYear()}-${pad2(firstLastMonth.getMonth() + 1)}-01`);
      setEndDate(`${lastLastMonth.getFullYear()}-${pad2(lastLastMonth.getMonth() + 1)}-${pad2(lastLastMonth.getDate())}`);
    } else if (range === "this_year") {
      setStartDate(`${d.getFullYear()}-01-01`);
      setEndDate(todayIso());
    }
  };

  const statementQ = useQuery({
    queryKey: ["statement-data", selectedAccountId, startDate, endDate],
    queryFn: () => api.exports.statementData({
      account_id: selectedAccountId || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    }),
  });

  const statement = statementQ.data;
  const currentAccount = accounts.find(a => String(a.id) === selectedAccountId);
  const brand = currentAccount ? getAccountBrand(currentAccount.name, currentAccount.account_type) : null;

  const fmtVND = (val: string | number) => {
    const n = Number(val);
    if (isNaN(n)) return "0 ₫";
    return `${n.toLocaleString("vi-VN")} ₫`;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: "1100px", width: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.3rem" }}>🖨️</span>
            <h3 style={{ margin: 0, fontSize: "1.15rem" }}>
              {language === "vi" ? "Sao Kê Tài Khoản & Xuất PDF" : "Bank Statement & PDF Export"}
            </h3>
          </div>
          <button type="button" className="text-button" onClick={onClose} style={{ fontSize: "1.2rem", padding: "4px 8px" }}>
            ✕
          </button>
        </div>

        <div className="statement-modal-body" style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {/* Controls toolbar */}
          <div className="statement-toolbar">
            <div className="statement-filters">
              <select
                aria-label={tr("Account")}
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--card)", fontSize: "0.85rem", fontWeight: 600 }}
              >
                <option value="">{tr("All accounts")}</option>
                {accounts.map(a => (
                  <option value={a.id} key={a.id}>
                    {a.name} · {label(a.account_type)}
                  </option>
                ))}
              </select>

              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                <button type="button" className={`pill-btn ${!startDate && !endDate ? "active" : ""}`} onClick={() => setQuickRange("all")}>
                  {language === "vi" ? "Toàn bộ" : "All"}
                </button>
                <button type="button" className="pill-btn" onClick={() => setQuickRange("this_month")}>
                  {language === "vi" ? "Tháng này" : "This month"}
                </button>
                <button type="button" className="pill-btn" onClick={() => setQuickRange("last_month")}>
                  {language === "vi" ? "Tháng trước" : "Last month"}
                </button>
                <button type="button" className="pill-btn" onClick={() => setQuickRange("this_year")}>
                  {language === "vi" ? "Năm nay" : "This year"}
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}>
                <span>{language === "vi" ? "Từ:" : "From:"}</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  max={endDate || undefined}
                  style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--card)", fontSize: "0.82rem", cursor: "pointer" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}>
                <span>{language === "vi" ? "Đến:" : "To:"}</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  min={startDate || undefined}
                  style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--card)", fontSize: "0.82rem", cursor: "pointer" }}
                />
              </div>
            </div>

            <div className="statement-actions">
              <button type="button" className="primary" onClick={handlePrint} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>🖨️</span> {language === "vi" ? "In / Lưu PDF" : "Print / Save PDF"}
              </button>
              <a
                className="secondary"
                href={api.exports.statementXlsxUrl({ account_id: selectedAccountId, start_date: startDate, end_date: endDate })}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontWeight: 600, fontSize: "0.85rem" }}
              >
                <span>📊</span> Excel (.xlsx)
              </a>
              <a
                className="secondary"
                href={api.exports.statementCsvUrl({ account_id: selectedAccountId, start_date: startDate, end_date: endDate })}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontWeight: 600, fontSize: "0.85rem" }}
              >
                <span>📄</span> CSV
              </a>
            </div>
          </div>

          <Loading show={statementQ.isPending} />
          <Error error={statementQ.error} />

          {/* Statement Document */}
          {statement && (
            <div className="statement-print-sheet">
              {/* Header */}
              <div className="statement-header">
                <div>
                  <h1>{language === "vi" ? "SAO KÊ TÀI KHOẢN" : "ACCOUNT STATEMENT"}</h1>
                  <div className="statement-query-time">
                    {language === "vi" ? "Thời gian truy vấn: " : "Statement Period: "}
                    <strong>
                      {statement.period.start_date ? formatVnDate(statement.period.start_date) : (language === "vi" ? "Từ đầu" : "Beginning")} - {statement.period.end_date ? formatVnDate(statement.period.end_date) : (language === "vi" ? "Đến nay" : "Current")}
                    </strong>
                  </div>
                </div>

                <div className="statement-logo-box">
                  {currentAccount ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <AccountLogo name={currentAccount.name} accountType={currentAccount.account_type} size={40} />
                      <div style={{ textAlign: "right" }}>
                        <strong style={{ fontSize: "1.15rem", color: brand?.primaryColor || "#0f172a", display: "block", textTransform: "uppercase" }}>
                          {brand?.name || currentAccount.name}
                        </strong>
                        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                          {statement.account.account_type_label}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: "1.15rem", color: "#003366", textTransform: "uppercase" }}>
                        Personal Finance Ledger
                      </strong>
                      <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block" }}>
                        {language === "vi" ? "Báo cáo tổng hợp" : "Consolidated Statement"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata Info Grid */}
              <div className="statement-meta-grid">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Số / Tên tài khoản:" : "Account Name / No:"}</span>
                    <strong>{statement.account.name}</strong>
                  </div>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Loại tài khoản:" : "Account Type:"}</span>
                    <strong>{statement.account.account_type_label}</strong>
                  </div>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Số dư đầu kỳ:" : "Opening Balance:"}</span>
                    <strong style={{ color: "#0f172a" }}>{fmtVND(statement.opening_balance)}</strong>
                  </div>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Số dư cuối kỳ:" : "Closing Balance:"}</span>
                    <strong style={{ color: "#0369a1", fontSize: "0.95rem" }}>{fmtVND(statement.closing_balance)}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Tổng số giao dịch:" : "Transactions Count:"}</span>
                    <strong>{statement.transaction_count}</strong>
                  </div>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Tổng tiền vào (+):" : "Total Inflow (+):"}</span>
                    <strong style={{ color: "#16a34a" }}>+{fmtVND(statement.total_in)}</strong>
                  </div>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Tổng tiền ra (-):" : "Total Outflow (-):"}</span>
                    <strong style={{ color: "#dc2626" }}>-{fmtVND(statement.total_out)}</strong>
                  </div>
                  <div className="statement-meta-row">
                    <span>{language === "vi" ? "Đơn vị tiền tệ:" : "Currency:"}</span>
                    <strong>{statement.account.currency}</strong>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="statement-table-wrap">
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "center", width: "90px" }}>{language === "vi" ? "Ngày" : "Date"}</th>
                      <th style={{ textAlign: "center", width: "100px" }}>{language === "vi" ? "Ngày hiệu lực" : "Effective"}</th>
                      <th style={{ textAlign: "center", width: "115px" }}>{language === "vi" ? "Loại giao dịch" : "Type"}</th>
                      <th style={{ textAlign: "left" }}>{language === "vi" ? "Nội dung" : "Description"}</th>
                      <th style={{ textAlign: "center", width: "170px" }}>Ref#</th>
                      <th style={{ textAlign: "right", width: "140px" }}>{language === "vi" ? "Số tiền giao dịch" : "Amount"}</th>
                      <th style={{ textAlign: "right", width: "140px" }}>{language === "vi" ? "Số dư" : "Balance"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "28px", color: "#64748b" }}>
                          {language === "vi" ? "Không có giao dịch nào trong khoảng thời gian này." : "No transactions recorded in this period."}
                        </td>
                      </tr>
                    ) : (
                      statement.transactions.map(tx => {
                        const amt = Number(tx.amount);
                        const isPos = amt > 0;
                        const isNeg = amt < 0;
                        return (
                          <tr key={tx.entry_id}>
                            <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{formatVnDate(tx.transaction_date)}</td>
                            <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{formatVnDate(tx.effective_date)}</td>
                            <td style={{ textAlign: "center", whiteSpace: "nowrap", fontWeight: 600, color: "#475569" }}>
                              {tx.event_type_label}
                            </td>
                            <td style={{ textAlign: "left", wordBreak: "break-word", lineHeight: 1.35 }}>
                              {tx.description}
                            </td>
                            <td style={{ textAlign: "center", fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>
                              {tx.ref_no}
                            </td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: isPos ? "#16a34a" : (isNeg ? "#dc2626" : "#0f172a") }}>
                              {isPos ? `+${fmtMoneyDisplay(tx.amount)}` : fmtMoneyDisplay(tx.amount)}
                            </td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: "#0f172a" }}>
                              {fmtMoneyDisplay(tx.running_balance)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Statement Footer */}
              <div className="statement-footer">
                <div>
                  <span style={{ border: "1px solid #94a3b8", padding: "2px 6px", borderRadius: "4px", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {language === "vi" ? "Bảo mật" : "Confidential"}
                  </span>
                </div>
                <div>
                  {language === "vi" ? "Ngày in: " : "Printed on: "} {new Date().toLocaleDateString("vi-VN")}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DataPage() {
  const { tr, label, language } = useI18n();
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<"io" | "review" | "backup">("io");

  // IO State
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const [exportAccountId, setExportAccountId] = useState("");
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [statementModalOpen, setStatementModalOpen] = useState(false);

  const setDataQuickRange = (range: "all" | "this_month" | "last_month" | "this_year") => {
    const d = new Date();
    if (range === "all") {
      setExportStart("");
      setExportEnd("");
    } else if (range === "this_month") {
      setExportStart(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`);
      setExportEnd(todayIso());
    } else if (range === "last_month") {
      const firstLastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const lastLastMonth = new Date(d.getFullYear(), d.getMonth(), 0);
      setExportStart(`${firstLastMonth.getFullYear()}-${pad2(firstLastMonth.getMonth() + 1)}-01`);
      setExportEnd(`${lastLastMonth.getFullYear()}-${pad2(lastLastMonth.getMonth() + 1)}-${pad2(lastLastMonth.getDate())}`);
    } else if (range === "this_year") {
      setExportStart(`${d.getFullYear()}-01-01`);
      setExportEnd(todayIso());
    }
  };

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setStatus(tr("Uploading..."));
    try {
      const { ok, status: responseStatus, data: body } = await api.imports.uploadMoneyLover(file.name, await file.arrayBuffer());
      if (ok && body) {
        setStatus(`${tr("Imported rows")}: ${body.row_count}${applySummary(tr, body.apply)}`);
        invalidateAllFinancialQueries(qc);
      } else {
        setStatus(body?.detail ?? `${tr("Load failed")} (HTTP ${responseStatus})`);
      }
    } catch (error) {
      const message = error instanceof globalThis.Error ? error.message : String(error);
      setStatus(`${tr("Load failed")}: ${message}`);
    } finally {
      setUploading(false);
    }
  }

  // Review State
  const [applyStatus, setApplyStatus] = useState<Record<number, string>>({});
  const imports = useQuery({ queryKey: ["imports"], queryFn: api.imports.list });
  const reconciliation = useQuery({ queryKey: ["reconciliation"], queryFn: api.reconciliation.list });
  const apply = useMutation({
    mutationFn: (batchId: number) => api.imports.apply(batchId),
    onSuccess: (result, batchId) => {
      setApplyStatus(prev => ({ ...prev, [batchId]: applySummary(tr, result) }));
      invalidateAllFinancialQueries(qc);
    },
    onError: (error, batchId) => {
      const message = error instanceof globalThis.Error ? error.message : String(error);
      setApplyStatus(prev => ({ ...prev, [batchId]: `${tr("Load failed")}: ${message}` }));
    },
  });

  return (
    <section className="data-page-section">
      <div className="segmented" style={{ maxWidth: 620, marginBottom: "16px", flexWrap: "wrap" }}>
        <button
          type="button"
          className={subTab === "io" ? "active" : ""}
          onClick={() => setSubTab("io")}
        >
          {language === "vi" ? "Nhập & Xuất dữ liệu" : "Import & Export"}
        </button>
        <button
          type="button"
          className={subTab === "review" ? "active" : ""}
          onClick={() => setSubTab("review")}
        >
          {language === "vi" ? "Đối soát & Xem lại" : "Reconciliation & Review"} {imports.data && imports.data.length > 0 ? `(${imports.data.length})` : ""}
        </button>
        <button
          type="button"
          className={subTab === "backup" ? "active" : ""}
          onClick={() => setSubTab("backup")}
        >
          {language === "vi" ? "Sao lưu & Khôi phục" : "Backup & Restore"}
        </button>
      </div>

      {subTab === "io" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
          <div className="panel data-workflow">
            <h3>{tr("Import from Money Lover")}</h3>
            <input type="file" accept=".csv,.xlsx" aria-label={tr("Choose file")} onChange={e => setFile(e.target.files?.[0] ?? null)}/>
            <button type="button" className="primary" disabled={!file || uploading} onClick={upload}>
              {uploading ? tr("Uploading...") : tr("Upload for review")}
            </button>
            {status && <p className="hint" role="status">{status}</p>}
            <p className="hint">{tr("Matching rows are applied straight into your ledger on upload; unmatched wallets are reported so you can fix and re-apply from the Review page.")}</p>
          </div>
          <div className="panel data-workflow">
            <h3>{language === "vi" ? "Xuất dữ liệu & Sao kê tài khoản" : tr("Export filters")}</h3>
            <Field label="Account">
              <select aria-label={tr("Account")} value={exportAccountId} onChange={e => setExportAccountId(e.target.value)}>
                <option value="">{tr("All accounts")}</option>
                {(accountsQ.data ?? []).map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
              </select>
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", margin: "4px 0 8px" }}>
              <button type="button" className={`pill-btn ${!exportStart && !exportEnd ? "active" : ""}`} onClick={() => setDataQuickRange("all")}>
                {language === "vi" ? "Toàn bộ" : "All"}
              </button>
              <button type="button" className="pill-btn" onClick={() => setDataQuickRange("this_month")}>
                {language === "vi" ? "Tháng này" : "This month"}
              </button>
              <button type="button" className="pill-btn" onClick={() => setDataQuickRange("last_month")}>
                {language === "vi" ? "Tháng trước" : "Last month"}
              </button>
              <button type="button" className="pill-btn" onClick={() => setDataQuickRange("this_year")}>
                {language === "vi" ? "Năm nay" : "This year"}
              </button>
            </div>
            <Field label="Start date">
              <input type="date" aria-label={tr("Start date")} value={exportStart} onChange={e => setExportStart(e.target.value)} onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }} max={exportEnd || undefined} style={{ cursor: "pointer" }} />
            </Field>
            <Field label="End date">
              <input type="date" aria-label={tr("End date")} value={exportEnd} onChange={e => setExportEnd(e.target.value)} onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }} min={exportStart || undefined} style={{ cursor: "pointer" }} />
            </Field>
            <div className="form-actions" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
              <button
                type="button"
                className="primary"
                onClick={() => setStatementModalOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>🖨️</span> {language === "vi" ? "Xem & In sao kê (PDF)" : "View & Print Statement (PDF)"}
              </button>
              <a
                className="secondary"
                href={api.exports.statementXlsxUrl({ account_id: exportAccountId, start_date: exportStart, end_date: exportEnd })}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>📊</span> {language === "vi" ? "Xuất sao kê Excel" : "Statement XLSX"}
              </a>
              <a
                className="secondary"
                href={api.exports.statementCsvUrl({ account_id: exportAccountId, start_date: exportStart, end_date: exportEnd })}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>📄</span> {language === "vi" ? "Xuất sao kê CSV" : "Statement CSV"}
              </a>
            </div>
          </div>
        </div>
      ) : subTab === "review" ? (
        <div className="review-grid">
          <article className="panel">
            <h3>{tr("Import batches")}</h3>
            <Loading show={imports.isPending}/>
            <Error error={imports.error}/>
            <Empty show={!imports.isPending && imports.data?.length === 0} text="No import batches yet."/>
            {imports.data?.map(x => (
              <div className="review-row" key={x.id}>
                <div>
                  <strong>{x.original_filename}</strong>
                  <small>{x.source} · {x.row_count} {tr("rows")} · {x.applied_row_count >= x.row_count ? tr("Applied") : `${x.applied_row_count}/${x.row_count} ${tr("applied")}`}</small>
                  {applyStatus[x.id] && <small className="hint">{applyStatus[x.id]}</small>}
                </div>
                <div className="review-row-actions">
                  <small>{x.imported_at}</small>
                  <button type="button" className="secondary" disabled={apply.isPending && apply.variables === x.id} onClick={() => apply.mutate(x.id)}>
                    {apply.isPending && apply.variables === x.id ? tr("Applying...") : x.applied_row_count >= x.row_count ? tr("Re-apply") : tr("Apply")}
                  </button>
                </div>
              </div>
            ))}
          </article>
          <article className="panel">
            <h3>{tr("Reconciliation candidates")}</h3>
            <Loading show={reconciliation.isPending}/>
            <Error error={reconciliation.error}/>
            <Empty show={!reconciliation.isPending && reconciliation.data?.length === 0} text="No reconciliation candidates yet."/>
            {reconciliation.data?.map(x => (
              <div className="review-row" key={x.id}>
                <div>
                  <strong>{tr("Raw row")} #{x.source_row_number}</strong>
                  <small>{x.transaction_date} · {label(x.event_type)} · {tr("Event")} #{x.financial_event_id}</small>
                </div>
                <span className="badge warning">{label(x.state)}</span>
              </div>
            ))}
          </article>
        </div>
      ) : (
        <BackupPanel />
      )}
      {statementModalOpen && (
        <BankStatementModal
          initialAccountId={exportAccountId}
          initialStart={exportStart}
          initialEnd={exportEnd}
          onClose={() => setStatementModalOpen(false)}
        />
      )}
    </section>
  );
}

function getLevel1Category(categoryId: number | null | undefined, categories: Category[]): Category | undefined {
  if (!categoryId) return undefined;
  const byId = new Map(categories.map(c => [c.id, c]));
  let current = byId.get(categoryId);
  if (!current) return undefined;

  const chain: Category[] = [];
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parent_id == null ? undefined : byId.get(current.parent_id);
  }

  if (chain.length > 1 && (chain[0].name.toLowerCase() === "expenses" || chain[0].name.toLowerCase() === "income")) {
    return chain[1];
  }
  return chain[0];
}

function getLevel1ExpenseCategories(categories: Category[]): Category[] {
  const expensesRoot = categories.find(c => c.parent_id == null && c.name.toLowerCase() === "expenses");
  if (expensesRoot) {
    return categories.filter(c => c.parent_id === expensesRoot.id && c.is_active !== false);
  }
  return categories.filter(c => c.parent_id == null && c.name.toLowerCase() !== "income" && c.is_active !== false);
}

function Reports() {
  const { tr, label, language } = useI18n();
  const eventsQ = useQuery({ queryKey: ["events"], queryFn: api.events.list });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: api.categories.list });

  const [timeScope, setTimeScope] = useState<"ALL" | "YEAR" | "QUARTER" | "MONTH" | "WEEK" | "DAY" | "CUSTOM">("MONTH");
  const [selectedYear, setSelectedYear] = useState<string>(() => String(new Date().getFullYear()));
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayIso());
  const [dayWindowOffset, setDayWindowOffset] = useState<number>(0);
  const [customStart, setCustomStart] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [customEnd, setCustomEnd] = useState(() => todayIso());
  const [activeReportTab, setActiveReportTab] = useState<"time" | "category" | "account" | "payee">("time");
  const [categoryFlow, setCategoryFlow] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({});

  const todayStr = todayIso();
  const currentMonthKey = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const hasFuture = useMemo(() => (eventsQ.data ?? []).some(e => e.transaction_date > todayStr), [eventsQ.data, todayStr]);

  const pastEvents = useMemo(() => (eventsQ.data ?? []).filter(e => e.transaction_date <= todayStr), [eventsQ.data, todayStr]);
  const minTxMonth = useMemo(() => {
    return pastEvents.length > 0
      ? pastEvents.reduce((min, e) => e.transaction_date.slice(0, 7) < min ? e.transaction_date.slice(0, 7) : min, currentMonthKey)
      : currentMonthKey;
  }, [pastEvents, currentMonthKey]);
  const defaultMinMonth = `${Number(currentMonthKey.slice(0, 4)) - 1}-01`;
  const earliestMonthKey = minTxMonth < defaultMinMonth ? minTxMonth : defaultMinMonth;

  const allMonths: string[] = useMemo(() => {
    const list: string[] = [];
    for (let key = earliestMonthKey, guard = 0; key <= currentMonthKey && guard < 1200; key = shiftMonthKey(key, 1), guard++) {
      list.push(key);
    }
    if (hasFuture) {
      list.push("FUTURE");
    }
    return list;
  }, [earliestMonthKey, currentMonthKey, hasFuture]);

  const [monthWindowStartIndex, setMonthWindowStartIndex] = useState<number>(() => {
    return Math.max(0, allMonths.indexOf(currentMonthKey) - 2);
  });

  const visibleMonths = useMemo(() => {
    return allMonths.slice(monthWindowStartIndex, monthWindowStartIndex + 3);
  }, [allMonths, monthWindowStartIndex]);

  const lastMonthKey = shiftMonthKey(currentMonthKey, -1);
  function monthLabel(key: string): string {
    if (key === "FUTURE") return tr("Future");
    if (key === currentMonthKey) return tr("This month");
    if (key === lastMonthKey) return tr("Last month");
    const [y, m] = key.split("-");
    const currentYear = todayStr.slice(0, 4);
    if (y === currentYear) {
      return language === "vi" ? `Tháng ${Number(m)}` : `Month ${Number(m)}`;
    }
    return language === "vi" ? `Tháng ${Number(m)}/${y}` : `Month ${Number(m)}/${y}`;
  }

  // Weeks calculation
  const [selectedWeekYear, setSelectedWeekYear] = useState<number>(() => new Date().getFullYear());
  const [selectedWeekMonth, setSelectedWeekMonth] = useState<number>(() => new Date().getMonth() + 1);

  const thisWeekMonday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }, []);
  const thisWeekStart = useMemo(() => formatYmd(thisWeekMonday), [thisWeekMonday]);
  const thisWeekEnd = useMemo(() => {
    const end = new Date(thisWeekMonday);
    end.setDate(end.getDate() + 6);
    return formatYmd(end);
  }, [thisWeekMonday]);

  const lastWeekMonday = useMemo(() => {
    const d = new Date(thisWeekMonday);
    d.setDate(d.getDate() - 7);
    return d;
  }, [thisWeekMonday]);
  const lastWeekStart = useMemo(() => formatYmd(lastWeekMonday), [lastWeekMonday]);
  const lastWeekEnd = useMemo(() => {
    const end = new Date(lastWeekMonday);
    end.setDate(end.getDate() + 6);
    return formatYmd(end);
  }, [lastWeekMonday]);

  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(() => thisWeekStart);
  const [selectedWeekEnd, setSelectedWeekEnd] = useState<string | null>(() => thisWeekEnd);

  const currentMonthWeeks = useMemo(() => {
    const all = getYearWeeks(selectedWeekYear, language);
    return all.filter(w => {
      if (w.month !== selectedWeekMonth) return false;
      if (w.start === thisWeekStart && w.end === thisWeekEnd) return false;
      if (w.start === lastWeekStart && w.end === lastWeekEnd) return false;
      return true;
    });
  }, [selectedWeekYear, selectedWeekMonth, thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd, language]);

  const activeMonthBtnRef = useRef<HTMLButtonElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const activeWeekBtnRef = useRef<HTMLButtonElement>(null);

  // Day calculation
  const visibleDays = useMemo(() => {
    const today = todayIso();
    return [
      shiftIsoDate(today, dayWindowOffset - 3),
      shiftIsoDate(today, dayWindowOffset - 2),
      shiftIsoDate(today, dayWindowOffset - 1),
      shiftIsoDate(today, dayWindowOffset),
    ];
  }, [dayWindowOffset]);

  function onCalendarDateChange(iso: string) {
    if (!iso) return;
    setSelectedDate(iso);
    const [ty, tm, td] = todayIso().split("-").map(Number);
    const [py, pm, pd] = iso.split("-").map(Number);
    const diffTime = Date.UTC(py, pm - 1, pd) - Date.UTC(ty, tm - 1, td);
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < dayWindowOffset - 3 || diffDays > dayWindowOffset) {
      setDayWindowOffset(diffDays);
    }
  }

  const distinctYears = useMemo(() => {
    const years = new Set<string>();
    const thisYear = String(new Date().getFullYear());
    years.add(thisYear);
    (eventsQ.data ?? []).forEach(e => {
      if (e.transaction_date) years.add(e.transaction_date.slice(0, 4));
    });
    return Array.from(years).sort().reverse();
  }, [eventsQ.data]);

  const activeMonthKey = selectedMonthKey ?? currentMonthKey;

  const { startDate, endDate } = useMemo(() => {
    if (timeScope === "ALL") {
      const minDate = (eventsQ.data ?? []).reduce((min, e) => e.transaction_date < min ? e.transaction_date : min, "1970-01-01");
      const maxDate = (eventsQ.data ?? []).reduce((max, e) => e.transaction_date > max ? e.transaction_date : max, todayStr);
      return { startDate: minDate, endDate: maxDate };
    }
    if (timeScope === "YEAR") {
      return { startDate: `${selectedYear}-01-01`, endDate: `${selectedYear}-12-31` };
    }
    if (timeScope === "QUARTER") {
      const startMonth = String((selectedQuarter - 1) * 3 + 1).padStart(2, "0");
      const endMonthNum = selectedQuarter * 3;
      const lastDay = new Date(Number(selectedYear), endMonthNum, 0).getDate();
      return {
        startDate: `${selectedYear}-${startMonth}-01`,
        endDate: `${selectedYear}-${String(endMonthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    if (timeScope === "MONTH") {
      if (activeMonthKey === "FUTURE") {
        const nextMonthStart = shiftMonthKey(currentMonthKey, 1) + "-01";
        const maxDate = (eventsQ.data ?? []).reduce((max, e) => e.transaction_date > max ? e.transaction_date : max, todayStr);
        return { startDate: nextMonthStart, endDate: maxDate > nextMonthStart ? maxDate : nextMonthStart };
      }
      const [y, m] = activeMonthKey.split("-").map(Number);
      const endDay = new Date(y, m, 0).getDate();
      return {
        startDate: `${activeMonthKey}-01`,
        endDate: `${activeMonthKey}-${String(endDay).padStart(2, "0")}`,
      };
    }
    if (timeScope === "WEEK") {
      return {
        startDate: selectedWeekStart ?? thisWeekStart,
        endDate: selectedWeekEnd ?? thisWeekEnd,
      };
    }
    if (timeScope === "DAY") {
      return { startDate: selectedDate, endDate: selectedDate };
    }
    return {
      startDate: customStart || "1970-01-01",
      endDate: customEnd || todayStr,
    };
  }, [timeScope, selectedYear, selectedQuarter, activeMonthKey, currentMonthKey, todayStr, selectedWeekStart, selectedWeekEnd, thisWeekStart, thisWeekEnd, selectedDate, customStart, customEnd, eventsQ.data]);

  const events = eventsQ.data;
  const accounts = accountsQ.data;
  const categories = categoriesQ.data;

  const accountMap = useMemo(() => new Map((accounts ?? []).map(a => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map((categories ?? []).map(c => [c.id, c])), [categories]);

  const filteredEvents = useMemo(() => {
    return (events ?? []).filter(e => {
      if (e.excluded_from_reports) return false;
      if (startDate && e.transaction_date < startDate) return false;
      if (endDate && e.transaction_date > endDate) return false;
      return true;
    });
  }, [events, startDate, endDate]);

  let totalIncome = "0";
  let totalExpense = "0";
  let incomeTxnCount = 0;
  let expenseTxnCount = 0;
  let maxExpenseAmount = 0;
  let maxExpenseEvent: FinancialEvent | null = null;

  for (const e of filteredEvents) {
    if (e.event_type === "INCOME" || e.event_type === "INTEREST") {
      let eventAmt = "0";
      for (const entry of e.entries) {
        if (!entry.amount.startsWith("-")) {
          eventAmt = sumMoney([eventAmt, entry.amount]);
        }
      }
      totalIncome = sumMoney([totalIncome, eventAmt]);
      incomeTxnCount++;
    } else if (e.event_type === "EXPENSE") {
      let eventAmt = "0";
      for (const entry of e.entries) {
        const cleanAmt = entry.amount.replace("-", "");
        eventAmt = sumMoney([eventAmt, cleanAmt]);
      }
      totalExpense = sumMoney([totalExpense, eventAmt]);
      expenseTxnCount++;
      const numAmt = Number(eventAmt);
      if (numAmt > maxExpenseAmount) {
        maxExpenseAmount = numAmt;
        maxExpenseEvent = e;
      }
    }
  }

  const netSavings = sumMoney([totalIncome, `-${totalExpense}`]);
  const incomeNum = Number(totalIncome);
  const expenseNum = Number(totalExpense);
  const netNum = Number(netSavings);
  const savingsRate = incomeNum > 0 ? ((netNum / incomeNum) * 100).toFixed(1) : "0.0";

  let dayCount = 30;
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    dayCount = diff;
  }
  const dailyAverageExpense = dayCount > 0 ? Math.round(expenseNum / dayCount) : 0;

  // 1. Time Breakdown
  const timeBuckets = useMemo(() => {
    const map = new Map<string, { income: string; expense: string; count: number }>();
    filteredEvents.forEach(e => {
      const monthKey = e.transaction_date.slice(0, 7);
      if (!map.has(monthKey)) map.set(monthKey, { income: "0", expense: "0", count: 0 });
      const item = map.get(monthKey)!;
      item.count++;
      if (e.event_type === "INCOME" || e.event_type === "INTEREST") {
        e.entries.forEach(en => {
          if (!en.amount.startsWith("-")) item.income = sumMoney([item.income, en.amount]);
        });
      } else if (e.event_type === "EXPENSE") {
        e.entries.forEach(en => {
          item.expense = sumMoney([item.expense, en.amount.replace("-", "")]);
        });
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, data]) => {
        const inc = Number(data.income);
        const exp = Number(data.expense);
        const net = inc - exp;
        const rate = inc > 0 ? ((net / inc) * 100).toFixed(1) : "0.0";
        return { month, income: data.income, expense: data.expense, net: String(net), rate, count: data.count, incNum: inc, expNum: exp };
      });
  }, [filteredEvents]);

  const maxMonthVal = useMemo(() => {
    let max = 1;
    timeBuckets.forEach(b => {
      if (b.incNum > max) max = b.incNum;
      if (b.expNum > max) max = b.expNum;
    });
    return max;
  }, [timeBuckets]);

  // 2. Category Breakdown
  const categoryStats = useMemo(() => {
    const map = new Map<number | null, { total: string; count: number; subcategories: Map<number, { total: string; count: number }> }>();
    const targetType = categoryFlow;

    filteredEvents.forEach(e => {
      if (e.event_type !== targetType && !(targetType === "INCOME" && e.event_type === "INTEREST")) return;
      let eventAmt = "0";
      e.entries.forEach(en => {
        eventAmt = sumMoney([eventAmt, en.amount.replace("-", "")]);
      });

      const cat = e.category_id ? categoryMap.get(e.category_id) : null;
      let parentId: number | null = null;
      let isSub = false;
      if (cat) {
        if (cat.parent_id) {
          parentId = cat.parent_id;
          isSub = true;
        } else {
          parentId = cat.id;
        }
      }

      if (!map.has(parentId)) {
        map.set(parentId, { total: "0", count: 0, subcategories: new Map() });
      }
      const pEntry = map.get(parentId)!;
      pEntry.total = sumMoney([pEntry.total, eventAmt]);
      pEntry.count++;

      if (isSub && cat) {
        if (!pEntry.subcategories.has(cat.id)) {
          pEntry.subcategories.set(cat.id, { total: "0", count: 0 });
        }
        const sEntry = pEntry.subcategories.get(cat.id)!;
        sEntry.total = sumMoney([sEntry.total, eventAmt]);
        sEntry.count++;
      }
    });

    const grandTotal = targetType === "EXPENSE" ? expenseNum : incomeNum;
    return Array.from(map.entries())
      .map(([parentId, data]) => {
        const cat = parentId ? categoryMap.get(parentId) : null;
        const name = cat ? categoryLabel(language, cat.name) : (language === "vi" ? "Khác / Chưa phân loại" : "Other / Unclassified");
        const totalNum = Number(data.total);
        const share = grandTotal > 0 ? ((totalNum / grandTotal) * 100).toFixed(1) : "0.0";
        const icon = cat?.icon ?? "Folder";

        const subList = Array.from(data.subcategories.entries()).map(([subId, subData]) => {
          const subCat = categoryMap.get(subId);
          const subTotalNum = Number(subData.total);
          const subShare = grandTotal > 0 ? ((subTotalNum / grandTotal) * 100).toFixed(1) : "0.0";
          return {
            id: subId,
            name: subCat ? categoryLabel(language, subCat.name) : "",
            icon: subCat?.icon ?? "Tag",
            total: subData.total,
            count: subData.count,
            share: subShare,
          };
        }).sort((a, b) => Number(b.total) - Number(a.total));

        return {
          id: parentId,
          name,
          icon,
          total: data.total,
          totalNum,
          count: data.count,
          share,
          subList,
        };
      })
      .sort((a, b) => b.totalNum - a.totalNum);
  }, [filteredEvents, categoryFlow, categoryMap, expenseNum, incomeNum, language]);

  // 3. Account Breakdown
  const accountStats = useMemo(() => {
    const map = new Map<number, { inflow: string; outflow: string; expenseCount: number; incomeCount: number }>();
    (accounts ?? []).forEach(a => map.set(a.id, { inflow: "0", outflow: "0", expenseCount: 0, incomeCount: 0 }));

    filteredEvents.forEach(e => {
      e.entries.forEach(en => {
        if (!map.has(en.account_id)) {
          map.set(en.account_id, { inflow: "0", outflow: "0", expenseCount: 0, incomeCount: 0 });
        }
        const accData = map.get(en.account_id)!;
        if (en.amount.startsWith("-")) {
          accData.outflow = sumMoney([accData.outflow, en.amount.replace("-", "")]);
          accData.expenseCount++;
        } else {
          accData.inflow = sumMoney([accData.inflow, en.amount]);
          accData.incomeCount++;
        }
      });
    });

    return Array.from(map.entries())
      .map(([accId, data]) => {
        const acc = accountMap.get(accId);
        const inflowNum = Number(data.inflow);
        const outflowNum = Number(data.outflow);
        const netNum = inflowNum - outflowNum;
        const shareOfExpense = expenseNum > 0 ? ((outflowNum / expenseNum) * 100).toFixed(1) : "0.0";
        return {
          account: acc ?? { id: accId, name: `Tài khoản #${accId}`, account_type: "BANK" as AccountType, currency: "VND", is_active: true, sort_order: 0 },
          inflow: data.inflow,
          outflow: data.outflow,
          outflowNum,
          net: String(netNum),
          shareOfExpense,
          txnCount: data.expenseCount + data.incomeCount,
        };
      })
      .filter(item => Number(item.inflow) > 0 || Number(item.outflow) > 0)
      .sort((a, b) => b.outflowNum - a.outflowNum);
  }, [filteredEvents, accounts, accountMap, expenseNum]);

  // 4. Payee Breakdown (Using Level 1 Expense Categories)
  const payeeStats = useMemo(() => {
    const map = new Map<string, { expense: string; count: number; lastDate: string; icon?: string }>();

    filteredEvents.forEach(e => {
      // Chi tiêu theo đối tượng CHỈ tính các sự kiện chi tiêu (EXPENSE)
      if (e.event_type !== "EXPENSE") return;

      const lvl1Cat = getLevel1Category(e.category_id, categories ?? []);
      let name = (e.payee_text || "").trim();
      const icon = lvl1Cat?.icon ?? undefined;

      if (!name) {
        if (lvl1Cat) {
          name = categoryLabel(language, lvl1Cat.name);
        } else if (e.note && e.note.trim()) {
          name = e.note.trim();
        } else {
          name = language === "vi" ? "Khác / Chưa phân loại" : "Other / Uncategorized";
        }
      }

      if (!map.has(name)) {
        map.set(name, { expense: "0", count: 0, lastDate: e.transaction_date, icon });
      }
      const pEntry = map.get(name)!;
      pEntry.count++;
      if (e.transaction_date > pEntry.lastDate) {
        pEntry.lastDate = e.transaction_date;
      }
      if (!pEntry.icon && icon) {
        pEntry.icon = icon;
      }

      let eventAmt = "0";
      e.entries.forEach(en => {
        const cleanAmt = en.amount.replace("-", "");
        eventAmt = sumMoney([eventAmt, cleanAmt]);
      });
      pEntry.expense = sumMoney([pEntry.expense, eventAmt]);
    });

    return Array.from(map.entries())
      .filter(([, data]) => Number(data.expense) > 0)
      .map(([name, data]) => {
        const expNum = Number(data.expense);
        const share = expenseNum > 0 ? ((expNum / expenseNum) * 100).toFixed(1) : "0.0";
        const avg = data.count > 0 ? Math.round(expNum / data.count) : 0;
        return {
          name,
          icon: data.icon,
          expense: data.expense,
          expNum,
          count: data.count,
          lastDate: data.lastDate,
          share,
          avg: String(avg),
        };
      })
      .sort((a, b) => b.expNum - a.expNum);
  }, [filteredEvents, categories, expenseNum, language]);

  return (
    <div className="reports-page">
      {/* Time Filters: Tất cả | Năm | Quý | Tháng | Tuần | Ngày | Tùy chỉnh */}
      <div className="ledger-time-filter-wrap" style={{ marginBottom: "16px" }}>
        <div className="ledger-time-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={timeScope === "ALL"} className={timeScope === "ALL" ? "active" : ""} onClick={() => setTimeScope("ALL")}>{tr("All")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "YEAR"} className={timeScope === "YEAR" ? "active" : ""} onClick={() => setTimeScope("YEAR")}>{tr("Year")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "QUARTER"} className={timeScope === "QUARTER" ? "active" : ""} onClick={() => setTimeScope("QUARTER")}>{tr("Quarter")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "MONTH"} className={timeScope === "MONTH" ? "active" : ""} onClick={() => setTimeScope("MONTH")}>{tr("Month")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "WEEK"} className={timeScope === "WEEK" ? "active" : ""} onClick={() => setTimeScope("WEEK")}>{tr("Week")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "DAY"} className={timeScope === "DAY" ? "active" : ""} onClick={() => setTimeScope("DAY")}>{tr("Day")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "CUSTOM"} className={timeScope === "CUSTOM" ? "active" : ""} onClick={() => setTimeScope("CUSTOM")}>{tr("Custom range")}</button>
        </div>

        {timeScope === "MONTH" && (
          <div className="ledger-scroll-row-wrap" style={{ marginTop: "4px", justifyContent: "center" }}>
            <button
              type="button"
              className="scroll-arrow-btn"
              onClick={() => setMonthWindowStartIndex(prev => Math.max(0, prev - 1))}
              disabled={monthWindowStartIndex === 0}
              style={{ opacity: monthWindowStartIndex === 0 ? 0.35 : 1, cursor: monthWindowStartIndex === 0 ? "default" : "pointer" }}
              title={tr("Previous month")}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="ledger-months" role="tablist" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {visibleMonths.map(key => {
                const isSelected = activeMonthKey === key;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={isSelected ? "active" : ""}
                    style={{ minWidth: "90px", textAlign: "center" }}
                    onClick={() => setSelectedMonthKey(key)}
                    key={key}
                    ref={isSelected ? activeMonthBtnRef : undefined}
                  >
                    {monthLabel(key)}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="scroll-arrow-btn"
              onClick={() => setMonthWindowStartIndex(prev => Math.min(Math.max(0, allMonths.length - 3), prev + 1))}
              disabled={monthWindowStartIndex >= allMonths.length - 3}
              style={{ opacity: monthWindowStartIndex >= allMonths.length - 3 ? 0.35 : 1, cursor: monthWindowStartIndex >= allMonths.length - 3 ? "default" : "pointer" }}
              title={tr("Next month")}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        )}

        {timeScope === "YEAR" && (
          <div className="time-sub-controls" style={{ marginTop: "4px" }}>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="time-select">
              {distinctYears.map(y => <option value={y} key={y}>{tr("Year")} {y}</option>)}
            </select>
          </div>
        )}

        {timeScope === "QUARTER" && (
          <div className="time-sub-controls" style={{ marginTop: "4px" }}>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="time-select">
              {distinctYears.map(y => <option value={y} key={y}>{tr("Year")} {y}</option>)}
            </select>
            <div style={{ display: "flex", gap: "6px" }}>
              {[1, 2, 3, 4].map(q => (
                <button
                  type="button"
                  key={q}
                  className={`pill-btn ${selectedQuarter === q ? "active" : ""}`}
                  onClick={() => setSelectedQuarter(q)}
                >
                  {tr("Quarter")} {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {timeScope === "WEEK" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px", width: "100%", minWidth: 0 }}>
            <div>
              <input
                type="month"
                value={`${selectedWeekYear}-${String(selectedWeekMonth).padStart(2, "0")}`}
                onChange={e => {
                  if (!e.target.value) return;
                  const [y, m] = e.target.value.split("-").map(Number);
                  setSelectedWeekYear(y);
                  setSelectedWeekMonth(m);
                }}
                onClick={e => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
                className="time-input"
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  color: "var(--text)",
                  width: "auto",
                  minWidth: "160px"
                }}
              />
            </div>
            <div className="ledger-scroll-row-wrap">
              <button
                type="button"
                className="scroll-arrow-btn"
                onClick={() => weekScrollRef.current?.scrollBy({ left: -240, behavior: "smooth" })}
                title={tr("Previous")}
                aria-label="Previous weeks"
              >
                ‹
              </button>
              <div className="ledger-months scroll-container" role="tablist" ref={weekScrollRef}>
                {currentMonthWeeks.map(w => {
                  const isSelected = startDate === w.start && endDate === w.end;
                  return (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={isSelected ? "active" : ""}
                      onClick={() => {
                        setSelectedWeekStart(w.start);
                        setSelectedWeekEnd(w.end);
                      }}
                      key={w.start}
                      ref={isSelected ? activeWeekBtnRef : undefined}
                    >
                      {w.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="tab"
                  aria-selected={startDate === lastWeekStart && endDate === lastWeekEnd}
                  className={startDate === lastWeekStart && endDate === lastWeekEnd ? "active" : ""}
                  onClick={() => {
                    setSelectedWeekStart(lastWeekStart);
                    setSelectedWeekEnd(lastWeekEnd);
                  }}
                  ref={startDate === lastWeekStart && endDate === lastWeekEnd ? activeWeekBtnRef : undefined}
                >
                  {tr("Last week")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={startDate === thisWeekStart && endDate === thisWeekEnd}
                  className={startDate === thisWeekStart && endDate === thisWeekEnd ? "active" : ""}
                  onClick={() => {
                    setSelectedWeekStart(thisWeekStart);
                    setSelectedWeekEnd(thisWeekEnd);
                  }}
                  ref={startDate === thisWeekStart && endDate === thisWeekEnd ? activeWeekBtnRef : undefined}
                >
                  {tr("This week")}
                </button>
              </div>
              <button
                type="button"
                className="scroll-arrow-btn"
                onClick={() => weekScrollRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
                title={tr("Next")}
                aria-label="Next weeks"
              >
                ›
              </button>
            </div>
          </div>
        )}

        {timeScope === "DAY" && (
          <div className="time-sub-controls" style={{ marginTop: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "nowrap" }}>
            <button
              type="button"
              className="scroll-arrow-btn"
              onClick={() => setDayWindowOffset(prev => prev - 1)}
              title={tr("Previous")}
              aria-label="Previous days"
            >
              ‹
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
              {visibleDays.map(d => (
                <button
                  key={d}
                  type="button"
                  className={`pill-btn ${selectedDate === d ? "active" : ""}`}
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                  onClick={() => setSelectedDate(d)}
                >
                  {formatShortDayLabel(language, d)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="scroll-arrow-btn"
              onClick={() => setDayWindowOffset(prev => prev + 1)}
              title={tr("Next")}
              aria-label="Next days"
            >
              ›
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => onCalendarDateChange(e.target.value)}
              onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
              className="time-input"
              style={{ cursor: "pointer", marginLeft: "4px", padding: "3px 6px", height: "28px", minHeight: "28px", fontSize: "0.82rem" }}
              aria-label={tr("Select date")}
            />
          </div>
        )}

        {timeScope === "CUSTOM" && (
          <div className="time-sub-controls" style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="hint" style={{ whiteSpace: "nowrap", fontWeight: 600, minWidth: "60px" }}>{tr("From date")}:</span>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
                className="time-input"
                style={{ cursor: "pointer", flex: 1, minHeight: "32px" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="hint" style={{ whiteSpace: "nowrap", fontWeight: 600, minWidth: "60px" }}>{tr("To date")}:</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
                className="time-input"
                style={{ cursor: "pointer", flex: 1, minHeight: "32px" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hero Overview KPI Cards */}
      <div className="reports-kpis">
        <article className="reports-kpi-card" style={{ borderTop: "4px solid #16a34a" }}>
          <div className="reports-kpi-header">
            <span>{tr("Total Income")}</span>
            <span style={{ color: "#16a34a" }}>↗</span>
          </div>
          <div className="reports-kpi-val" style={{ color: "#16a34a" }}>
            +{fmtMoneyDisplay(totalIncome)} VND
          </div>
          <div className="reports-kpi-sub">
            {incomeTxnCount} {language === "vi" ? "giao dịch thu nhập" : "income transactions"}
          </div>
        </article>

        <article className="reports-kpi-card" style={{ borderTop: "4px solid #dc2626" }}>
          <div className="reports-kpi-header">
            <span>{tr("Total Expenses")}</span>
            <span style={{ color: "#dc2626" }}>↘</span>
          </div>
          <div className="reports-kpi-val" style={{ color: "#dc2626" }}>
            -{fmtMoneyDisplay(totalExpense)} VND
          </div>
          <div className="reports-kpi-sub">
            {expenseTxnCount} {language === "vi" ? "giao dịch chi tiêu" : "expense transactions"}
          </div>
        </article>

        <article className="reports-kpi-card" style={{ borderTop: `4px solid ${netNum >= 0 ? "#0284c7" : "#dc2626"}` }}>
          <div className="reports-kpi-header">
            <span>{tr("Net Savings")}</span>
            <span className={`badge ${netNum >= 0 ? "" : "warning"}`}>{savingsRate}%</span>
          </div>
          <div className="reports-kpi-val" style={{ color: netNum >= 0 ? "#0284c7" : "#dc2626" }}>
            {netNum >= 0 ? "+" : ""}{fmtMoneyDisplay(netSavings)} VND
          </div>
          <div className="reports-kpi-sub">
            {tr("Savings Rate")}: <strong>{savingsRate}%</strong>
          </div>
        </article>

        <article className="reports-kpi-card" style={{ borderTop: "4px solid #d97706" }}>
          <div className="reports-kpi-header">
            <span>{tr("Daily Average")}</span>
            <span style={{ color: "#d97706" }}>⚡</span>
          </div>
          <div className="reports-kpi-val" style={{ color: "#0f172a" }}>
            {fmtMoneyDisplay(String(dailyAverageExpense))} VND
          </div>
          <div className="reports-kpi-sub">
            {maxExpenseEvent ? (
              <span title={maxExpenseEvent.note || ""}>
                {language === "vi" ? "Lớn nhất" : "Top"}: {fmtMoneyDisplay(String(maxExpenseAmount))} VND
              </span>
            ) : "—"}
          </div>
        </article>
      </div>

      {/* 4 Dimension Report Tabs */}
      <div className="reports-dimension-nav">
        <button
          type="button"
          className={`reports-dim-btn ${activeReportTab === "time" ? "active" : ""}`}
          onClick={() => setActiveReportTab("time")}
        >
          <IconGlyph iconKey="Calendar" size={18} />
          <span>{tr("By Time")}</span>
        </button>
        <button
          type="button"
          className={`reports-dim-btn ${activeReportTab === "category" ? "active" : ""}`}
          onClick={() => setActiveReportTab("category")}
        >
          <IconGlyph iconKey="Grid" size={18} />
          <span>{tr("By Category")}</span>
        </button>
        <button
          type="button"
          className={`reports-dim-btn ${activeReportTab === "account" ? "active" : ""}`}
          onClick={() => setActiveReportTab("account")}
        >
          <IconGlyph iconKey="CreditCard" size={18} />
          <span>{tr("By Account")}</span>
        </button>
        <button
          type="button"
          className={`reports-dim-btn ${activeReportTab === "payee" ? "active" : ""}`}
          onClick={() => setActiveReportTab("payee")}
        >
          <IconGlyph iconKey="Users" size={18} />
          <span>{tr("By Payee")}</span>
        </button>
      </div>

      {/* Tab 1: By Time Dashboard */}
      {activeReportTab === "time" && (
        <div className="reports-panel">
          <div className="reports-panel-header">
            <h3 className="reports-panel-title">{tr("Income vs Expenses")} ({tr("By Time")})</h3>
            <div style={{ display: "flex", gap: "12px", fontSize: "0.78rem" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#16a34a" }} />
                {tr("Income")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#dc2626" }} />
                {tr("Expenses")}
              </span>
            </div>
          </div>

          <Empty show={timeBuckets.length === 0} text={tr("No transactions in this period")} />

          {timeBuckets.length > 0 && (
            <div className="report-split-grid">
              <div className="monthly-chart-wrap" style={{ margin: 0 }}>
                {timeBuckets.map(b => {
                  const incPct = Math.min(100, Math.round((b.incNum / maxMonthVal) * 100));
                  const expPct = Math.min(100, Math.round((b.expNum / maxMonthVal) * 100));
                  return (
                    <div className="monthly-chart-row" key={b.month}>
                      <div className="monthly-chart-label">{b.month}</div>
                      <div className="monthly-chart-bars">
                        <div className="monthly-bar-track" title={`Thu nhập: +${fmtMoneyDisplay(b.income)} VND`}>
                          <div className="monthly-bar-fill-income" style={{ width: `${incPct}%` }} />
                        </div>
                        <div className="monthly-bar-track" title={`Chi tiêu: -${fmtMoneyDisplay(b.expense)} VND`}>
                          <div className="monthly-bar-fill-expense" style={{ width: `${expPct}%` }} />
                        </div>
                      </div>
                      <div className="monthly-chart-amounts">
                        <strong style={{ color: "#16a34a" }}>+{fmtMoneyDisplay(b.income)}</strong>
                        <strong style={{ color: "#dc2626" }}>-{fmtMoneyDisplay(b.expense)}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ReportDonutChart
                title={language === "vi" ? "Tỷ lệ Thu nhập / Chi tiêu" : "Income vs Expense Share"}
                data={[
                  { label: tr("Income"), value: incomeNum, color: "#16a34a", formattedValue: `+${fmtMoneyDisplay(totalIncome)}` },
                  { label: tr("Expenses"), value: expenseNum, color: "#dc2626", formattedValue: `-${fmtMoneyDisplay(totalExpense)}` },
                ]}
                totalLabel={tr("Net Savings")}
                totalValueFormatted={`${netNum >= 0 ? "+" : ""}${fmtMoneyDisplay(netSavings)}`}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab 2: By Category Dashboard */}
      {activeReportTab === "category" && (
        <div className="reports-panel">
          <div className="reports-panel-header">
            <h3 className="reports-panel-title">{categoryFlow === "EXPENSE" ? tr("Expense Breakdown") : tr("Income Breakdown")}</h3>
            <div className="segmented" style={{ margin: 0 }}>
              <button
                type="button"
                className={categoryFlow === "EXPENSE" ? "active" : ""}
                onClick={() => setCategoryFlow("EXPENSE")}
              >
                {tr("Expenses")}
              </button>
              <button
                type="button"
                className={categoryFlow === "INCOME" ? "active" : ""}
                onClick={() => setCategoryFlow("INCOME")}
              >
                {tr("Income")}
              </button>
            </div>
          </div>

          <Empty show={categoryStats.length === 0} text={tr("No transactions in this period")} />

          {categoryStats.length > 0 && (
            <div className="report-split-grid">
              <div className="category-report-list">
                {categoryStats.map((cat, idx) => {
                  const isExpanded = cat.id != null && !!expandedParents[cat.id];
                  const hasSubs = cat.subList.length > 0;
                  const barColor = PIE_COLORS[idx % PIE_COLORS.length];
                  return (
                    <div className="category-report-item" key={cat.id ?? "none"}>
                      <div
                        className="category-report-header"
                        onClick={() => {
                          if (hasSubs && cat.id != null) {
                            setExpandedParents(prev => ({ ...prev, [cat.id!]: !prev[cat.id!] }));
                          }
                        }}
                      >
                        <div className="category-report-left">
                          <div style={{ color: barColor, display: "flex", alignItems: "center" }}>
                            <IconGlyph iconKey={cat.icon} size={22} />
                          </div>
                          <div className="category-report-info">
                            <div className="category-report-title-row">
                              <span className="category-report-title">{cat.name}</span>
                              <div>
                                <strong style={{ fontSize: "0.95rem", color: categoryFlow === "EXPENSE" ? "#dc2626" : "#16a34a" }}>
                                  {categoryFlow === "EXPENSE" ? "-" : "+"}{fmtMoneyDisplay(cat.total)} VND
                                </strong>
                                <span style={{ fontSize: "0.78rem", color: "var(--muted)", marginLeft: "8px" }}>
                                  ({cat.share}%)
                                </span>
                              </div>
                            </div>
                            <div className="category-report-bar-wrap">
                              <div className="category-report-bar" style={{ width: `${cat.share}%`, background: barColor }} />
                            </div>
                          </div>
                        </div>
                        {hasSubs && (
                          <span style={{ color: "var(--muted)", fontSize: "0.8rem", marginLeft: "12px" }}>
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        )}
                      </div>

                      {isExpanded && hasSubs && (
                        <div className="category-sub-list">
                          {cat.subList.map(sub => (
                            <div className="category-sub-item" key={sub.id}>
                              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <IconGlyph iconKey={sub.icon} size={14} />
                                <span>{sub.name}</span>
                                <small style={{ color: "var(--muted)" }}>({sub.count} {language === "vi" ? "lần" : "txns"})</small>
                              </span>
                              <strong>
                                {categoryFlow === "EXPENSE" ? "-" : "+"}{fmtMoneyDisplay(sub.total)} VND ({sub.share}%)
                              </strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <ReportDonutChart
                title={categoryFlow === "EXPENSE" ? (language === "vi" ? "Cơ cấu chi tiêu theo nhóm" : "Expense Breakdown") : (language === "vi" ? "Cơ cấu thu nhập theo nhóm" : "Income Breakdown")}
                data={categoryStats.map((cat, i) => ({
                  label: cat.name,
                  value: cat.totalNum,
                  color: PIE_COLORS[i % PIE_COLORS.length],
                  formattedValue: `${categoryFlow === "EXPENSE" ? "-" : "+"}${fmtMoneyDisplay(cat.total)}`,
                }))}
                totalLabel={categoryFlow === "EXPENSE" ? tr("Total Expenses") : tr("Total Income")}
                totalValueFormatted={`${categoryFlow === "EXPENSE" ? "-" : "+"}${fmtMoneyDisplay(categoryFlow === "EXPENSE" ? totalExpense : totalIncome)}`}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab 3: By Account Dashboard */}
      {activeReportTab === "account" && (
        <div className="reports-panel">
          <div className="reports-panel-header">
            <h3 className="reports-panel-title">{tr("Account Cash Flow")}</h3>
          </div>

          <Empty show={accountStats.length === 0} text={tr("No transactions in this period")} />

          {accountStats.length > 0 && (
            <div className="report-split-grid">
              <div className="account-flow-2col">
                {accountStats.map(item => {
                  const brand = getAccountBrand(item.account.name, item.account.account_type);
                  const netNum = Number(item.net);
                  return (
                    <article className="account-flow-card" key={item.account.id} style={{ borderTop: `4px solid ${brand.primaryColor}` }}>
                      <div className="account-flow-header">
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <AccountLogo name={item.account.name} accountType={item.account.account_type} size={32} />
                          <div>
                            <strong style={{ fontSize: "0.92rem", display: "block" }}>{item.account.name}</strong>
                            <small style={{ color: brand.primaryColor, fontWeight: 600, fontSize: "0.74rem" }}>
                              {label(item.account.account_type)} · {item.shareOfExpense}% {language === "vi" ? "tổng chi" : "of spend"}
                            </small>
                          </div>
                        </div>
                        <span className="badge muted">{item.txnCount} {language === "vi" ? "giao dịch" : "txns"}</span>
                      </div>

                      <div className="account-flow-numbers">
                        <div className="account-flow-stat">
                          <span>{tr("Inflow")}</span>
                          <strong style={{ color: "#16a34a" }}>+{fmtMoneyDisplay(item.inflow)}</strong>
                        </div>
                        <div className="account-flow-stat">
                          <span>{tr("Outflow")}</span>
                          <strong style={{ color: "#dc2626" }}>-{fmtMoneyDisplay(item.outflow)}</strong>
                        </div>
                        <div className="account-flow-stat">
                          <span>{tr("Net")}</span>
                          <strong style={{ color: netNum >= 0 ? "#0284c7" : "#dc2626" }}>
                            {netNum >= 0 ? "+" : ""}{fmtMoneyDisplay(item.net)}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <ReportDonutChart
                title={language === "vi" ? "Tỷ trọng chi theo tài khoản" : "Spend Share by Account"}
                data={accountStats.map((item, i) => ({
                  label: item.account.name,
                  value: item.outflowNum,
                  color: PIE_COLORS[i % PIE_COLORS.length],
                  formattedValue: `-${fmtMoneyDisplay(item.outflow)}`,
                }))}
                totalLabel={tr("Total Expenses")}
                totalValueFormatted={`-${fmtMoneyDisplay(totalExpense)}`}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab 4: By Payee Dashboard */}
      {activeReportTab === "payee" && (
        <div className="reports-panel">
          <div className="reports-panel-header">
            <h3 className="reports-panel-title">{tr("Payee & Merchant Spending")}</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              {payeeStats.length} {language === "vi" ? "đối tượng / nhóm chi tiêu" : "payees / categories"}
            </span>
          </div>

          <Empty show={payeeStats.length === 0} text={tr("No transactions in this period")} />

          {payeeStats.length > 0 && (
            <div className="report-split-grid">
              <div style={{ overflowX: "auto" }}>
                <table className="payee-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{language === "vi" ? "Đối tượng chi tiêu" : "Expense Payee / Target"}</th>
                      <th>{tr("Total Expenses")}</th>
                      <th>{tr("Share")}</th>
                      <th>{tr("Transaction Count")}</th>
                      <th>{tr("Average per Transaction")}</th>
                      <th>{language === "vi" ? "Lần gần nhất" : "Last Transaction"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payeeStats.map((p, idx) => (
                      <tr key={p.name}>
                        <td style={{ color: "var(--muted)", fontWeight: 700 }}>{idx + 1}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {p.icon && <CategoryIcon name={p.name} icon={p.icon} size={18} />}
                            <strong>{p.name}</strong>
                          </div>
                        </td>
                        <td style={{ color: "#dc2626", fontWeight: 700 }}>
                          -{fmtMoneyDisplay(p.expense)} VND
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.8rem", width: "36px" }}>{p.share}%</span>
                            <div style={{ width: 60, height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, Math.max(0, Number(p.share)))}%`, height: "100%", background: PIE_COLORS[idx % PIE_COLORS.length], borderRadius: 999 }} />
                            </div>
                          </div>
                        </td>
                        <td>{p.count}</td>
                        <td>{fmtMoneyDisplay(p.avg)} VND</td>
                        <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{p.lastDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ReportDonutChart
                title={language === "vi" ? "Tỷ trọng chi theo đối tượng" : "Spending by Payee"}
                data={payeeStats.map((p, i) => ({
                  label: p.name,
                  value: p.expNum,
                  color: PIE_COLORS[i % PIE_COLORS.length],
                  formattedValue: `-${fmtMoneyDisplay(p.expense)}`,
                }))}
                totalLabel={tr("Total Expenses")}
                totalValueFormatted={`-${fmtMoneyDisplay(totalExpense)}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
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

function AccountTypeFilterDropdown({
  selected,
  onSelect,
  accounts,
}: {
  selected: "ALL" | AccountType;
  onSelect: (type: "ALL" | AccountType) => void;
  accounts: Account[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { language } = useI18n();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const counts: Record<string, number> = {
    ALL: accounts.length,
    CASH: accounts.filter(a => a.account_type === "CASH").length,
    BANK: accounts.filter(a => a.account_type === "BANK").length,
    CREDIT_CARD: accounts.filter(a => a.account_type === "CREDIT_CARD").length,
    EWALLET: accounts.filter(a => a.account_type === "EWALLET").length,
  };

  const options: { id: "ALL" | AccountType; label: string; icon: string; count: number }[] = [
    { id: "ALL", label: language === "vi" ? "Tất cả các tài khoản" : "All accounts", icon: "Grid", count: counts.ALL },
    { id: "CASH", label: language === "vi" ? "Tài khoản tiền mặt" : "Cash accounts", icon: "Wallet", count: counts.CASH },
    { id: "BANK", label: language === "vi" ? "Tài khoản ngân hàng" : "Bank accounts", icon: "Landmark", count: counts.BANK },
    { id: "CREDIT_CARD", label: language === "vi" ? "Thẻ tín dụng" : "Credit cards", icon: "CreditCard", count: counts.CREDIT_CARD },
    { id: "EWALLET", label: language === "vi" ? "Ví điện tử" : "E-wallets", icon: "Smartphone", count: counts.EWALLET },
  ];

  const currentOption = options.find(o => o.id === selected) ?? options[0];

  return (
    <div className="account-type-dropdown" ref={ref}>
      <button
        type="button"
        className="account-type-dropdown-trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="account-type-dropdown-icon">
          <IconGlyph iconKey={currentOption.icon} size={16} />
        </span>
        <span className="account-type-dropdown-label">{currentOption.label}</span>
        <span className="account-type-dropdown-count">{currentOption.count}</span>
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="account-type-dropdown-menu">
          {options.map(opt => (
            <button
              type="button"
              key={opt.id}
              className={`account-type-dropdown-item ${selected === opt.id ? "active" : ""}`}
              onClick={() => {
                onSelect(opt.id);
                setOpen(false);
              }}
            >
              <span className="account-type-dropdown-item-icon">
                <IconGlyph iconKey={opt.icon} size={16} />
              </span>
              <span className="account-type-dropdown-item-title">{opt.label}</span>
              <span className="account-type-dropdown-item-badge">{opt.count}</span>
              {selected === opt.id && <span className="account-type-dropdown-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Accounts() {
  const { label, tr, language } = useI18n();
  const qc = useQueryClient();
  const [formTarget, setFormTarget] = useState<"new" | Account | null>(null);
  const [adjusting, setAdjusting] = useState<Account | null>(null);
  const [selectedAccountForTxns, setSelectedAccountForTxns] = useState<Account | null>(null);
  const [statementAccount, setStatementAccount] = useState<Account | null>(null);
  const [filterType, setFilterType] = useState<"ALL" | AccountType>("ALL");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const query = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const balances = useAccountBalances(query.data);
  const toggle = useMutation({ mutationFn: (account: Account) => api.accounts.update(account.id, { is_active: !account.is_active }), onSuccess: () => invalidateAllFinancialQueries(qc) });

  const reorder = useMutation({
    mutationFn: async (reorderedList: Account[]) => {
      const updates: Promise<unknown>[] = [];
      reorderedList.forEach((acc, index) => {
        const newOrder = index + 1;
        if (acc.sort_order !== newOrder) {
          updates.push(api.accounts.update(acc.id, { sort_order: newOrder }));
        }
      });
      await Promise.all(updates);
    },
    onMutate: async (newOrderList) => {
      await qc.cancelQueries({ queryKey: ["accounts"] });
      const previous = qc.getQueryData<Account[]>(["accounts"]);
      qc.setQueryData(["accounts"], newOrderList);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["accounts"], context.previous);
      }
    },
    onSettled: () => {
      invalidateAllFinancialQueries(qc);
    },
  });

  const move = useMutation({
    mutationFn: ({ a, b }: { a: Account; b: Account }) => Promise.all([api.accounts.update(a.id, { sort_order: b.sort_order }), api.accounts.update(b.id, { sort_order: a.sort_order })]),
    onSuccess: () => invalidateAllFinancialQueries(qc),
  });

  function moveBy(index: number, delta: number) {
    const list = query.data ?? [];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    move.mutate({ a: list[index], b: list[target] });
  }

  function handleDrop(targetAccount: Account) {
    if (!draggingId || draggingId === targetAccount.id) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const allAccounts = query.data ?? [];
    const sourceIndex = allAccounts.findIndex(a => a.id === draggingId);
    const destIndex = allAccounts.findIndex(a => a.id === targetAccount.id);
    if (sourceIndex === -1 || destIndex === -1) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const reordered = [...allAccounts];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, moved);

    setDraggingId(null);
    setDragOverId(null);
    reorder.mutate(reordered);
  }

  function refresh() { invalidateAllFinancialQueries(qc); }

  const allAccounts = query.data ?? [];
  const filteredAccounts = filterType === "ALL"
    ? allAccounts
    : allAccounts.filter(x => x.account_type === filterType);

  return <section className="accounts-section">
    <div className="accounts-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
      <div className="accounts-toolbar-left" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" className="primary" onClick={() => setFormTarget("new")}>+ {tr("Add account")}</button>
        <AccountTypeFilterDropdown
          selected={filterType}
          onSelect={setFilterType}
          accounts={allAccounts}
        />
      </div>
      {allAccounts.length > 1 && (
        <div className="accounts-toolbar-hint" style={{ fontSize: "0.8rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>⠿ {language === "vi" ? "Kéo thả thẻ để sắp xếp thứ tự" : "Drag cards to reorder"}</span>
        </div>
      )}
    </div>
    <Error error={query.error ?? toggle.error ?? balances.error ?? move.error} />
    <Loading show={query.isPending} />
    <Empty show={!query.isPending && allAccounts.length === 0} text="No accounts yet." />
    <Empty show={!query.isPending && allAccounts.length > 0 && filteredAccounts.length === 0} text="No accounts match this filter." />
    <div className="cards">{filteredAccounts.map((x, i) => {
      const bal = balances.balances.get(x.id);
      const isCreditCard = x.account_type === "CREDIT_CARD";
      const brand = getAccountBrand(x.name, x.account_type);
      return <article
        className={`account-card-clickable ${isCreditCard ? "account-card-credit" : "account-card-bank"} ${!x.is_active ? "inactive" : ""} ${draggingId === x.id ? "is-dragging" : ""} ${dragOverId === x.id ? "is-drag-over" : ""}`}
        key={x.id}
        draggable={true}
        onDragStart={e => {
          e.dataTransfer.setData("text/plain", String(x.id));
          e.dataTransfer.effectAllowed = "move";
          setDraggingId(x.id);
        }}
        onDragOver={e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverId !== x.id) {
            setDragOverId(x.id);
          }
        }}
        onDragLeave={() => {
          if (dragOverId === x.id) {
            setDragOverId(null);
          }
        }}
        onDrop={e => {
          e.preventDefault();
          handleDrop(x);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDragOverId(null);
        }}
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
        title="Bấm để xem toàn bộ giao dịch hoặc kéo thả để đổi thứ tự"
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
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Status active={x.is_active} />
            <span className="account-card-drag-handle" title="Kéo thả để sắp xếp thứ tự" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="5" r="1.5" fill="currentColor" />
                <circle cx="8" cy="12" r="1.5" fill="currentColor" />
                <circle cx="8" cy="19" r="1.5" fill="currentColor" />
                <circle cx="16" cy="5" r="1.5" fill="currentColor" />
                <circle cx="16" cy="12" r="1.5" fill="currentColor" />
                <circle cx="16" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </span>
          </div>
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
          <button type="button" className="text-button" aria-label={tr("Move down")} disabled={move.isPending || i === (allAccounts.length) - 1} onClick={() => moveBy(i, 1)}>↓</button>
          <button type="button" className="text-button" onClick={() => setStatementAccount(x)} title="Xem & In sao kê tài khoản">{language === "vi" ? "Sao kê" : "Statement"}</button>
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
    {statementAccount && <BankStatementModal initialAccountId={statementAccount.id} onClose={() => setStatementAccount(null)} />}
  </section>;
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

function lastUsedAccountId(events: FinancialEvent[] | undefined): string {
  if (!events || events.length === 0) return "";
  const last = [...events].sort((a, b) => a.transaction_date < b.transaction_date ? 1 : a.transaction_date > b.transaction_date ? -1 : b.id - a.id)[0];
  const entry = last.entries[0];
  return entry ? String(entry.account_id) : "";
}

function parseFeedDateParts(ymd: string, language: Language) {
  if (!ymd || !ymd.includes("-")) return { dayNum: ymd, relativeDay: "", monthYearLabel: "" };
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return { dayNum: String(d), relativeDay: "", monthYearLabel: "" };

  const today = todayIso();
  const dToday = new Date();
  const dYesterday = new Date(dToday);
  dYesterday.setDate(dYesterday.getDate() - 1);
  const yesterdayStr = `${dYesterday.getFullYear()}-${pad2(dYesterday.getMonth() + 1)}-${pad2(dYesterday.getDate())}`;

  const dTomorrow = new Date(dToday);
  dTomorrow.setDate(dTomorrow.getDate() + 1);
  const tomorrowStr = `${dTomorrow.getFullYear()}-${pad2(dTomorrow.getMonth() + 1)}-${pad2(dTomorrow.getDate())}`;

  let relativeDay = "";
  if (ymd === today) {
    relativeDay = language === "vi" ? "Hôm nay" : "Today";
  } else if (ymd === yesterdayStr) {
    relativeDay = language === "vi" ? "Hôm qua" : "Yesterday";
  } else if (ymd === tomorrowStr) {
    relativeDay = language === "vi" ? "Ngày mai" : "Tomorrow";
  } else {
    if (language === "vi") {
      const daysVi = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
      relativeDay = daysVi[date.getDay()];
    } else {
      const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      relativeDay = daysEn[date.getDay()];
    }
  }

  let monthYearLabel = "";
  if (language === "vi") {
    monthYearLabel = `tháng ${m} ${y}`;
  } else {
    const monthsEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYearLabel = `${monthsEn[m - 1]} ${y}`;
  }

  return { dayNum: String(d), relativeDay, monthYearLabel };
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
  const [excludedFromReports, setExcludedFromReports] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FinancialEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<FinancialEvent | null>(null);
  const events = useQuery({ queryKey: ["events"], queryFn: api.events.list });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts.list });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories.list });
  const { balances } = useAccountBalances(accounts.data);

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
      invalidateAllFinancialQueries(qc);
    },
  });

  const categoriesMap = new Map(categories.data?.map(c => [c.id, c]));
  const accountsMap = new Map(accounts.data?.map(a => [a.id, a]));
  const validCategories = categoriesForEventType(type, categories.data ?? []).filter(x => x.is_active);
  const activeAccounts = accounts.data?.filter(x => x.is_active) ?? [];
  const creditCardAccounts = activeAccounts.filter(x => x.account_type === "CREDIT_CARD");
  const fundingAccounts = activeAccounts.filter(x => x.account_type !== "CREDIT_CARD");

  function updateEntry(index: number, field: keyof EntryDraft, value: string) { setEntries(current => current.map((entry, i) => i === index ? { ...entry, [field]: value } : entry)); }
  function changeType(next: EventType) { setType(next); setFormError(""); if (!categoryIsValidForEventType(next, categoryId, categories.data ?? [])) setCategoryId(""); }

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
      if (!entries[0]?.accountId) { setFormError(tr("Choose an account")); return; }
      if (!entries[0]?.amount?.trim()) { setFormError(tr("Enter an amount")); return; }
      if (validCategories.length > 0 && !categoryId) { setFormError(tr("Choose a category")); return; }
    }
    const payeeText = f.get("payee")?.toString().trim() || undefined;
    const tripText = f.get("trip")?.toString().trim() || undefined;
    const noteText = f.get("note")?.toString().trim() || undefined;
    if (type === "TRANSFER") {
      const amt = transferAmount.trim();
      mutation.mutate({
        event_type: "TRANSFER",
        transaction_date: date,
        payee_text: payeeText,
        trip_event_text: tripText,
        note: noteText,
        excluded_from_reports: excludedFromReports,
        entries: [{ account_id: Number(transferFrom), amount: `-${amt}` }, { account_id: Number(transferTo), amount: amt }],
      });
      return;
    }
    if (type === "CREDIT_CARD_PAYMENT") {
      const amt = paymentAmount.trim();
      mutation.mutate({
        event_type: "CREDIT_CARD_PAYMENT",
        transaction_date: date,
        payee_text: payeeText,
        trip_event_text: tripText,
        note: noteText,
        excluded_from_reports: excludedFromReports,
        entries: [{ account_id: Number(fundingAccountId), amount: `-${amt}` }, { account_id: Number(cardAccountId), amount: amt }],
      });
      return;
    }
    const signedEntries = entries.map(e => ({ account_id: Number(e.accountId), amount: type === "EXPENSE" ? `-${e.amount.trim()}` : e.amount.trim() }));
    mutation.mutate({
      event_type: type,
      transaction_date: date,
      category_id: categoryId ? Number(categoryId) : undefined,
      payee_text: payeeText,
      trip_event_text: tripText,
      note: noteText,
      excluded_from_reports: excludedFromReports,
      entries: signedEntries,
    });
  }

  const amountCurrency = activeAccounts.find(x => String(x.id) === (type === "TRANSFER" ? transferFrom : type === "CREDIT_CARD_PAYMENT" ? fundingAccountId : entries[0]?.accountId))?.currency ?? "VND";
  const noteRow = <Field label="Note"><input name="note" defaultValue={editingEvent?.note ?? ""} placeholder={tr("Optional note")} /></Field>;
  const dateRow = <Field label="Date"><input type="date" aria-label={tr("Date")} value={date} onChange={e => setDate(e.target.value || todayIso())} onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }} style={{ cursor: "pointer" }} required /></Field>;

  const todayStr = todayIso();
  const allEvents = events.data ?? [];
  const futureEvents = allEvents.filter(x => x.transaction_date > todayStr).sort((a, b) => a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : a.id - b.id);
  const recentEvents = futureEvents.length > 0
    ? futureEvents.slice(0, 30)
    : [...allEvents].sort((a, b) => a.transaction_date < b.transaction_date ? 1 : a.transaction_date > b.transaction_date ? -1 : b.id - a.id).slice(0, 40);

  const groupedRecent = useMemo(() => {
    const map = new Map<string, FinancialEvent[]>();
    for (const ev of recentEvents) {
      const list = map.get(ev.transaction_date) ?? [];
      list.push(ev);
      map.set(ev.transaction_date, list);
    }
    return map;
  }, [recentEvents]);

  return <section className="transactions-page">
    <div className="transactions-layout">
      <div className="transactions-composer-col">
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
            <Field label="Payee">
              <input name="payee" list="expense-payee-options-main" defaultValue={editingEvent?.payee_text ?? ""} placeholder={language === "vi" ? "Chọn hoặc nhập đối tượng..." : "Select or type payee..."} />
              <datalist id="expense-payee-options-main">
                {getLevel1ExpenseCategories(categories.data ?? []).map(c => (
                  <option key={c.id} value={categoryLabel(language, c.name)} />
                ))}
              </datalist>
            </Field>
            <Field label="Trip / event"><input name="trip" defaultValue={editingEvent?.trip_event_text ?? ""} /></Field>
            <label className="checkbox-row">
              <input type="checkbox" checked={excludedFromReports} onChange={e => setExcludedFromReports(e.target.checked)} />
              <span>{tr("Exclude from reports")}</span>
            </label>
            <p className="hint">{tr("This transaction won't be counted in income/expense summary reports.")}</p>
          </div>}
          <div className="form-actions composer-actions">
            <Submit
              pending={mutation.isPending}
              text={editingEvent ? "Save changes" : "Record transaction"}
              className="composer-submit-btn"
            />
            {editingEvent && (
              <button
                type="button"
                className="secondary composer-cancel-btn"
                onClick={cancelEdit}
              >
                {tr("Cancel")}
              </button>
            )}
          </div>
        </form>
        <Error error={events.error ?? accounts.error ?? categories.error ?? mutation.error} />
      </div>

      <aside className="transactions-recent-col">
        <Loading show={events.isPending} />
        <Empty show={!events.isPending && recentEvents.length === 0} text="No transactions yet." />

        <div className="transactions-feed-col">
          {[...groupedRecent.entries()].map(([dateIso, dayEvents]) => {
            const { dayNum, relativeDay, monthYearLabel } = parseFeedDateParts(dateIso, language);

            let dayTotal = 0;
            for (const ev of dayEvents) {
              if (ev.event_type === "EXPENSE") {
                const amt = Math.abs(Number(ev.entries[0]?.amount ?? 0));
                dayTotal -= amt;
              } else if (ev.event_type === "INCOME") {
                const amt = Math.abs(Number(ev.entries[0]?.amount ?? 0));
                dayTotal += amt;
              } else if (ev.event_type === "TRANSFER" || ev.event_type === "CREDIT_CARD_PAYMENT") {
                const neg = ev.entries.find(e => e.amount.startsWith("-"));
                const amt = neg ? Math.abs(Number(neg.amount)) : Math.abs(Number(ev.entries[0]?.amount ?? 0));
                dayTotal -= amt;
              } else {
                const amt = Number(ev.entries[0]?.amount ?? 0);
                dayTotal += amt;
              }
            }

            const dayTotalFormatted = dayTotal < 0
              ? `-${Math.abs(dayTotal).toLocaleString("vi-VN")}`
              : dayTotal > 0
              ? `+${dayTotal.toLocaleString("vi-VN")}`
              : "0";

            return (
              <div className="transactions-date-card" key={dateIso}>
                <div className="transactions-date-header">
                  <div className="transactions-date-left">
                    <span className="transactions-date-num">{dayNum}</span>
                    <div className="transactions-date-sub">
                      <span className="transactions-date-relative">{relativeDay}</span>
                      <span className="transactions-date-month">{monthYearLabel}</span>
                    </div>
                  </div>
                  <span className="transactions-date-total">{dayTotalFormatted}</span>
                </div>

                <div className="transactions-items-list">
                  {dayEvents.map(x => {
                    const cat = x.category_id ? categoriesMap.get(x.category_id) : null;
                    const isTransfer = x.event_type === "TRANSFER" || x.event_type === "CREDIT_CARD_PAYMENT";
                    const isIncome = x.event_type === "INCOME";

                    let itemTitle = "";
                    if (isTransfer) {
                      const isOutflow = Number(x.entries[0]?.amount ?? 0) < 0 || x.entries.some(e => e.amount.startsWith("-"));
                      itemTitle = isOutflow ? (language === "vi" ? "Tiền chuyển đi" : "Transfer out") : (language === "vi" ? "Tiền chuyển đến" : "Transfer in");
                    } else if (cat) {
                      itemTitle = categoryLabel(language, cat.name);
                    } else {
                      itemTitle = label(x.event_type);
                    }

                    let accountText = "";
                    if (isTransfer) {
                      const fromEntry = x.entries.find(e => Number(e.amount) < 0) ?? x.entries[0];
                      const toEntry = x.entries.find(e => Number(e.amount) > 0 && e !== fromEntry) ?? x.entries[1];
                      const fromName = fromEntry ? (accountsMap.get(fromEntry.account_id)?.name ?? "") : "";
                      const toName = toEntry ? (accountsMap.get(toEntry.account_id)?.name ?? "") : "";
                      if (fromName && toName) {
                        accountText = `${fromName} → ${toName}`;
                      } else {
                        accountText = fromName || toName;
                      }
                    } else {
                      const primaryEntry = x.entries[0];
                      accountText = primaryEntry ? (accountsMap.get(primaryEntry.account_id)?.name ?? "") : "";
                    }

                    const noteOrDetail = x.note ?? x.payee_text ?? x.trip_event_text ?? "";
                    const cleanNote = noteOrDetail && noteOrDetail !== itemTitle && noteOrDetail !== accountText ? noteOrDetail : "";
                    const subtitle = [accountText, cleanNote].filter(Boolean).join(" • ");

                    let primaryAmount = 0;
                    if (isTransfer) {
                      const neg = x.entries.find(e => e.amount.startsWith("-"));
                      const pos = x.entries.find(e => !e.amount.startsWith("-"));
                      primaryAmount = neg ? Math.abs(Number(neg.amount)) : (pos ? Math.abs(Number(pos.amount)) : Math.abs(Number(x.entries[0]?.amount ?? 0)));
                    } else {
                      primaryAmount = Math.abs(Number(x.entries[0]?.amount ?? 0));
                    }

                    const isRed = !isIncome;

                    return (
                      <div
                        className="transaction-feed-item"
                        tabIndex={0}
                        key={x.id}
                        onClick={() => setDetailEvent(x)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailEvent(x); } }}
                      >
                        <div className="transaction-feed-left">
                          <CategoryIconBadge
                            name={cat?.name ?? (isTransfer ? "Wallet" : isIncome ? "MoneyBag" : "Receipt")}
                            icon={cat?.icon}
                            size={42}
                            iconSize={22}
                          />
                          <div className="transaction-feed-text">
                            <span className="transaction-feed-title">{itemTitle}</span>
                            {subtitle && <span className="transaction-feed-sub">{subtitle}</span>}
                          </div>
                        </div>
                        <span
                          className="transaction-feed-amount"
                          style={{ color: isRed ? "#e05252" : "#10b981" }}
                        >
                          {primaryAmount.toLocaleString("vi-VN")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
    onSuccess: () => { invalidateAllFinancialQueries(qc); onClose(); },
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
  const [type, setType] = useState<EventType>(() => {
    if (!initial) return "EXPENSE";
    if (composerEventTypes.includes(initial.event_type)) return initial.event_type;
    const firstAmount = Number(initial.entries[0]?.amount ?? 0);
    return firstAmount > 0 ? "INCOME" : "EXPENSE";
  });
  const [categoryId, setCategoryId] = useState(initial?.category_id != null ? String(initial.category_id) : "");
  const [date, setDate] = useState(() => initial ? initial.transaction_date : todayIso());
  const [entries, setEntries] = useState<EntryDraft[]>(() => {
    if (initial && !isTransferLike) {
      const entry = initial.entries[0];
      return [{ accountId: String(entry?.account_id ?? defaultAccountId), amount: fmtMoney(entry?.amount?.replace(/^-/, "") ?? "") ?? "" }];
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
      <Field label="Payee">
        <input name="payee" list="expense-payee-options-ledger" defaultValue={initial?.payee_text ?? ""} placeholder={language === "vi" ? "Chọn hoặc nhập đối tượng..." : "Select or type payee..."} />
        <datalist id="expense-payee-options-ledger">
          {getLevel1ExpenseCategories(categories).map(c => (
            <option key={c.id} value={categoryLabel(language, c.name)} />
          ))}
        </datalist>
      </Field>
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

function formatShortDayLabel(language: Language, iso: string): string {
  const today = todayIso();
  const yesterday = shiftIsoDate(today, -1);
  if (iso === today) {
    return language === "vi" ? "Hôm nay" : "Today";
  }
  if (iso === yesterday) {
    return language === "vi" ? "Hôm qua" : "Yesterday";
  }
  const parts = iso.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return iso;
}

function formatLongDate(language: Language, ymd: string): string {
  if (!ymd || !ymd.includes("-")) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return ymd;

  if (language === "vi") {
    const daysVi = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
    const dayOfWeek = daysVi[date.getDay()];
    return `${dayOfWeek}, ${d} tháng ${m} ${y}`;
  } else {
    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthsEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayOfWeek = daysEn[date.getDay()];
    const monthName = monthsEn[m - 1];
    return `${dayOfWeek}, ${monthName} ${d}, ${y}`;
  }
}

function LedgerDetailPanel({ event, accountNames, categories, language, onEdit, onDeleted }: {
  event: FinancialEvent; accountNames: Map<number, string>; categories: Category[]; language: Language; onEdit: () => void; onDeleted: () => void;
}) {
  const { label, tr } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = useMutation({ mutationFn: () => api.events.remove(event.id), onSuccess: onDeleted });
  const category = categories.find(c => c.id === event.category_id);

  // Compute entry or total amount
  const primaryAmountStr = event.entries[0]?.amount ?? "0";
  const numAmount = Number(primaryAmountStr);
  const isExpense = numAmount < 0 || event.event_type === "EXPENSE";
  const isIncome = numAmount > 0 && event.event_type === "INCOME";
  const absAmountStr = primaryAmountStr.startsWith("-") ? primaryAmountStr.slice(1) : primaryAmountStr;
  const formattedAmount = fmtMoneyDisplay(absAmountStr) ?? absAmountStr;

  // Title / Category display
  const titleText = category
    ? categoryLabel(language, category.name)
    : (event.event_type === "TRANSFER"
        ? tr("Transfer")
        : event.event_type === "CREDIT_CARD_PAYMENT"
        ? tr("Credit card payment")
        : label(event.event_type));

  const formattedDate = formatLongDate(language, event.transaction_date);
  const isTransferType = event.event_type === "TRANSFER" || event.event_type === "CREDIT_CARD_PAYMENT";
  const split = isTransferType ? splitTransferEntries(event) : null;
  const primaryAccountName = event.entries[0] ? (accountNames.get(event.entries[0].account_id) ?? `${tr("Account")} #${event.entries[0].account_id}`) : "";

  return (
    <div className="ledger-detail-panel" style={{ padding: "20px 22px", borderRadius: "18px", background: "var(--card)", border: "1px solid var(--line)" }}>
      {/* 1. Header: Icon + Category Name + Large Amount */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <CategoryIconBadge
          name={category?.name ?? (isTransferType ? "Wallet" : isIncome ? "MoneyBag" : "Receipt")}
          icon={category?.icon}
          size={52}
          iconSize={26}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.25, wordBreak: "break-word" }}>
            {titleText}
          </span>
          <span
            style={{
              fontSize: "2.1rem",
              fontWeight: 500,
              color: isExpense ? "#ef4444" : isIncome ? "#10b981" : "var(--text)",
              lineHeight: 1.15,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em"
            }}
          >
            {formattedAmount}
          </span>
        </div>
      </div>

      {/* 2. Divider */}
      <div style={{ height: "1px", background: "var(--line)", margin: "16px 0" }} />

      {/* 3. Detail Info Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Row 1: Ngày */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "24px", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text)" }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="8" cy="14" r="0.75" fill="currentColor" />
              <circle cx="12" cy="14" r="0.75" fill="currentColor" />
              <circle cx="16" cy="14" r="0.75" fill="currentColor" />
              <circle cx="8" cy="18" r="0.75" fill="currentColor" />
              <circle cx="12" cy="18" r="0.75" fill="currentColor" />
              <circle cx="16" cy="18" r="0.75" fill="currentColor" />
            </svg>
          </div>
          <span style={{ fontSize: "0.95rem", color: "var(--text)", fontWeight: 500 }}>
            {formattedDate}
          </span>
        </div>

        {/* Row 2: Tài khoản / Ví */}
        {isTransferType && split ? (
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "24px", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
              <AccountLogo name={accountNames.get(split.negEntry.account_id) ?? ""} size={22} />
            </div>
            <span style={{ fontSize: "0.95rem", color: "var(--text)", fontWeight: 500 }}>
              {accountNames.get(split.negEntry.account_id) ?? "—"} → {accountNames.get(split.posEntry.account_id) ?? "—"}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "24px", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
              <AccountLogo name={primaryAccountName} size={22} />
            </div>
            <span style={{ fontSize: "0.95rem", color: "var(--text)", fontWeight: 500 }}>
              {primaryAccountName}
            </span>
          </div>
        )}

        {/* Row 3: Ghi chú (nếu có) */}
        {event.note && (
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "24px", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)" }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <span style={{ fontSize: "0.92rem", color: "var(--muted)", fontStyle: "italic" }}>
              {event.note}
            </span>
          </div>
        )}

        {/* Row 4: Người nhận / Người chi (nếu có) */}
        {event.payee_text && (
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "24px", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)" }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <span style={{ fontSize: "0.92rem", color: "var(--text)" }}>
              {event.payee_text}
            </span>
          </div>
        )}

        {/* Row 5: Sự kiện / Chuyến đi (nếu có) */}
        {event.trip_event_text && (
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "24px", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)" }}>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
            <span style={{ fontSize: "0.92rem", color: "var(--text)" }}>
              {event.trip_event_text}
            </span>
          </div>
        )}
      </div>

      <Error error={remove.error} />

      {/* 4. Form Actions: Chỉnh sửa / Xoá */}
      <div className="form-actions" style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <button type="button" className="text-button" onClick={onEdit}>{tr("Edit")}</button>
        {!confirmingDelete ? (
          <button type="button" className="text-button danger" onClick={() => setConfirmingDelete(true)}>{tr("Delete")}</button>
        ) : (
          <>
            <button type="button" className="text-button danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? tr("Deleting...") : tr("Confirm delete")}
            </button>
            <button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>
              {tr("Cancel")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeek1Monday(year: number): Date {
  // Jan 2 of year
  const jan2 = new Date(year, 0, 2);
  const day = jan2.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  let firstWorkDay: Date;
  if (day >= 1 && day <= 5) {
    firstWorkDay = jan2;
  } else if (day === 6) {
    // Saturday -> Jan 4 (Mon)
    firstWorkDay = new Date(year, 0, 4);
  } else {
    // Sunday -> Jan 3 (Mon)
    firstWorkDay = new Date(year, 0, 3);
  }
  const fDay = firstWorkDay.getDay();
  const diffToMonday = fDay === 0 ? -6 : 1 - fDay;
  const monday = new Date(firstWorkDay);
  monday.setDate(monday.getDate() + diffToMonday);
  return monday;
}

function getYearWeeks(year: number, language: Language) {
  const week1Mon = getWeek1Monday(year);
  const nextYearWeek1Mon = getWeek1Monday(year + 1);

  const weeks: { index: number; start: string; end: string; label: string; month: number }[] = [];
  const curr = new Date(week1Mon);
  let weekIdx = 1;

  while (curr < nextYearWeek1Mon) {
    const startIso = formatYmd(curr);
    const end = new Date(curr);
    end.setDate(end.getDate() + 6);
    const endIso = formatYmd(end);

    const [, sm, sd] = startIso.split("-");
    const [, em, ed] = endIso.split("-");

    const label = language === "vi"
      ? `Tuần ${weekIdx} (từ ${sd}/${sm} đến ${ed}/${em})`
      : `Week ${weekIdx} (${sd}/${sm} - ${ed}/${em})`;

    const midDay = new Date(curr);
    midDay.setDate(midDay.getDate() + 3);
    const midMonth = midDay.getMonth() + 1;

    weeks.push({
      index: weekIdx,
      start: startIso,
      end: endIso,
      label,
      month: midMonth,
    });

    curr.setDate(curr.getDate() + 7);
    weekIdx++;
  }
  return weeks;
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
  const [timeScope, setTimeScope] = useState<"ALL" | "YEAR" | "QUARTER" | "MONTH" | "WEEK" | "DAY" | "CUSTOM">("MONTH");
  const [selectedYear, setSelectedYear] = useState<string>(() => String(new Date().getFullYear()));
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayIso());
  const [dayWindowOffset, setDayWindowOffset] = useState<number>(0);
  const [customStartDate, setCustomStartDate] = useState<string>(() => `${new Date().getFullYear()}-01-01`);
  const [customEndDate, setCustomEndDate] = useState<string>(() => todayIso());
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedWeekYear, setSelectedWeekYear] = useState<number>(() => new Date().getFullYear());
  const [selectedWeekMonth, setSelectedWeekMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [selectedWeekEnd, setSelectedWeekEnd] = useState<string | null>(null);
  const [detailEventId, setDetailEventId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState<"new" | "edit" | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<number>>(new Set());
  const [confirmModal, setConfirmModal] = useState<"bulk" | "all" | null>(null);
  const [includeAssetEvents, setIncludeAssetEvents] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const activeMonthBtnRef = useRef<HTMLButtonElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const activeWeekBtnRef = useRef<HTMLButtonElement>(null);

  const mostRecentAccountId = useMemo(() => {
    if (!eventsQ.data || eventsQ.data.length === 0 || activeAccounts.length === 0) {
      return activeAccounts[0]?.id;
    }
    const sorted = [...eventsQ.data].sort((a, b) => {
      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      return b.id - a.id;
    });
    for (const ev of sorted) {
      for (const entry of ev.entries) {
        if (activeAccounts.some(acc => acc.id === entry.account_id)) {
          return entry.account_id;
        }
      }
    }
    return activeAccounts[0]?.id;
  }, [eventsQ.data, activeAccounts]);

  useEffect(() => {
    if (selectedAccountId == null && mostRecentAccountId != null) {
      setSelectedAccountId(mostRecentAccountId);
    }
  }, [mostRecentAccountId, selectedAccountId]);

  const isAllAccounts = selectedAccountId === "ALL";

  const accountEvents = useMemo(() => {
    if (selectedAccountId == null) return [];
    if (isAllAccounts) return eventsQ.data ?? [];
    return (eventsQ.data ?? []).filter(e => e.entries.some(en => en.account_id === selectedAccountId));
  }, [selectedAccountId, isAllAccounts, eventsQ.data]);

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
  const minTxMonth = pastEvents.length > 0
    ? pastEvents.reduce((min, e) => e.transaction_date.slice(0, 7) < min ? e.transaction_date.slice(0, 7) : min, currentMonthKey)
    : currentMonthKey;
  const defaultMinMonth = `${Number(currentMonthKey.slice(0, 4)) - 1}-01`;
  const earliestMonthKey = minTxMonth < defaultMinMonth ? minTxMonth : defaultMinMonth;

  const allMonths: string[] = useMemo(() => {
    const list: string[] = [];
    for (let key = earliestMonthKey, guard = 0; key <= currentMonthKey && guard < 1200; key = shiftMonthKey(key, 1), guard++) {
      list.push(key);
    }
    if (hasFuture) {
      list.push("FUTURE");
    }
    return list;
  }, [earliestMonthKey, currentMonthKey, hasFuture]);

  const [monthWindowStartIndex, setMonthWindowStartIndex] = useState<number>(() => {
    return Math.max(0, allMonths.indexOf(currentMonthKey) - 2);
  });

  useEffect(() => {
    const idx = allMonths.indexOf(currentMonthKey);
    if (idx >= 0) {
      setMonthWindowStartIndex(Math.max(0, idx - 2));
    }
  }, [selectedAccountId, currentMonthKey, allMonths]);

  const visibleMonths = useMemo(() => {
    return allMonths.slice(monthWindowStartIndex, monthWindowStartIndex + 3);
  }, [allMonths, monthWindowStartIndex]);

  const lastMonthKey = shiftMonthKey(currentMonthKey, -1);
  function monthLabel(key: string): string {
    if (key === "FUTURE") return tr("Future");
    if (key === currentMonthKey) return tr("This month");
    if (key === lastMonthKey) return tr("Last month");
    const [y, m] = key.split("-");
    const currentYear = todayStr.slice(0, 4);
    if (y === currentYear) {
      return language === "vi" ? `Tháng ${Number(m)}` : `Month ${Number(m)}`;
    }
    return language === "vi" ? `Tháng ${Number(m)}/${y}` : `Month ${Number(m)}/${y}`;
  }

  const thisWeekMonday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }, []);
  const thisWeekStart = useMemo(() => formatYmd(thisWeekMonday), [thisWeekMonday]);
  const thisWeekEnd = useMemo(() => {
    const end = new Date(thisWeekMonday);
    end.setDate(end.getDate() + 6);
    return formatYmd(end);
  }, [thisWeekMonday]);

  const lastWeekMonday = useMemo(() => {
    const d = new Date(thisWeekMonday);
    d.setDate(d.getDate() - 7);
    return d;
  }, [thisWeekMonday]);
  const lastWeekStart = useMemo(() => formatYmd(lastWeekMonday), [lastWeekMonday]);
  const lastWeekEnd = useMemo(() => {
    const end = new Date(lastWeekMonday);
    end.setDate(end.getDate() + 6);
    return formatYmd(end);
  }, [lastWeekMonday]);

  const currentMonthWeeks = useMemo(() => {
    const all = getYearWeeks(selectedWeekYear, language);
    return all.filter(w => {
      if (w.month !== selectedWeekMonth) return false;
      if (w.start === thisWeekStart && w.end === thisWeekEnd) return false;
      if (w.start === lastWeekStart && w.end === lastWeekEnd) return false;
      return true;
    });
  }, [selectedWeekYear, selectedWeekMonth, thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd, language]);

  const distinctYears = useMemo(() => {
    const yearsSet = new Set<string>();
    accountEvents.forEach(e => {
      if (e.transaction_date && e.transaction_date.length >= 4) {
        yearsSet.add(e.transaction_date.slice(0, 4));
      }
    });
    yearsSet.add(String(new Date().getFullYear()));
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [accountEvents]);

  // Auto-scroll to active month button
  useEffect(() => {
    if (timeScope === "MONTH") {
      const timer = setTimeout(() => {
        activeMonthBtnRef.current?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedMonthKey, timeScope]);

  // Auto-scroll to active week button
  useEffect(() => {
    if (timeScope === "WEEK") {
      const timer = setTimeout(() => {
        activeWeekBtnRef.current?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedWeekStart, selectedWeekEnd, timeScope]);

  // Defaults to (and resets to, on every account switch) the current month
  useEffect(() => {
    setSelectedMonthKey(currentMonthKey);
    setSelectedWeekStart(thisWeekStart);
    setSelectedWeekEnd(thisWeekEnd);
    setSelectedEventIds(new Set());
    setConfirmModal(null);
  }, [selectedAccountId, currentMonthKey, thisWeekStart, thisWeekEnd]);

  useEffect(() => {
    setSelectedEventIds(new Set());
    setConfirmModal(null);
  }, [selectedMonthKey, timeScope, selectedYear, selectedQuarter, selectedDate, customStartDate, customEndDate, selectedWeekStart, selectedWeekEnd]);

  const activeMonthKey = selectedMonthKey ?? currentMonthKey;
  const isFutureBucket = activeMonthKey === "FUTURE";

  const visibleDays = useMemo(() => {
    const today = todayIso();
    return [
      shiftIsoDate(today, dayWindowOffset - 3),
      shiftIsoDate(today, dayWindowOffset - 2),
      shiftIsoDate(today, dayWindowOffset - 1),
      shiftIsoDate(today, dayWindowOffset),
    ];
  }, [dayWindowOffset]);

  function onCalendarDateChange(iso: string) {
    if (!iso) return;
    setSelectedDate(iso);
    const [ty, tm, td] = todayIso().split("-").map(Number);
    const [py, pm, pd] = iso.split("-").map(Number);
    const diffTime = Date.UTC(py, pm - 1, pd) - Date.UTC(ty, tm - 1, td);
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < dayWindowOffset - 3 || diffDays > dayWindowOffset) {
      setDayWindowOffset(diffDays);
    }
  }

  const { periodStart, periodEnd } = useMemo(() => {
    if (timeScope === "ALL") {
      const minDate = accountEvents.reduce((min, e) => e.transaction_date < min ? e.transaction_date : min, "1970-01-01");
      const maxDate = accountEvents.reduce((max, e) => e.transaction_date > max ? e.transaction_date : max, todayStr);
      return { periodStart: minDate, periodEnd: maxDate };
    }
    if (timeScope === "YEAR") {
      return { periodStart: `${selectedYear}-01-01`, periodEnd: `${selectedYear}-12-31` };
    }
    if (timeScope === "QUARTER") {
      const startMonth = String((selectedQuarter - 1) * 3 + 1).padStart(2, "0");
      const endMonthNum = selectedQuarter * 3;
      const lastDay = new Date(Number(selectedYear), endMonthNum, 0).getDate();
      return {
        periodStart: `${selectedYear}-${startMonth}-01`,
        periodEnd: `${selectedYear}-${String(endMonthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    if (timeScope === "MONTH") {
      if (isFutureBucket) {
        const start = shiftIsoDate(todayStr, 1);
        const end = accountEvents.reduce((max, e) => e.transaction_date > max ? e.transaction_date : max, start);
        return { periodStart: start, periodEnd: end };
      }
      const [y, m] = activeMonthKey.split("-").map(Number);
      const endDay = new Date(y, m, 0).getDate();
      return {
        periodStart: `${activeMonthKey}-01`,
        periodEnd: `${activeMonthKey}-${String(endDay).padStart(2, "0")}`,
      };
    }
    if (timeScope === "WEEK") {
      if (selectedWeekStart && selectedWeekEnd) {
        return { periodStart: selectedWeekStart, periodEnd: selectedWeekEnd };
      }
      return { periodStart: thisWeekStart, periodEnd: thisWeekEnd };
    }
    if (timeScope === "DAY") {
      return { periodStart: selectedDate, periodEnd: selectedDate };
    }
    return {
      periodStart: customStartDate || "1970-01-01",
      periodEnd: customEndDate || todayStr,
    };
  }, [timeScope, selectedYear, selectedQuarter, activeMonthKey, isFutureBucket, selectedDate, customStartDate, customEndDate, selectedWeekStart, selectedWeekEnd, thisWeekStart, thisWeekEnd, accountEvents, todayStr]);

  function getPeriodLabel(): string {
    if (timeScope === "ALL") return tr("All time");
    if (timeScope === "YEAR") return `${tr("Year")} ${selectedYear}`;
    if (timeScope === "QUARTER") return `${tr("Quarter")} ${selectedQuarter}/${selectedYear}`;
    if (timeScope === "MONTH") return monthLabel(activeMonthKey);
    if (timeScope === "WEEK") {
      if (periodStart === thisWeekStart && periodEnd === thisWeekEnd) return tr("This week");
      if (periodStart === lastWeekStart && periodEnd === lastWeekEnd) return tr("Last week");
      const [, sm, sd] = periodStart.split("-");
      const [, em, ed] = periodEnd.split("-");
      return language === "vi" ? `Tuần (${sd}/${sm} → ${ed}/${em})` : `Week (${sd}/${sm} → ${ed}/${em})`;
    }
    if (timeScope === "DAY") return `${tr("Date")} ${selectedDate}`;
    return `${customStartDate} → ${customEndDate}`;
  }

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
    invalidateAllFinancialQueries(qc);
  }

  if (accountsQ.isPending) return <section className="ledger-page"><Loading show /></section>;
  if (!accountsQ.isPending && (accountsQ.data ?? []).length === 0) return <section className="ledger-page"><Empty show text="No accounts yet. Create one first." /></section>;

  const composerDefaultAccountId = typeof selectedAccountId === "number" ? selectedAccountId : (activeAccounts[0]?.id ?? 1);

  return <section className="ledger-page">
    <div className="ledger-top-row">
      <div className="ledger-header">
        <AccountRow
          label="Select account"
          accounts={activeAccounts}
          value={selectedAccountId != null ? String(selectedAccountId) : ""}
          onChange={v => setSelectedAccountId(v === "ALL" ? "ALL" : Number(v))}
          balances={balances}
          allowAll
        />
      </div>

      {/* Time Filters: Tất cả | Năm | Quý | Tháng | Tuần | Ngày | Tùy chỉnh */}
      <div className="ledger-time-filter-wrap">
        <div className="ledger-time-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={timeScope === "ALL"} className={timeScope === "ALL" ? "active" : ""} onClick={() => setTimeScope("ALL")}>{tr("All")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "YEAR"} className={timeScope === "YEAR" ? "active" : ""} onClick={() => setTimeScope("YEAR")}>{tr("Year")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "QUARTER"} className={timeScope === "QUARTER" ? "active" : ""} onClick={() => setTimeScope("QUARTER")}>{tr("Quarter")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "MONTH"} className={timeScope === "MONTH" ? "active" : ""} onClick={() => setTimeScope("MONTH")}>{tr("Month")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "WEEK"} className={timeScope === "WEEK" ? "active" : ""} onClick={() => setTimeScope("WEEK")}>{tr("Week")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "DAY"} className={timeScope === "DAY" ? "active" : ""} onClick={() => setTimeScope("DAY")}>{tr("Day")}</button>
          <button type="button" role="tab" aria-selected={timeScope === "CUSTOM"} className={timeScope === "CUSTOM" ? "active" : ""} onClick={() => setTimeScope("CUSTOM")}>{tr("Custom range")}</button>
        </div>

        {timeScope === "MONTH" && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "4px", width: "100%" }}>
            <button
              type="button"
              className="scroll-arrow-btn"
              onClick={() => setMonthWindowStartIndex(prev => Math.max(0, prev - 1))}
              disabled={monthWindowStartIndex <= 0}
              style={{ opacity: monthWindowStartIndex <= 0 ? 0.35 : 1, cursor: monthWindowStartIndex <= 0 ? "default" : "pointer" }}
              title={tr("Previous month")}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="ledger-months" role="tablist" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {visibleMonths.map(key => {
                const isSelected = activeMonthKey === key;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={isSelected ? "active" : ""}
                    style={{ minWidth: "90px", textAlign: "center" }}
                    onClick={() => setSelectedMonthKey(key)}
                    key={key}
                    ref={isSelected ? activeMonthBtnRef : undefined}
                  >
                    {monthLabel(key)}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="scroll-arrow-btn"
              onClick={() => setMonthWindowStartIndex(prev => Math.min(Math.max(0, allMonths.length - 3), prev + 1))}
              disabled={monthWindowStartIndex >= allMonths.length - 3}
              style={{ opacity: monthWindowStartIndex >= allMonths.length - 3 ? 0.35 : 1, cursor: monthWindowStartIndex >= allMonths.length - 3 ? "default" : "pointer" }}
              title={tr("Next month")}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        )}

        {timeScope === "YEAR" && (
          <div className="time-sub-controls" style={{ marginTop: "4px" }}>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="time-select">
              {distinctYears.map(y => <option value={y} key={y}>{tr("Year")} {y}</option>)}
            </select>
          </div>
        )}

        {timeScope === "QUARTER" && (
          <div className="time-sub-controls" style={{ marginTop: "4px" }}>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="time-select">
              {distinctYears.map(y => <option value={y} key={y}>{tr("Year")} {y}</option>)}
            </select>
            <div style={{ display: "flex", gap: "6px" }}>
              {[1, 2, 3, 4].map(q => (
                <button
                  type="button"
                  key={q}
                  className={`pill-btn ${selectedQuarter === q ? "active" : ""}`}
                  onClick={() => setSelectedQuarter(q)}
                >
                  {tr("Quarter")} {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {timeScope === "WEEK" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px", width: "100%", minWidth: 0 }}>
            {/* Dòng 1: Chọn Tháng và Năm */}
            <div>
              <input
                type="month"
                value={`${selectedWeekYear}-${String(selectedWeekMonth).padStart(2, "0")}`}
                onChange={e => {
                  if (!e.target.value) return;
                  const [y, m] = e.target.value.split("-").map(Number);
                  setSelectedWeekYear(y);
                  setSelectedWeekMonth(m);
                }}
                onClick={e => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
                className="time-input"
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  color: "var(--text)",
                  width: "auto",
                  minWidth: "160px"
                }}
              />
            </div>

            {/* Dòng 2: Danh sách các tuần trong tháng, liền sau là Tuần trước & Tuần này */}
            <div className="ledger-scroll-row-wrap">
              <button
                type="button"
                className="scroll-arrow-btn"
                onClick={() => weekScrollRef.current?.scrollBy({ left: -240, behavior: "smooth" })}
                title={tr("Previous")}
                aria-label="Previous weeks"
              >
                ‹
              </button>
              <div className="ledger-months scroll-container" role="tablist" ref={weekScrollRef}>
                {currentMonthWeeks.map(w => {
                  const isSelected = periodStart === w.start && periodEnd === w.end;
                  return (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={isSelected ? "active" : ""}
                      onClick={() => {
                        setSelectedWeekStart(w.start);
                        setSelectedWeekEnd(w.end);
                      }}
                      key={w.start}
                      ref={isSelected ? activeWeekBtnRef : undefined}
                    >
                      {w.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="tab"
                  aria-selected={periodStart === lastWeekStart && periodEnd === lastWeekEnd}
                  className={periodStart === lastWeekStart && periodEnd === lastWeekEnd ? "active" : ""}
                  onClick={() => {
                    setSelectedWeekStart(lastWeekStart);
                    setSelectedWeekEnd(lastWeekEnd);
                  }}
                  ref={periodStart === lastWeekStart && periodEnd === lastWeekEnd ? activeWeekBtnRef : undefined}
                >
                  {tr("Last week")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={periodStart === thisWeekStart && periodEnd === thisWeekEnd}
                  className={periodStart === thisWeekStart && periodEnd === thisWeekEnd ? "active" : ""}
                  onClick={() => {
                    setSelectedWeekStart(thisWeekStart);
                    setSelectedWeekEnd(thisWeekEnd);
                  }}
                  ref={periodStart === thisWeekStart && periodEnd === thisWeekEnd ? activeWeekBtnRef : undefined}
                >
                  {tr("This week")}
                </button>
              </div>
              <button
                type="button"
                className="scroll-arrow-btn"
                onClick={() => weekScrollRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
                title={tr("Next")}
                aria-label="Next weeks"
              >
                ›
              </button>
            </div>
          </div>
        )}

      {timeScope === "DAY" && (
        <div className="time-sub-controls" style={{ marginTop: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "nowrap" }}>
          <button
            type="button"
            className="scroll-arrow-btn"
            onClick={() => setDayWindowOffset(prev => prev - 1)}
            title={tr("Previous")}
            aria-label="Previous days"
          >
            ‹
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
            {visibleDays.map(d => (
              <button
                key={d}
                type="button"
                className={`pill-btn ${selectedDate === d ? "active" : ""}`}
                style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                onClick={() => setSelectedDate(d)}
              >
                {formatShortDayLabel(language, d)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="scroll-arrow-btn"
            onClick={() => setDayWindowOffset(prev => prev + 1)}
            title={tr("Next")}
            aria-label="Next days"
          >
            ›
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => onCalendarDateChange(e.target.value)}
            onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
            className="time-input"
            style={{ cursor: "pointer", marginLeft: "4px", padding: "3px 6px", height: "28px", minHeight: "28px", fontSize: "0.82rem" }}
            aria-label={tr("Select date")}
          />
        </div>
      )}

        {timeScope === "CUSTOM" && (
          <div className="time-sub-controls" style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="hint" style={{ whiteSpace: "nowrap", fontWeight: 600, minWidth: "60px" }}>{tr("From date")}:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
                className="time-input"
                style={{ cursor: "pointer", flex: 1, minHeight: "32px" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="hint" style={{ whiteSpace: "nowrap", fontWeight: 600, minWidth: "60px" }}>{tr("To date")}:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch {} }}
                className="time-input"
                style={{ cursor: "pointer", flex: 1, minHeight: "32px" }}
              />
            </div>
          </div>
        )}
      </div>
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
            <label
              className="ledger-select-all"
              style={{ display: "inline-flex", flexDirection: "row", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none", margin: 0, padding: 0, whiteSpace: "nowrap" }}
              onClick={e => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleSelectAll}
                aria-label={tr("Select all")}
                style={{ width: "14px", height: "14px", minHeight: "14px", margin: 0, flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--text)", lineHeight: 1 }}>{tr("Select all")}</span>
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
        </> : <>
          <p>
            {tr("Are you sure you want to delete all transactions in this period? This action cannot be undone.")}
          </p>
          <p className="hint">
            {tr("Period")}: <strong>{getPeriodLabel()}</strong> ({periodEvents.length} {tr("transactions")})
          </p>
        </>}

        <label className="checkbox-row" style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={includeAssetEvents}
            onChange={e => setIncludeAssetEvents(e.target.checked)}
          />
          <span style={{ fontSize: "0.88rem", fontWeight: 600, color: includeAssetEvents ? "#dc2626" : "inherit" }}>
            {tr("Delete asset-related transactions as well (Savings, Metals, Crypto)")}
          </span>
        </label>

        {deleteError && <p className="error" role="alert">{deleteError}</p>}
        <div className="form-actions" style={{ marginTop: "16px" }}>
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
                if (targetEvents.length === 0) {
                  setDeleteError(tr("No transactions selected."));
                  setIsDeleting(false);
                  return;
                }
                await Promise.all(targetEvents.map(e => api.events.remove(e.id, true)));
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
function Submit({ pending, text, className, style }: { pending: boolean; text: string; className?: string; style?: React.CSSProperties }) { const { tr } = useI18n(); return <button className={`primary ${className ?? ""}`.trim()} style={style} disabled={pending}>{pending ? tr("Saving…") : tr(text)}</button>; }
function Status({ active }: { active: boolean }) { const { tr } = useI18n(); return <small className={`status ${active ? "active-status" : ""}`}>{tr(active ? "Active" : "Inactive")}</small>; }
function Error({ error }: { error: Error | null }) { const { tr } = useI18n(); return error ? <p className="error" role="alert">{tr(transactionUiKeys.loadFailed)}</p> : null; }
function Loading({ show }: { show: boolean }) { const { tr } = useI18n(); return show ? <p className="notice" role="status" aria-live="polite">{tr("Loading…")}</p> : null; }
function Empty({ show, text }: { show: boolean; text: string }) { const { tr } = useI18n(); return show ? <p className="notice">{tr(text)}</p> : null; }
