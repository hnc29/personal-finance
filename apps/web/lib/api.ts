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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
export const api = {
  accounts: { list: () => request<Account[]>("/accounts"), create: (input: AccountInput) => request<Account>("/accounts", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: AccountUpdate) => request<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  categories: { list: () => request<Category[]>("/categories"), create: (input: CategoryInput) => request<Category>("/categories", { method: "POST", body: JSON.stringify(input) }), update: (id: number, input: CategoryUpdate) => request<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }) },
  events: { list: () => request<FinancialEvent[]>("/financial-events"), create: (input: EventInput) => request<FinancialEvent>("/financial-events", { method: "POST", body: JSON.stringify(input) }) },
};
