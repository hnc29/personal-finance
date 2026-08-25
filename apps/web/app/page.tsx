"use client";

import { createContext, FormEvent, useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Account, AccountBalance, AccountType, Category, CoinSummary, EventInput, EventType, FinancialEvent, ImportApplyResult, SavingsAccount, SavingsCreateInput, SavingsPatchInput } from "../lib/api";
import { categoryLabel, copy, enumLabel, Language, transactionUiKeys, ui, useLanguage } from "../lib/i18n";
import { buildCategoryTree, categoriesForEventType, categoryDepth, categoryIsValidForEventType, categoryPath, filterCategoryTree, toggleCategoryExpansion, canMoveCategory, categoryRoot, getCategoryDepth } from "../lib/category-tree";
import { CategoryIcon, IconGlyph, ICON_GROUPS, iconLabel } from "../lib/category-icons";
import { bankCatalog } from "../lib/bank-catalog";
import { AccountLogo } from "../lib/account-logos";

type View = "transactions" | "accounts" | "categories" | "review" | "assets" | "data";
type EntryDraft = { accountId: string; amount: string };
const accountTypes: AccountType[] = ["CASH", "BANK", "CREDIT_CARD", "EWALLET"];
// TASK-034: the composer only creates the four transaction types a person
// enters by hand. INTEREST/SAVINGS_DEPOSIT/SAVINGS_WITHDRAWAL are owned
// exclusively by the Savings module's own actions (a manually-typed one
// would be an orphan event with no SavingsTerm/principal behind it);
// ADJUSTMENT now lives on the Accounts page (see AccountAdjustForm);
// ASSET_PURCHASE/ASSET_SALE have no live producer anywhere in the app.
const composerEventTypes: EventType[] = ["EXPENSE", "INCOME", "TRANSFER", "CREDIT_CARD_PAYMENT"];
// BUGFIX: no leading "-?" here -- the single-entry EXPENSE/INCOME amount
// input's sign is now entirely determined by the Expense/Income segmented
// control (see Transactions' submit()), so this field only ever accepts an
// unsigned magnitude, matching the TRANSFER/CREDIT_CARD_PAYMENT amount
// inputs which never allowed a sign either.
const moneyPattern = "^\\d+(\\.\\d{1,4})?$";
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
const bankTemplates = [...bankCatalog.map(x => x.name), "Other / Custom bank"];
const LanguageContext = createContext<Language>("vi");
function useI18n() {
  const language = useContext(LanguageContext);
  return { language, tr: (text: string) => ui(language, text), label: (value: string) => enumLabel(language, value) };
}

export default function Home() {
  const [view, setView] = useState<View>("transactions");
  const [language, setLanguage] = useLanguage();
  const t = copy[language];
  return <LanguageContext.Provider value={language}><main><header><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1></div><div className="header-tools"><div className="language" role="group" aria-label={t.language}><button type="button" aria-pressed={language === "vi"} className={language === "vi" ? "active" : ""} onClick={() => setLanguage("vi")}>🇻🇳 <span>Tiếng Việt</span></button><button type="button" aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>🇺🇸 <span>English</span></button></div><div className="nav-scroll"><nav aria-label={ui(language, "Main navigation")}>{(["transactions", "accounts", "categories", "assets", "data", "review"] as View[]).map(item => <button type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => setView(item)} key={item}>{t[item as keyof typeof t] ?? item}</button>)}</nav></div></div></header>{view === "accounts" ? <Accounts /> : view === "categories" ? <Categories /> : view === "review" ? <Review /> : view === "assets" ? <Assets /> : view === "data" ? <DataPage /> : <Transactions />}</main></LanguageContext.Provider>;
}

function Assets() {
  const { tr, label } = useI18n(); const qc = useQueryClient(); const q = useQuery({ queryKey: ["portfolio"], queryFn: api.portfolio.overview }); const [tab, setTab] = useState<"savings" | "metals" | "crypto">("savings");
  const brands = useQuery({ queryKey: ["metal-brands"], queryFn: api.assets.metalBrands });
  const [coin, setCoin] = useState<CoinSummary | null>(null);
  const metal = useMutation({ mutationFn: api.assets.metals.create, onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }) });
  const crypto = useMutation({ mutationFn: api.assets.crypto.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ["portfolio"] }); setCoin(null); } });
  function submit(e: FormEvent<HTMLFormElement>, kind: "metal" | "crypto") {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "");
    if (kind === "metal") {
      const [whole, fraction = ""] = v("quantity").split(".");
      const scaledChi = BigInt(whole || "0") * BigInt("10000") + BigInt((fraction + "0000").slice(0, 4));
      const scaledGrams = scaledChi * BigInt("375") / BigInt("100");
      const grams = `${scaledGrams / BigInt("10000")}.${String(scaledGrams % BigInt("10000")).padStart(4, "0")}`.replace(/\.?0+$/, "");
      metal.mutate({ metal_type: v("metal_type") as "GOLD" | "SILVER", brand: v("brand"), product_type: v("product_type"), purity: v("purity"), quantity_grams: grams, purchase_date: v("date"), purchase_price: v("price"), total_cost: v("total") });
      return;
    }
    if (!coin) return;
    crypto.mutate({ coingecko_id: coin.id, symbol: coin.symbol, display_name: coin.name, quantity: v("quantity"), purchase_date: v("date"), purchase_price: v("price"), total_cost: v("total") });
  }
  const forms = {
    metals: <form className="panel form asset-form" onSubmit={e => submit(e, "metal")}><h3>{tr("Precious metals")}</h3><select name="metal_type"><option value="GOLD">{tr("Gold")}</option><option value="SILVER">{tr("Silver")}</option></select><select name="brand" aria-label={tr("Product catalog")}>{(brands.data ?? []).map(b => <option value={b} key={b}>{label(b)}</option>)}</select><input name="product_type" placeholder={tr("Product")} required /><input name="quantity" placeholder={tr("Quantity (chỉ)")} aria-label={tr("Quantity (chỉ)")} inputMode="decimal" required /><input name="purity" placeholder={tr("Purity")} required /><input name="price" placeholder={tr("Purchase price")} inputMode="decimal" required /><input name="total" placeholder={tr("Total cost")} inputMode="decimal" required /><input name="date" type="date" required /><button className="primary">+ {tr("Add")}</button></form>,
    crypto: <form className="panel form asset-form" onSubmit={e => submit(e, "crypto")}><h3>{tr("Crypto")}</h3><CoinPicker selected={coin} onSelect={setCoin} tr={tr} /><input name="quantity" placeholder={tr("Quantity")} inputMode="decimal" required /><input name="price" placeholder={tr("Purchase price")} inputMode="decimal" required /><input name="total" placeholder={tr("Total cost")} inputMode="decimal" required /><input name="date" type="date" required /><button className="primary" disabled={!coin}>+ {tr("Add")}</button></form>,
  };
  const p = q.data;
  return <Section title="Assets" subtitle="Manage assets, investments, and net worth in one place.">
    <Loading show={q.isPending} />
    <Error error={q.error} />
    {p && <>
      <div className="portfolio-grid metrics-grid">
        <article className="panel"><h3>{tr("Net worth")}</h3><p className="metric">{fmtMoney(p.net_worth) ?? tr("Valuation incomplete")}</p></article>
        <article className="panel"><h3>{tr("Accounts in scope")}</h3><p className="metric">{p.account_count}</p></article>
        <article className="panel"><h3>{tr("Invested assets")}</h3><p className="metric">{fmtMoney(p.invested_assets) ?? tr("Valuation incomplete")}</p></article>
      </div>
      {!p.valuation_complete && <p className="quote-notice" role="status">{tr("Valuation incomplete: one or more invested assets has no usable quote.")}</p>}
    </>}
    <div className="asset-tabs" role="tablist">{([["savings","Savings"],["metals","Precious metals"],["crypto","Crypto"]] as const).map(([id,label])=><button type="button" role="tab" aria-selected={tab===id} className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{tr(label)}</button>)}</div>
    {tab === "savings" ? <SavingsPanel /> : <>{forms[tab]}<div className="asset-sections"><AssetSection title={tab === "metals" ? "Precious metals" : "Crypto"} rows={tab === "metals" ? p?.precious_metals ?? [] : p?.crypto ?? []}/></div></>}
    {p && <div className="asset-sections asset-sections-secondary"><AssetSection title="Credit cards" rows={p.credit_cards}/></div>}
  </Section>;
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
      <article className="panel"><h3>{tr("Total principal")}</h3><p className="metric">{totalPrincipal || "0"}</p></article>
      <article className="panel"><h3>{tr("Expected interest")}</h3><p className="metric">{totalExpectedInterest || "0"}</p></article>
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
        <p className="savings-card-principal">{fmtMoney(row.principal)} {row.currency}</p>
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
  const { tr, label } = useI18n();
  const [openedDate, setOpenedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [termMonths, setTermMonths] = useState("12");
  const create = useMutation({ mutationFn: (input: SavingsCreateInput) => api.assets.savings.create(input), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    create.mutate({
      institution: v("institution"), product_name: v("product_name") || undefined, name: v("name"),
      principal: v("principal"), funding_account_id: Number(v("funding_account_id")), opened_date: v("opened_date"),
      term_months: Number(v("term_months")), annual_rate: v("annual_rate"), non_term_rate: v("non_term_rate") || "0",
      interest_payment_method: v("interest_payment_method") as SavingsCreateInput["interest_payment_method"],
      maturity_action: v("maturity_action") as SavingsCreateInput["maturity_action"],
      notes: v("notes") || null,
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
      <Field label="Deposit amount"><input name="principal" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" required /></Field>
      <Field label="Source account"><select name="funding_account_id" required defaultValue="">
        <option value="" disabled>{tr("Select account")}</option>
        {walletAccounts.map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
      </select></Field>
      {walletAccounts.length === 0 && <p className="hint">{tr("No wallet accounts available. Create a cash, bank, or e-wallet account first.")}</p>}
      <Field label="Deposit date"><input name="opened_date" type="date" required value={openedDate} onChange={e => setOpenedDate(e.target.value)} /></Field>
      <Field label="Term (months)"><input name="term_months" type="number" min={1} step={1} required value={termMonths} onChange={e => setTermMonths(e.target.value)} /></Field>
    </fieldset>
    <fieldset><legend>{tr("Interest rate")} &amp; {tr("Maturity date")}</legend>
      <Field label="Annual interest rate (%/year)"><input name="annual_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" required /></Field>
      <Field label="Demand interest rate (%/year)"><input name="non_term_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue="0" /></Field>
      <Field label="Interest payment method"><select name="interest_payment_method" defaultValue="AT_MATURITY">{(["AT_MATURITY", "UPFRONT", "PERIODIC"] as const).map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
      <Field label="Maturity date"><input value={previewMaturity} disabled readOnly /></Field>
      <Field label="On maturity"><select name="maturity_action" defaultValue="CLOSE">{(["CLOSE", "RENEW_PRINCIPAL", "RENEW_PRINCIPAL_AND_INTEREST"] as const).map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
    </fieldset>
    <fieldset><legend>{tr("Notes")}</legend><Field label="Notes"><input name="notes" /></Field></fieldset>
    <div className="form-actions"><Submit pending={create.isPending} text="Save savings account" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function SavingsDetailDialog({ id, walletAccounts, onClose, onChanged }: { id: number; walletAccounts: Account[]; onClose: () => void; onChanged: () => void }) {
  const { tr, label } = useI18n();
  const [action, setAction] = useState<"edit" | "close" | "early-close" | "renew" | null>(null);
  const detail = useQuery({ queryKey: ["savings", id], queryFn: () => api.assets.savings.get(id) });
  const qc = useQueryClient();
  function afterAction() { setAction(null); qc.invalidateQueries({ queryKey: ["savings", id] }); onChanged(); }
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
        <div><dt>{tr("Current principal")}</dt><dd>{fmtMoney(row.principal)} {row.currency}</dd></div>
        {term && <div><dt>{tr("Interest rate")}</dt><dd>{term.annual_rate}%/năm</dd></div>}
        {term && <div><dt>{tr("Deposit date")}</dt><dd>{term.start_date}</dd></div>}
        {term && <div><dt>{tr("Term (months)")}</dt><dd>{term.term_months}</dd></div>}
        {term && <div><dt>{tr("Maturity date")}</dt><dd>{term.maturity_date}</dd></div>}
        {term && term.status === "ACTIVE" && <div><dt>{tr("Expected interest")}</dt><dd>{fmtMoney(term.expected_interest)}</dd></div>}
        {term && term.status === "ACTIVE" && term.expected_interest && <div><dt>{tr("Projected value at maturity")}</dt><dd>{sumMoney([row.principal, term.expected_interest])}</dd></div>}
        <div><dt>{tr("On maturity")}</dt><dd>{term ? label(term.maturity_action) : "—"}</dd></div>
        <div><dt>{tr("Notes")}</dt><dd>{row.notes || "—"}</dd></div>
      </dl>
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
        <span>{fmtMoney(t.principal)} {row.currency}</span>
        <span>{t.annual_rate}%/năm</span>
        {t.actual_interest != null && <span>{tr("Actual interest received")}: {fmtMoney(t.actual_interest)}</span>}
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
  const { tr, label } = useI18n();
  const term = row.current_term;
  const patch = useMutation({ mutationFn: (input: SavingsPatchInput) => api.assets.savings.update(row.id, input), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    patch.mutate({
      institution: v("institution"), product_name: v("product_name"), name: v("name"),
      opened_date: v("opened_date"), term_months: Number(v("term_months")),
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
    <Field label="Deposit date"><input name="opened_date" type="date" defaultValue={term?.start_date} required /></Field>
    <Field label="Term (months)"><input name="term_months" type="number" min={1} step={1} defaultValue={term?.term_months} required /></Field>
    <Field label="Annual interest rate (%/year)"><input name="annual_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue={term?.annual_rate} required /></Field>
    <Field label="Demand interest rate (%/year)"><input name="non_term_rate" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue={term?.non_term_rate} /></Field>
    <Field label="On maturity"><select name="maturity_action" defaultValue={term?.maturity_action ?? "CLOSE"}>{(["CLOSE", "RENEW_PRINCIPAL", "RENEW_PRINCIPAL_AND_INTEREST"] as const).map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
    <Field label="Notes"><input name="notes" defaultValue={row.notes ?? ""} /></Field>
    <div className="form-actions"><Submit pending={patch.isPending} text="Save changes" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function SavingsCloseForm({ id, kind, walletAccounts, onDone, onCancel }: { id: number; kind: "close" | "early-close"; walletAccounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const { tr, label } = useI18n();
  const close = useMutation({
    mutationFn: (payload: { closed_date: string; receiving_account_id: number; actual_interest: string; fee?: string }) =>
      kind === "close" ? api.assets.savings.close(id, payload) : api.assets.savings.earlyClose(id, payload),
    onSuccess: onDone,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    close.mutate({ closed_date: v("closed_date"), receiving_account_id: Number(v("receiving_account_id")), actual_interest: v("actual_interest") || "0", fee: kind === "early-close" ? (v("fee") || "0") : undefined });
  }
  return <form className="form savings-form" onSubmit={submit}>
    <Error error={close.error} />
    <Field label="Settlement date"><input name="closed_date" type="date" required /></Field>
    <Field label="Receiving account"><select name="receiving_account_id" required defaultValue="">
      <option value="" disabled>{tr("Select account")}</option>
      {walletAccounts.map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
    </select></Field>
    <Field label="Actual interest received"><input name="actual_interest" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" required /></Field>
    {kind === "early-close" && <Field label="Fee (optional)"><input name="fee" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue="0" /></Field>}
    <div className="form-actions"><Submit pending={close.isPending} text={kind === "close" ? "Settle" : "Early settle"} /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function SavingsRenewForm({ id, walletAccounts, onDone, onCancel }: { id: number; walletAccounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const { tr, label } = useI18n();
  const renew = useMutation({ mutationFn: (payload: { start_date: string; actual_interest: string; receiving_account_id?: number }) => api.assets.savings.renew(id, payload), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? "").trim();
    const receiving = v("receiving_account_id");
    renew.mutate({ start_date: v("start_date"), actual_interest: v("actual_interest") || "0", receiving_account_id: receiving ? Number(receiving) : undefined });
  }
  return <form className="form savings-form" onSubmit={submit}>
    <Error error={renew.error} />
    <Field label="Renewal start date"><input name="start_date" type="date" required /></Field>
    <Field label="Actual interest received"><input name="actual_interest" inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" defaultValue="0" /></Field>
    <Field label="Receiving account"><select name="receiving_account_id" defaultValue="">
      <option value="">{tr("None")}</option>
      {walletAccounts.map(a => <option value={a.id} key={a.id}>{a.name} · {label(a.account_type)}</option>)}
    </select></Field>
    <div className="form-actions"><Submit pending={renew.isPending} text="Renew" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function CoinPicker({ selected, onSelect, tr }: { selected: CoinSummary | null; onSelect: (coin: CoinSummary) => void; tr: (text: string) => string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(timer); }, [query]);
  const results = useQuery({ queryKey: ["coins", debounced], queryFn: () => api.assets.crypto.searchCoins(debounced), enabled: open });
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="category-picker" ref={root}>
    <button type="button" className="category-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(x => !x)}>
      <span>{selected ? `${selected.name} (${selected.symbol.toUpperCase()})` : tr("Choose coin")}</span>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="category-popover" role="listbox" aria-label={tr("Search coin")}>
      <input autoFocus aria-label={tr("Search coin")} placeholder={tr("Search coin")} value={query} onChange={e => setQuery(e.target.value)} />
      {results.isFetching && <p className="hint">{tr("Loading…")}</p>}
      {results.isError && <p className="hint">{tr("Coin catalog unavailable")}</p>}
      {results.data?.map(item => <button type="button" role="option" key={item.id} aria-selected={selected?.id === item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => { onSelect(item); setOpen(false); }}>{item.name} <small>{item.symbol.toUpperCase()}</small></button>)}
    </div>}
  </div>;
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
  const { tr } = useI18n();
  const qc = useQueryClient();
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
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
  return <Section title="Data" subtitle="Import and export personal finance records."><div className="panel data-workflow"><h3>{tr("Import from Money Lover")}</h3><input type="file" accept=".csv,.xlsx" aria-label={tr("Choose file")} onChange={e => setFile(e.target.files?.[0] ?? null)}/><button type="button" className="primary" disabled={!file || uploading} onClick={upload}>{uploading ? tr("Uploading...") : tr("Upload for review")}</button>{status && <p className="hint" role="status">{status}</p>}<p className="hint">{tr("Matching rows are applied straight into your ledger on upload; unmatched wallets are reported so you can fix and re-apply from the Review page.")}</p><div className="form-actions"><a className="secondary" href={`${base}/api/v1/exports/events.csv`}>{tr("Export CSV")}</a><a className="secondary" href={`${base}/api/v1/exports/events.xlsx`}>{tr("Export XLSX")}</a></div></div></Section>;
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

function AssetSection({ title, rows }: { title: string; rows: import("../lib/api").PortfolioRow[] }) { const { label, tr } = useI18n(); return <article className="panel asset-panel"><h3>{tr(title)}</h3><Empty show={rows.length === 0} text={`No ${title.toLowerCase()} yet.`}/><div className="asset-list">{rows.map(row => <div className="asset-row" key={row.id}><div><strong>{row.name}</strong><small>{fmtMoney(row.value) ?? tr("Valuation unavailable")}</small></div>{row.quote && <div><span className="provider">{row.quote.provider ?? tr("No provider")}</span><span className="quote-state">{label(row.quote.state)}</span><small>{row.quote.quoted_at ?? tr("No quote timestamp")}</small></div>}</div>)}</div></article>; }

function Accounts() {
  const { label, tr } = useI18n();
  const qc = useQueryClient();
  const [formTarget, setFormTarget] = useState<"new" | Account | null>(null);
  const [adjusting, setAdjusting] = useState<Account | null>(null);
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
    <div className="cards">{query.data?.map((x, i) => <article className={!x.is_active ? "inactive" : ""} key={x.id}>
      <div><span className="account-name"><AccountLogo name={x.name} accountType={x.account_type} /><strong>{x.name}</strong></span><Status active={x.is_active} /></div>
      <span>{label(x.account_type)} · {x.currency}</span>
      <p className="account-balance">{tr("Current balance")}: <strong>{fmtMoney(balances.balances.get(x.id)) ?? (balances.isPending ? "…" : "—")}</strong></p>
      <div className="card-actions">
        <button type="button" className="text-button" aria-label={tr("Move up")} disabled={move.isPending || i === 0} onClick={() => moveBy(i, -1)}>↑</button>
        <button type="button" className="text-button" aria-label={tr("Move down")} disabled={move.isPending || i === (query.data?.length ?? 0) - 1} onClick={() => moveBy(i, 1)}>↓</button>
        <button type="button" className="text-button" onClick={() => setFormTarget(x)}>{tr("Edit")}</button>
        <button type="button" className="text-button" onClick={() => setAdjusting(x)}>{tr("Adjust balance")}</button>
        <button type="button" className="text-button" disabled={toggle.isPending} onClick={() => toggle.mutate(x)}>{tr(x.is_active ? "Deactivate" : "Activate")}</button>
      </div>
    </article>)}</div>
    {formTarget != null && <Modal title={formTarget === "new" ? "Add account" : "Edit account"} onClose={() => setFormTarget(null)}>
      <AccountFormDialog editing={formTarget === "new" ? null : formTarget} onDone={() => { setFormTarget(null); refresh(); }} onCancel={() => setFormTarget(null)} />
    </Modal>}
    {adjusting && <Modal title="Adjust balance" onClose={() => setAdjusting(null)}>
      <AccountAdjustForm account={adjusting} currentBalance={balances.balances.get(adjusting.id) ?? "0"} onDone={() => { setAdjusting(null); refresh(); }} onCancel={() => setAdjusting(null)} />
    </Modal>}
  </Section>;
}

function AccountFormDialog({ editing, onDone, onCancel }: { editing: Account | null; onDone: () => void; onCancel: () => void }) {
  const { tr, label } = useI18n();
  const [bankSearch, setBankSearch] = useState("");
  const save = useMutation({ mutationFn: (input: { id?: number; name: string; account_type: AccountType; currency: string }) => input.id ? api.accounts.update(input.id, input) : api.accounts.create(input), onSuccess: onDone });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({ id: editing?.id, name: String(f.get("name")).trim(), account_type: String(f.get("type")) as AccountType, currency: String(f.get("currency")).trim().toUpperCase() });
  }
  return <form onSubmit={submit} className="form">
    <Error error={save.error} />
    <Field label="Name"><input name="name" defaultValue={editing?.name} required /></Field>
    <Field label="Type"><select name="type" defaultValue={editing?.account_type ?? "CASH"}>{accountTypes.map(x => <option value={x} key={x}>{label(x)}</option>)}</select></Field>
    {!editing && <Field label="Bank template"><input placeholder={tr("Search banks")} value={bankSearch} onChange={e => setBankSearch(e.target.value)} /><select defaultValue="" onChange={e => { const input = e.currentTarget.form?.elements.namedItem("name") as HTMLInputElement | null; if (input && !input.value) input.value = e.target.value; }}><option value="">{tr("Choose bank template")}</option>{bankTemplates.filter(bank => bank.toLowerCase().includes(bankSearch.toLowerCase())).map(bank => <option value={bank} key={bank}>{bank}</option>)}</select></Field>}
    <Field label="Currency"><input name="currency" defaultValue={editing?.currency ?? "VND"} maxLength={3} pattern="[A-Za-z]{3}" required /></Field>
    <div className="form-actions"><Submit pending={save.isPending} text={editing ? "Save changes" : "Add account"} /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function AccountAdjustForm({ account, currentBalance, onDone, onCancel }: { account: Account; currentBalance: string; onDone: () => void; onCancel: () => void }) {
  const { tr } = useI18n();
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
    adjust.mutate({ transaction_date: String(f.get("date")), note: String(f.get("note") ?? "").trim() || undefined });
  }
  return <form onSubmit={submit} className="form savings-form">
    <Error error={adjust.error} />
    <p className="hint">{tr("Current balance")}: <strong>{fmtMoney(currentBalance)}</strong> {account.currency}</p>
    <Field label="New balance"><input inputMode="decimal" pattern="^-?\d+(\.\d{1,4})?$" value={target} onChange={e => setTarget(e.target.value)} required /></Field>
    <p className="hint">{tr("Difference")}: <strong>{delta}</strong>{noChange && ` — ${tr("No change to save.")}`}</p>
    <Field label="Adjustment date"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
    <Field label="Notes"><input name="note" /></Field>
    <div className="form-actions"><Submit pending={adjust.isPending} text="Save changes" /><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button></div>
  </form>;
}

function Categories() {
  const { language, tr } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [iconKey, setIconKey] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [group, setGroup] = useState<"ALL" | "EXPENSE" | "INCOME">("ALL");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const query = useQuery({ queryKey: ["categories"], queryFn: api.categories.list });
  useEffect(() => {
    // TASK-031 §4.2: root sections start expanded.
    if (query.data) setExpanded(new Set(query.data.filter(c => c.parent_id == null).map(c => c.id)));
  }, [query.data]);
  const save = useMutation({ mutationFn: (input: { id?: number; name: string; parent_id: number | null; icon: string | null }) => input.id ? api.categories.update(input.id, input) : api.categories.create(input), onSuccess: () => { setEditing(null); setParentId(null); setIconKey(null); qc.invalidateQueries({ queryKey: ["categories"] }); } });
  const toggle = useMutation({ mutationFn: (category: Category) => api.categories.update(category.id, { is_active: !category.is_active }), onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }) });
  function startEdit(node: Category | null) { setEditing(node); setParentId(node?.parent_id ?? null); setIconKey(node?.icon ?? null); }
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); if (editing?.id && !canMoveCategory(editing.id, parentId, query.data ?? [])) return; save.mutate({ id: editing?.id, name: String(f.get("name")).trim(), parent_id: parentId, icon: iconKey }); }
  const all = query.data ?? []; const filtered = filterCategoryTree(all, search, n => categoryLabel(language, n)).filter(c => group === "ALL" || (categoryRoot(c, all)?.name === (group === "EXPENSE" ? "Expenses" : "Income")));
  const roots = buildCategoryTree(filtered);
  const render = (node: ReturnType<typeof buildCategoryTree>[number], level = 1): React.ReactNode => { const has = node.children.length > 0; const open = search ? true : expanded.has(node.id); return <div key={node.id} className={`category-tree-row level-${level}`}><div className="category-row-main"><button type="button" className="disclosure" disabled={!has} aria-expanded={has ? open : undefined} aria-label={tr(open ? "Collapse" : "Expand")} onClick={() => setExpanded(x => toggleCategoryExpansion(x, node.id))}>{has ? (open ? "▾" : "▸") : "·"}</button><span className="category-icon"><CategoryIcon name={node.name} icon={node.icon} size={16} /></span><strong>{categoryLabel(language, node.name)}</strong>{node.orphan && <span className="badge warning">{tr("Other / Unclassified")}</span>}<Status active={node.is_active} /><div className="card-actions"><button type="button" className="text-button" onClick={() => startEdit(node)}>{tr("Edit")}</button>{level < 3 && <button type="button" className="text-button" onClick={() => startEdit({ id: 0, name: "", parent_id: node.id, is_active: true, icon: null })}>+ {tr("Add child category")}</button>}<button type="button" className="text-button" onClick={() => toggle.mutate(node)}>{tr(node.is_active ? "Deactivate" : "Activate")}</button></div></div>{open && node.children.map(child => render(child, level + 1))}</div>; };
  return <Section title="Categories" subtitle="Organize events into an optional hierarchy."><div className="category-toolbar"><input aria-label={tr("Search category")} placeholder={tr("Search category")} value={search} onChange={e => setSearch(e.target.value)} /><div className="segmented">{([["ALL","All"],["EXPENSE","Expenses"],["INCOME","Income"]] as const).map(([id,label]) => <button type="button" className={group === id ? "active" : ""} onClick={() => setGroup(id)} key={id}>{tr(label)}</button>)}</div></div><form onSubmit={submit} className="form category-form" key={`${editing?.id ?? "new"}-${editing?.parent_id ?? ""}`}><Field label="Name"><input name="name" defaultValue={editing?.id ? editing.name : ""} required /></Field><Field label="Parent"><ParentPicker categories={all} editingId={editing?.id || undefined} selectedParentId={parentId} onChange={setParentId} language={language} /></Field><Field label="Icon"><IconPicker value={iconKey} onChange={setIconKey} language={language} /></Field><div className="form-actions"><Submit pending={save.isPending} text={editing?.id ? "Save changes" : "Add category"} />{editing && <button type="button" className="secondary" onClick={() => startEdit(null)}>{tr("Cancel")}</button>}</div></form><Error error={query.error ?? save.error ?? toggle.error} /><Loading show={query.isPending} /><Empty show={!query.isPending && roots.length === 0} text={search ? "No categories found." : "No categories yet."} /><div className="category-tree" role="tree">{roots.map(node => render(node))}</div></Section>;
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
  const visible = filterCategoryTree(categories, query, n => categoryLabel(language, n)).filter(c => c.parent_id == null || expanded.has(c.parent_id));
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
  function resetComposer() {
    setEntries([{ accountId: "", amount: "" }]);
    setTransferFrom(""); setTransferTo(""); setTransferAmount("");
    setCardAccountId(""); setFundingAccountId(""); setPaymentAmount("");
    setDate(todayIso());
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
    mutation.mutate({ event_type: type, transaction_date: date, category_id: categoryIsValidForEventType(type, categoryId, categories.data ?? []) ? Number(categoryId) : null, payee_text: String(f.get("payee") ?? "").trim() || undefined, trip_event_text: String(f.get("trip") ?? "").trim() || undefined, note: String(f.get("note") ?? "").trim() || undefined, entries: submittedEntries });
  }
  const amountCurrency = (type === "TRANSFER" ? activeAccounts.find(a => String(a.id) === transferFrom)
    : type === "CREDIT_CARD_PAYMENT" ? activeAccounts.find(a => String(a.id) === fundingAccountId)
    : activeAccounts.find(a => String(a.id) === entries[0]?.accountId))?.currency ?? "VND";
  const dateRow = <div className="date-row">
    <button type="button" className="date-nav" aria-label={tr("Previous day")} onClick={() => setDate(d => shiftIsoDate(d, -1))}>‹</button>
    <label className="date-center">
      <span>{formatIsoDateLabel(language, date)}</span>
      <input type="date" aria-label={tr("Choose date")} value={date} onChange={e => setDate(e.target.value || todayIso())} required className="date-native" />
    </label>
    <button type="button" className="date-nav" aria-label={tr("Next day")} onClick={() => setDate(d => shiftIsoDate(d, 1))}>›</button>
  </div>;
  {/* TASK-037: 26px matches AccountLogo/CategoryIcon in the other .row-icon slots below (32px container, ~26px content) so every composer row reads at the same visual weight. */}
  const noteRow = <div className="note-row"><span className="row-icon" aria-hidden="true"><IconGlyph iconKey="Notebook" size={26} /></span><input name="note" placeholder={tr("Add a note")} defaultValue={editingEvent?.note ?? ""} className="note-input" /></div>;
  return <Section title="Transactions" subtitle="Record events with exact signed decimal amounts; validation and balances remain on the server.">
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
          <AccountRow label="From account" accounts={activeAccounts} value={transferFrom} onChange={setTransferFrom} />
          <AccountRow label="To account" accounts={activeAccounts} value={transferTo} onChange={setTransferTo} />
          <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><input className="amount-input" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" placeholder="0" required /></div>
          {formError && <p className="error" role="alert">{formError}</p>}
        </> : type === "CREDIT_CARD_PAYMENT" ? <>
          {creditCardAccounts.length === 0 ? <p className="hint">{tr("No credit card accounts available. Create one first.")}</p> : fundingAccounts.length === 0 ? <p className="hint">{tr("No wallet accounts available. Create a cash, bank, or e-wallet account first.")}</p> : <>
            <AccountRow label="Credit card" accounts={creditCardAccounts} value={cardAccountId} onChange={setCardAccountId} />
            <AccountRow label="From account" accounts={fundingAccounts} value={fundingAccountId} onChange={setFundingAccountId} />
            <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><input className="amount-input" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} inputMode="decimal" pattern="^\d+(\.\d{1,4})?$" placeholder="0" required /></div>
          </>}
          {formError && <p className="error" role="alert">{formError}</p>}
        </> : <>
          <AccountRow label="Select account" accounts={activeAccounts} value={entries[0]?.accountId ?? ""} onChange={v => updateEntry(0, "accountId", v)} />
          <div className="amount-row"><span className="currency-badge">{amountCurrency}</span><input className="amount-input" value={entries[0]?.amount ?? ""} onChange={e => updateEntry(0, "amount", e.target.value)} inputMode="decimal" pattern={moneyPattern} placeholder="0" required /></div>
          {formError && <p className="error" role="alert">{formError}</p>}
        </>}
        {validCategories.length > 0 && <CategoryPicker categories={validCategories} selected={categoryId} onChange={setCategoryId} language={language} />}
        {noteRow}
        {dateRow}
      </div>
      <button type="button" className="secondary details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>{detailsOpen ? tr("Hide details") : `+ ${tr("Add details")}`}</button>
      {detailsOpen && <div className="form event-details"><Field label="Payee"><input name="payee" defaultValue={editingEvent?.payee_text ?? ""} /></Field><Field label="Trip / event"><input name="trip" defaultValue={editingEvent?.trip_event_text ?? ""} /></Field></div>}
      <div className="form-actions"><Submit pending={mutation.isPending} text={editingEvent ? "Save changes" : "Record transaction"} />{editingEvent && <button type="button" className="secondary" onClick={cancelEdit}>{tr("Cancel")}</button>}</div>
    </form>
    <Error error={events.error ?? accounts.error ?? categories.error ?? mutation.error} />
    <Loading show={events.isPending || accounts.isPending || categories.isPending} />
    <Empty show={!events.isPending && events.data?.length === 0} text="No transactions yet." />
    <div className="table" role="table" aria-label={tr("Transactions")}>
      <div className="row heading" role="row"><span>{tr("Date")}</span><span>{tr("Type")}</span><span>{tr("Details")}</span><span>{tr("Entries")}</span></div>
      {/* TASK-042: "thiết kế thêm tính năng xem chi tiết..." -- each row
          opens a details modal on click (mouse) or Enter/Space (keyboard);
          tabIndex + onKeyDown make this reachable without a mouse since
          the row itself carries the handler rather than a nested button. */}
      {events.data?.map(x => <div className="row row-clickable" role="row" tabIndex={0} key={x.id} onClick={() => setDetailEvent(x)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailEvent(x); } }}><span data-label={tr("Date")}>{x.transaction_date}</span><span data-label={tr("Type")}><span className="event-type">{label(x.event_type)}</span>{x.category_id && <small>{categoryNames.get(x.category_id) ?? `${tr("Category")} #${x.category_id}`}</small>}</span><span data-label={tr("Details")}>{x.payee_text ?? x.trip_event_text ?? x.note ?? tr("None")}</span><span data-label={tr("Entries")}>{x.entries.map(e => <span className="entry" key={e.id}><b>{fmtMoney(e.amount)}</b> · {accountNames.get(e.account_id) ?? `${tr("Account")} #${e.account_id}`}</span>)}</span></div>)}
    </div>
    {detailEvent && <TransactionDetailModal
      event={detailEvent}
      accounts={accounts.data ?? []}
      categories={categories.data ?? []}
      language={language}
      onClose={() => setDetailEvent(null)}
      onEdit={() => { const target = detailEvent; setDetailEvent(null); startEdit(target); }}
    />}
  </Section>;
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
      </dl>
      <div className="detail-entries">{event.entries.map(e => <div className="entry" key={e.id}><b>{fmtMoney(e.amount)}</b> · {accountNames.get(e.account_id) ?? `${tr("Account")} #${e.account_id}`}</div>)}</div>
      <Error error={remove.error} />
      {editable ? <div className="form-actions">
        <button type="button" className="secondary" onClick={onEdit}>{tr("Edit")}</button>
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

/** TASK-036: a tappable row (icon + name + chevron) that opens a popover
 * list of accounts -- the same interaction shape Moneylover uses for its
 * account/category rows -- instead of a plain <select>. */
function AccountRow({ label: labelText, accounts, value, onChange }: { label: string; accounts: Account[]; value: string; onChange: (value: string) => void }) {
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
  const chosen = accounts.find(a => String(a.id) === value);
  return <div className="row-picker" ref={root}>
    <button type="button" className="row-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(x => !x)}>
      <span className="row-icon" aria-hidden="true">{chosen ? <AccountLogo name={chosen.name} accountType={chosen.account_type} size={26} /> : <IconGlyph iconKey="Wallet" size={26} />}</span>
      <span className="row-label">{chosen ? chosen.name : tr(labelText)}</span>
      <span className="row-chevron" aria-hidden="true">›</span>
    </button>
    {open && <div className="row-popover" role="listbox">
      {accounts.length === 0 && <p className="hint">{tr("No accounts yet.")}</p>}
      {accounts.map(a => <button type="button" key={a.id} role="option" aria-selected={String(a.id) === value} className={`row-option${String(a.id) === value ? " selected" : ""}`} onClick={() => { onChange(String(a.id)); setOpen(false); }}>
        <AccountLogo name={a.name} accountType={a.account_type} size={26} /> <span>{a.name}</span>
      </button>)}
    </div>}
  </div>;
}

function CategoryPicker({ categories, selected, onChange, language }: { categories: Category[]; selected: string; onChange: (value: string) => void; language: Language }) { const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [expanded, setExpanded] = useState<Set<number>>(new Set(categories.filter(c => c.parent_id == null).map(c => c.id))); const root = useRef<HTMLDivElement>(null); const chosen = categories.find(x => String(x.id) === selected); const visible = filterCategoryTree(categories, query, n => categoryLabel(language, n)).filter(c => c.parent_id == null || expanded.has(c.parent_id)); useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", close); document.addEventListener("keydown", escape); return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); }; }, [open]); return <div className="category-picker row-picker" ref={root}><button type="button" className="row-trigger" aria-haspopup="tree" aria-expanded={open} onClick={() => setOpen(x => !x)}><span className="row-icon" aria-hidden="true"><CategoryIcon name={chosen?.name ?? "Other"} icon={chosen?.icon} size={26} /></span><span className="row-label">{chosen ? categoryLabel(language, chosen.name) : ui(language, "Choose category")}</span><span className="row-chevron" aria-hidden="true">›</span></button>{open && <div className="category-popover" role="tree" aria-label={ui(language, "Choose category")}><input aria-label={ui(language, "Search category")} placeholder={ui(language, "Search category")} value={query} onChange={e => setQuery(e.target.value)} />{visible.map(category => { const level = categoryDepth(category, categories) + 1; const hasChildren = categories.some(c => c.parent_id === category.id); return <div className="category-node" key={category.id} style={{ marginLeft: `${(level - 1) * 18}px` }}><button type="button" className="disclosure" aria-label={ui(language, expanded.has(category.id) ? "Collapse" : "Expand")} aria-expanded={expanded.has(category.id)} onClick={() => setExpanded(x => toggleCategoryExpansion(x, category.id))} disabled={!hasChildren}>{hasChildren ? (expanded.has(category.id) ? "▾" : "▸") : "·"}</button><button type="button" role="treeitem" aria-level={level} aria-selected={String(category.id) === selected} className={String(category.id) === selected ? "selected" : ""} onClick={() => { onChange(String(category.id)); setOpen(false); }}><CategoryIcon name={category.name} icon={category.icon} size={15} /> {categoryLabel(language, category.name)}</button></div>; })}</div>}</div>; }

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { const { tr } = useI18n(); return <section><div className="section-title"><h2>{tr(title)}</h2><p>{tr(subtitle)}</p></div>{children}</section>; }
function Field({ label: text, children }: { label: string; children: React.ReactNode }) { const { tr } = useI18n(); return <label><span>{tr(text)}</span>{children}</label>; }
function Submit({ pending, text }: { pending: boolean; text: string }) { const { tr } = useI18n(); return <button className="primary" disabled={pending}>{pending ? tr("Saving…") : tr(text)}</button>; }
function Status({ active }: { active: boolean }) { const { tr } = useI18n(); return <small className={`status ${active ? "active-status" : ""}`}>{tr(active ? "Active" : "Inactive")}</small>; }
function Error({ error }: { error: Error | null }) { const { tr } = useI18n(); return error ? <p className="error" role="alert">{tr(transactionUiKeys.loadFailed)}</p> : null; }
function Loading({ show }: { show: boolean }) { const { tr } = useI18n(); return show ? <p className="notice" role="status" aria-live="polite">{tr("Loading…")}</p> : null; }
function Empty({ show, text }: { show: boolean; text: string }) { const { tr } = useI18n(); return show ? <p className="notice">{tr(text)}</p> : null; }
