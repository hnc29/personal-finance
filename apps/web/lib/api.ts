const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export type AccountType = "CASH" | "BANK" | "CREDIT_CARD" | "EWALLET";
export type EventType = "EXPENSE" | "INCOME" | "TRANSFER" | "CREDIT_CARD_PAYMENT" | "INTEREST" | "SAVINGS_DEPOSIT" | "SAVINGS_WITHDRAWAL" | "ASSET_PURCHASE" | "ASSET_SALE" | "ADJUSTMENT";
export interface Account { id: number; name: string; account_type: AccountType; currency: string; is_active: boolean }
export interface Category { id: number; name: string; parent_id: number | null; is_active: boolean }
export interface Entry { id: number; account_id: number; amount: string }
export interface FinancialEvent { id: number; event_type: EventType; transaction_date: string; occurred_at: string | null; category_id: number | null; payee_text: string | null; trip_event_text: string | null; note: string | null; entries: Entry[] }
export interface AccountInput { name: string; account_type: AccountType; currency?: string; is_active?: boolean }
export interface CategoryInput { name: string; parent_id?: number | null; is_active?: boolean }
export type AccountUpdate = Partial<AccountInput>;
export type CategoryUpdate = Partial<CategoryInput>;
export interface EventInput { event_type: EventType; transaction_date: string; occurred_at?: string | null; category_id?: number | null; payee_text?: string; trip_event_text?: string; note?: string; entries: { account_id: number; amount: string }[] }
export interface QuoteMeta { state: "LIVE" | "STALE" | "MANUAL" | "UNAVAILABLE"; provider: string | null; quoted_at: string | null }
export interface PortfolioRow { id: number; name: string; value: string | null; quantity?: string | null; quote?: QuoteMeta | null }
export interface PortfolioOverview { as_of: string; net_worth: string; invested_assets: string; account_count: number; accounts: PortfolioRow[]; savings: PortfolioRow[]; credit_cards: PortfolioRow[]; precious_metals: PortfolioRow[]; crypto: PortfolioRow[] }
export interface ImportBatch { id: number; source: string; original_filename: string; imported_at: string; row_count: number }
export interface ReconciliationCandidate { id: number; state: string; raw_row_id: number; source_row_number: number; source_row_id: string | null; financial_event_id: number; transaction_date: string; event_type: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
export const api = {
  accounts: { list: () => request<Account[]>("/accounts"), create: (input: AccountInput) => request<Account>("/accounts", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: AccountUpdate) => request<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  categories: { list: () => request<Category[]>("/categories"), create: (input: CategoryInput) => request<Category>("/categories", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: CategoryUpdate) => request<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  events: { list: () => request<FinancialEvent[]>("/financial-events"), create: (input: EventInput) => request<FinancialEvent>("/financial-events", { method: "POST", body: JSON.stringify(input) }) },
  portfolio: { overview: () => request<PortfolioOverview>("/portfolio/overview") },
  imports: { list: () => request<ImportBatch[]>("/import-batches") },
  reconciliation: { list: () => request<ReconciliationCandidate[]>("/reconciliation-candidates") },
};
