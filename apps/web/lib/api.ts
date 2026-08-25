const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
export type AccountType = "CASH" | "BANK" | "CREDIT_CARD" | "EWALLET";
export type EventType = "EXPENSE" | "INCOME" | "TRANSFER" | "CREDIT_CARD_PAYMENT" | "INTEREST" | "SAVINGS_DEPOSIT" | "SAVINGS_WITHDRAWAL" | "ASSET_PURCHASE" | "ASSET_SALE" | "ADJUSTMENT";
export interface Account { id: number; name: string; account_type: AccountType; currency: string; is_active: boolean; sort_order: number }
export interface AccountBalance { account_id: number; balance: string }
export interface Category { id: number; name: string; parent_id: number | null; is_active: boolean; icon: string | null }
export interface Entry { id: number; account_id: number; amount: string }
export interface FinancialEvent { id: number; event_type: EventType; transaction_date: string; occurred_at: string | null; category_id: number | null; payee_text: string | null; trip_event_text: string | null; note: string | null; entries: Entry[] }
export interface AccountInput { name: string; account_type: AccountType; currency?: string; is_active?: boolean; sort_order?: number }
export interface CategoryInput { name: string; parent_id?: number | null; is_active?: boolean; icon?: string | null }
export type AccountUpdate = Partial<AccountInput>;
export type CategoryUpdate = Partial<CategoryInput>;
export interface EventInput { event_type: EventType; transaction_date: string; occurred_at?: string | null; category_id?: number | null; payee_text?: string; trip_event_text?: string; note?: string; entries: { account_id: number; amount: string }[] }
export interface QuoteMeta { state: "LIVE" | "STALE" | "MANUAL" | "UNAVAILABLE"; provider: string | null; quoted_at: string | null; observed_at: string | null; valuation_price: string | null }
export interface PortfolioRow { id: number; name: string; value: string | null; quantity?: string | null; quote?: QuoteMeta | null }
export interface PortfolioOverview { as_of: string; valuation_complete: boolean; net_worth: string | null; invested_assets: string | null; account_count: number; accounts: PortfolioRow[]; savings: PortfolioRow[]; credit_cards: PortfolioRow[]; precious_metals: PortfolioRow[]; crypto: PortfolioRow[] }
export interface ImportBatch { id: number; source: string; original_filename: string; imported_at: string; row_count: number }
export interface ReconciliationCandidate { id: number; state: string; raw_row_id: number; source_row_number: number; source_row_id: string | null; financial_event_id: number; transaction_date: string; event_type: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
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
  funding_account_id: number | null; notes: string | null; editable: boolean;
  current_term: SavingsTerm | null; terms?: SavingsTerm[];
}
export interface SavingsCreateInput {
  institution: string; product_name?: string; name: string; principal: string;
  funding_account_id: number; opened_date: string; term_months: number;
  annual_rate: string; non_term_rate?: string; day_count_convention?: SavingsDayCount;
  interest_payment_method?: SavingsInterestPayment; maturity_action?: SavingsMaturityAction; notes?: string | null;
}
export type SavingsPatchInput = Partial<Omit<SavingsCreateInput, "funding_account_id">>;
export interface SavingsCloseInput { closed_date: string; receiving_account_id: number; actual_interest: string }
export interface SavingsEarlyCloseInput extends SavingsCloseInput { fee?: string }
export interface SavingsRenewInput { start_date: string; actual_interest?: string; receiving_account_id?: number }
export interface MetalInput { metal_type: "GOLD" | "SILVER"; brand: string; product_type: string; purity: string; quantity_grams: string; purchase_date: string; purchase_price: string; total_cost: string; pricing_instrument?: string }
export interface CryptoInput { coingecko_id: string; symbol: string; display_name?: string; quantity: string; purchase_date: string; purchase_price: string; total_cost: string; pricing_instrument?: string }
export interface CoinSummary { id: string; symbol: string; name: string }
export const api = {
  accounts: { list: () => request<Account[]>("/accounts"), balance: (id: number) => request<AccountBalance>(`/accounts/${id}/balance`), create: (input: AccountInput) => request<Account>("/accounts", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: AccountUpdate) => request<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  categories: { list: () => request<Category[]>("/categories"), create: (input: CategoryInput) => request<Category>("/categories", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: CategoryUpdate) => request<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  events: { list: () => request<FinancialEvent[]>("/financial-events"), create: (input: EventInput) => request<FinancialEvent>("/financial-events", { method: "POST", body: JSON.stringify(input) }) },
  portfolio: { overview: () => request<PortfolioOverview>("/portfolio/overview") },
  imports: { list: () => request<ImportBatch[]>("/import-batches") },
  reconciliation: { list: () => request<ReconciliationCandidate[]>("/reconciliation-candidates") },
  assets: {
    savings: {
      list: () => request<SavingsAccount[]>("/assets/savings"),
      get: (id: number) => request<SavingsAccount>(`/assets/savings/${id}`),
      create: (input: SavingsCreateInput) => request<SavingsAccount>("/assets/savings", { method: "POST", body: JSON.stringify(input) }),
      update: (id: number, input: SavingsPatchInput) => request<SavingsAccount>(`/assets/savings/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
      close: (id: number, input: SavingsCloseInput) => request<SavingsAccount>(`/assets/savings/${id}/close`, { method: "POST", body: JSON.stringify(input) }),
      earlyClose: (id: number, input: SavingsEarlyCloseInput) => request<SavingsAccount>(`/assets/savings/${id}/early-close`, { method: "POST", body: JSON.stringify(input) }),
      renew: (id: number, input: SavingsRenewInput) => request<SavingsAccount>(`/assets/savings/${id}/renew`, { method: "POST", body: JSON.stringify(input) }),
    },
    metalBrands: () => request<string[]>("/assets/metal-brands"),
    metals: { list: () => request<unknown[]>("/assets/metals"), create: (input: MetalInput) => request<unknown>("/assets/metals", { method: "POST", body: JSON.stringify(input) }) },
    crypto: { list: () => request<unknown[]>("/assets/crypto"), create: (input: CryptoInput) => request<unknown>("/assets/crypto", { method: "POST", body: JSON.stringify(input) }), searchCoins: (q: string) => request<CoinSummary[]>(`/assets/crypto/coins?q=${encodeURIComponent(q)}`) },
  },
};
