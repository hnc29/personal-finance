const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
export type AccountType = "CASH" | "BANK" | "CREDIT_CARD" | "EWALLET";
export type EventType = "EXPENSE" | "INCOME" | "TRANSFER" | "CREDIT_CARD_PAYMENT" | "INTEREST" | "SAVINGS_DEPOSIT" | "SAVINGS_WITHDRAWAL" | "ASSET_PURCHASE" | "ASSET_SALE" | "ADJUSTMENT";
export interface Account { id: number; name: string; account_type: AccountType; currency: string; is_active: boolean; sort_order: number; credit_limit?: string | null }
export interface AccountBalance { account_id: number; balance: string }
export interface Category { id: number; name: string; parent_id: number | null; is_active: boolean; icon: string | null }
export interface Entry { id: number; account_id: number; amount: string }
export interface FinancialEvent { id: number; event_type: EventType; transaction_date: string; occurred_at: string | null; category_id: number | null; payee_text: string | null; trip_event_text: string | null; note: string | null; excluded_from_reports: boolean; entries: Entry[] }
export interface AccountInput { name: string; account_type: AccountType; currency?: string; is_active?: boolean; sort_order?: number; credit_limit?: string | null }
export interface CategoryInput { name: string; parent_id?: number | null; is_active?: boolean; icon?: string | null }
export type AccountUpdate = Partial<AccountInput>;
export type CategoryUpdate = Partial<CategoryInput>;
export interface EventInput { event_type: EventType; transaction_date: string; occurred_at?: string | null; category_id?: number | null; payee_text?: string; trip_event_text?: string; note?: string; excluded_from_reports?: boolean; entries: { account_id: number; amount: string }[] }
// TASK-042: editing a transaction always replaces it wholesale (same shape
// as EventInput), matching how the composer re-submits the whole form.
export type EventUpdate = EventInput;
export interface QuoteMeta { state: "LIVE" | "STALE" | "MANUAL" | "UNAVAILABLE"; provider: string | null; quoted_at: string | null; observed_at: string | null; valuation_price: string | null }
export interface PortfolioRow { id: number; name: string; value: string | null; quantity?: string | null; quote?: QuoteMeta | null; excluded_from_reports?: boolean }
export interface PortfolioOverview { as_of: string; valuation_complete: boolean; net_worth: string | null; invested_assets: string | null; account_count: number; accounts: PortfolioRow[]; savings: PortfolioRow[]; credit_cards: PortfolioRow[]; precious_metals: PortfolioRow[]; crypto: PortfolioRow[] }
export interface ImportBatch { id: number; source: string; original_filename: string; imported_at: string; row_count: number; applied_row_count: number }
export interface ImportApplyResult { batch_id: number; total_rows: number; already_applied_rows: number; transfer_pairs_applied: number; expense_income_rows_applied: number; applied_rows: number; categorized_rows: number; uncategorized_rows: number; invalid_rows: number[]; unmatched_wallets: Record<string, number>; unmatched_row_count: number }
export interface ImportUploadResult { row_count: number; apply?: ImportApplyResult | null }
export interface ReconciliationCandidate { id: number; state: string; raw_row_id: number; source_row_number: number; source_row_id: string | null; financial_event_id: number; transaction_date: string; event_type: string }

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}/api/v1${path}`, { ...init, cache: "no-store" });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
export type SavingsDayCount = "ACTUAL_365" | "ACTUAL_360" | "THIRTY_360";
export type SavingsInterestPayment = "AT_MATURITY" | "UPFRONT" | "PERIODIC";
export type SavingsMaturityAction = "CLOSE" | "RENEW_PRINCIPAL" | "RENEW_PRINCIPAL_AND_INTEREST";
export type SavingsTermStatus = "ACTIVE" | "CLOSED" | "EARLY_CLOSED";
export interface SavingsTerm {
  id: number; sequence: number; principal: string; start_date: string; maturity_date: string;
  term_months: number; annual_rate: string; non_term_rate: string;
  day_count_convention: SavingsDayCount; interest_payment_method: SavingsInterestPayment;
  maturity_action: SavingsMaturityAction; status: SavingsTermStatus;
  actual_interest: string | null; closed_at: string | null;
  expected_interest: string | null; days_to_maturity: number | null; maturing_soon: boolean;
}
export interface SavingsAccount {
  id: number; name: string; institution: string; product_name: string; currency: string;
  principal: string; status: "OPEN" | "CLOSED"; opened_date: string; closed_date: string | null;
  funding_account_id: number | null; notes: string | null; excluded_from_reports: boolean; editable: boolean;
  current_term: SavingsTerm | null; terms?: SavingsTerm[];
}
export interface SavingsCreateInput {
  institution: string; product_name?: string; name: string; principal: string;
  funding_account_id?: number | null; opened_date: string; term_months: number;
  annual_rate: string; non_term_rate?: string; day_count_convention?: SavingsDayCount;
  interest_payment_method?: SavingsInterestPayment; maturity_action?: SavingsMaturityAction; notes?: string | null;
  excluded_from_reports?: boolean;
}
export type SavingsPatchInput = Partial<Omit<SavingsCreateInput, "funding_account_id">>;
export interface SavingsCloseInput { closed_date: string; receiving_account_id: number; actual_interest: string }
export interface SavingsEarlyCloseInput extends SavingsCloseInput { fee?: string }
export interface SavingsRenewInput { start_date: string; actual_interest?: string; receiving_account_id?: number }

export interface MetalHolding {
  id: number; name: string; product_type: string; brand: string;
  metal_type: "GOLD" | "SILVER"; purity: string; quantity_grams: string;
  purchase_price: string; total_cost: string; purchase_date: string | null;
  excluded_from_reports: boolean;
}
export interface MetalInput {
  metal_type: "GOLD" | "SILVER"; brand: string; product_type: string;
  purity: string; quantity_grams: string; purchase_date: string;
  purchase_price: string; total_cost: string; pricing_instrument?: string;
  funding_account_id?: number;
  excluded_from_reports?: boolean;
}
export type MetalUpdateInput = Partial<MetalInput>;

export interface CryptoHolding {
  id: number; coingecko_id: string; symbol: string; display_name: string | null;
  quantity: string; purchase_price: string; total_cost: string;
  purchase_date: string | null; excluded_from_reports: boolean;
}
export interface CryptoInput {
  coingecko_id: string; symbol: string; display_name?: string;
  quantity: string; purchase_date: string; purchase_price: string;
  total_cost: string; pricing_instrument?: string;
  funding_account_id?: number;
  excluded_from_reports?: boolean;
}
export type CryptoUpdateInput = Partial<CryptoInput>;

export interface CoinSummary { id: string; symbol: string; name: string }
// User report, 2026-08-26: crypto purchase price can be entered in USD, and
// must auto-convert to VND (the app's one storage currency) using a rate
// that "tự động cập nhật" (auto-updates) -- see app/api/fx.py.
export interface FxRate { rate: string; as_of: string; source: string }

export interface BackupItem {
  filename: string;
  size_bytes: number;
  created_at: string;
  formatted_date: string;
  is_db: boolean;
}

export const api = {
  accounts: { list: () => request<Account[]>("/accounts"), balance: (id: number) => request<AccountBalance>(`/accounts/${id}/balance`), create: (input: AccountInput) => request<Account>("/accounts", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: AccountUpdate) => request<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  categories: { list: () => request<Category[]>("/categories"), create: (input: CategoryInput) => request<Category>("/categories", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: CategoryUpdate) => request<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  events: {
    list: () => request<FinancialEvent[]>("/financial-events"),
    create: (input: EventInput) => request<FinancialEvent>("/financial-events", { method: "POST", body: JSON.stringify(input) }),
    update: (id: number, input: EventUpdate) => request<FinancialEvent>(`/financial-events/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: number, force?: boolean) => request<{ id: number; deleted: boolean }>(`/financial-events/${id}${force ? "?force=true" : ""}`, { method: "DELETE" }),
  },
  portfolio: { overview: () => request<PortfolioOverview>("/portfolio/overview") },
  imports: {
    list: () => request<ImportBatch[]>("/import-batches"),
    uploadMoneyLover: async (filename: string, body: ArrayBuffer) => {
      const response = await apiFetch("/imports/money-lover", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(filename) },
        body,
      });
      const data = await response.json().catch(() => null) as (ImportUploadResult & { detail?: string }) | null;
      return { ok: response.ok, status: response.status, data };
    },
    apply: (id: number) => request<ImportApplyResult>(`/imports/${id}/apply`, { method: "POST" }),
  },
  reconciliation: { list: () => request<ReconciliationCandidate[]>("/reconciliation-candidates") },
  assets: {
    savings: {
      list: () => request<SavingsAccount[]>("/assets/savings"),
      get: (id: number) => request<SavingsAccount>(`/assets/savings/${id}`),
      create: (input: SavingsCreateInput) => request<SavingsAccount>("/assets/savings", { method: "POST", body: JSON.stringify(input) }),
      update: (id: number, input: SavingsPatchInput) => request<SavingsAccount>(`/assets/savings/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
      remove: (id: number) => request<{ status: string; deleted_account_id: number }>(`/assets/savings/${id}`, { method: "DELETE" }),
      close: (id: number, input: SavingsCloseInput) => request<SavingsAccount>(`/assets/savings/${id}/close`, { method: "POST", body: JSON.stringify(input) }),
      earlyClose: (id: number, input: SavingsEarlyCloseInput) => request<SavingsAccount>(`/assets/savings/${id}/early-close`, { method: "POST", body: JSON.stringify(input) }),
      renew: (id: number, input: SavingsRenewInput) => request<SavingsAccount>(`/assets/savings/${id}/renew`, { method: "POST", body: JSON.stringify(input) }),
    },
    metalBrands: () => request<string[]>("/assets/metal-brands"),
    metals: {
      list: () => request<MetalHolding[]>("/assets/metals"),
      create: (input: MetalInput) => request<MetalHolding>("/assets/metals", { method: "POST", body: JSON.stringify(input) }),
      update: (id: number, input: MetalUpdateInput) => request<MetalHolding>(`/assets/metals/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
      remove: (id: number) => request<{ id: number; deleted: boolean }>(`/assets/metals/${id}`, { method: "DELETE" }),
      syncPrices: () => request<{ updated_count: number; items: Array<{ id: number; brand: string; product_type: string; instrument: string; valuation_price: string; provider: string; state: string }> }>("/assets/metals/sync-prices", { method: "POST" }),
    },
    crypto: {
      list: () => request<CryptoHolding[]>("/assets/crypto"),
      create: (input: CryptoInput) => request<CryptoHolding>("/assets/crypto", { method: "POST", body: JSON.stringify(input) }),
      update: (id: number, input: CryptoUpdateInput) => request<CryptoHolding>(`/assets/crypto/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
      remove: (id: number) => request<{ id: number; deleted: boolean }>(`/assets/crypto/${id}`, { method: "DELETE" }),
      searchCoins: (q: string) => request<CoinSummary[]>(`/assets/crypto/coins?q=${encodeURIComponent(q)}`),
      syncPrices: () => request<{ updated_count: number; usd_vnd_rate: string; items: Array<{ id: number; symbol: string; display_name: string | null; price_usd: string; price_vnd: string; usd_vnd_rate: string }> }>("/assets/crypto/sync-prices", { method: "POST" }),
    },
  },
  fx: { usdVnd: () => request<FxRate>("/fx/usd-vnd") },
  exports: {
    statementData: (params: { account_id?: number | string; start_date?: string; end_date?: string }) => {
      const q = new URLSearchParams();
      if (params.account_id) q.set("account_id", String(params.account_id));
      if (params.start_date) q.set("start_date", params.start_date);
      if (params.end_date) q.set("end_date", params.end_date);
      return request<StatementData>(`/exports/statement/data${q.toString() ? `?${q.toString()}` : ""}`);
    },
    statementXlsxUrl: (params: { account_id?: number | string; start_date?: string; end_date?: string }) => {
      const q = new URLSearchParams();
      if (params.account_id) q.set("account_id", String(params.account_id));
      if (params.start_date) q.set("start_date", params.start_date);
      if (params.end_date) q.set("end_date", params.end_date);
      return `${API_URL}/api/v1/exports/statement.xlsx${q.toString() ? `?${q.toString()}` : ""}`;
    },
    statementCsvUrl: (params: { account_id?: number | string; start_date?: string; end_date?: string }) => {
      const q = new URLSearchParams();
      if (params.account_id) q.set("account_id", String(params.account_id));
      if (params.start_date) q.set("start_date", params.start_date);
      if (params.end_date) q.set("end_date", params.end_date);
      return `${API_URL}/api/v1/exports/statement.csv${q.toString() ? `?${q.toString()}` : ""}`;
    },
    eventsCsvUrl: (params: { account_id?: number | string; start_date?: string; end_date?: string }) => {
      const q = new URLSearchParams();
      if (params.account_id) q.set("account_id", String(params.account_id));
      if (params.start_date) q.set("start_date", params.start_date);
      if (params.end_date) q.set("end_date", params.end_date);
      return `${API_URL}/api/v1/exports/events.csv${q.toString() ? `?${q.toString()}` : ""}`;
    },
    eventsXlsxUrl: (params: { account_id?: number | string; start_date?: string; end_date?: string }) => {
      const q = new URLSearchParams();
      if (params.account_id) q.set("account_id", String(params.account_id));
      if (params.start_date) q.set("start_date", params.start_date);
      if (params.end_date) q.set("end_date", params.end_date);
      return `${API_URL}/api/v1/exports/events.xlsx${q.toString() ? `?${q.toString()}` : ""}`;
    },
  },
  backup: {
    list: () => request<BackupItem[]>("/backup/list"),
    createProject: () => request<{ status: string; filename: string; size_bytes: number; message: string }>("/backup/create", { method: "POST", body: JSON.stringify({ mode: "project" }) }),
    createDownload: async () => {
      const response = await apiFetch("/backup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "download" }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const disposition = response.headers.get("Content-Disposition");
      let filename = "backup_data.db";
      if (disposition?.includes("filename=")) filename = disposition.split("filename=")[1].replace(/["']/g, "").trim();
      return { blob: await response.blob(), filename };
    },
    restoreProject: (filename: string) => request<{ status: string; message: string }>("/backup/restore/project", { method: "POST", body: JSON.stringify({ filename }) }),
    restoreUpload: async (body: ArrayBuffer) => {
      const response = await apiFetch("/backup/restore/upload", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });
      const data = await response.json().catch(() => ({})) as { detail?: string; message?: string };
      if (!response.ok) throw new Error(data.detail || `Restore failed (HTTP ${response.status})`);
      return data;
    },
    downloadUrl: (filename: string) => `${API_URL}/api/v1/backup/download/${encodeURIComponent(filename)}`,
    remove: (filename: string) => request<{ status: string; message: string }>(`/backup/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  },
};

export interface StatementTransaction {
  id: number;
  entry_id: number;
  account_id: number;
  transaction_date: string;
  effective_date: string;
  event_type: string;
  event_type_label: string;
  description: string;
  ref_no: string;
  amount: string;
  amount_scaled: number;
  running_balance: string;
  running_balance_scaled: number;
}

export interface StatementData {
  account: {
    id: number | null;
    name: string;
    account_type: string;
    account_type_label: string;
    currency: string;
  };
  period: {
    start_date: string | null;
    end_date: string | null;
  };
  opening_balance: string;
  closing_balance: string;
  total_in: string;
  total_out: string;
  transaction_count: number;
  transactions: StatementTransaction[];
}
