export type AccountType = "CASH" | "BANK" | "CREDIT_CARD" | "EWALLET";
export type EventType = 
  | "EXPENSE" 
  | "INCOME" 
  | "TRANSFER" 
  | "CREDIT_CARD_PAYMENT" 
  | "INTEREST" 
  | "SAVINGS_DEPOSIT" 
  | "SAVINGS_WITHDRAWAL" 
  | "ASSET_PURCHASE" 
  | "ASSET_SALE" 
  | "ADJUSTMENT";

export interface Account {
  id: number;
  name: string;
  account_type: AccountType;
  currency: string;
  is_active: boolean;
  sort_order: number;
  credit_limit?: string | null;
}

export interface AccountInput {
  name: string;
  account_type: AccountType;
  currency?: string;
  is_active?: boolean;
  sort_order?: number;
  credit_limit?: string | null;
}

export type AccountUpdate = Partial<AccountInput>;

export interface AccountBalance {
  account_id: number;
  balance: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  is_active: boolean;
  icon: string | null;
}

export interface Entry {
  id: number;
  account_id: number;
  amount: string;
}

export interface FinancialEvent {
  id: number;
  event_type: EventType;
  transaction_date: string;
  occurred_at: string | null;
  category_id: number | null;
  payee_text: string | null;
  trip_event_text: string | null;
  note: string | null;
  excluded_from_reports: boolean;
  entries: Entry[];
}

export interface EventInput {
  event_type: EventType;
  transaction_date: string;
  occurred_at?: string | null;
  category_id?: number | null;
  payee_text?: string;
  trip_event_text?: string;
  note?: string;
  excluded_from_reports?: boolean;
  entries: { account_id: number; amount: string }[];
}

export interface QuoteMeta {
  state: "LIVE" | "STALE" | "MANUAL" | "UNAVAILABLE";
  provider: string | null;
  quoted_at: string | null;
  observed_at: string | null;
  valuation_price: string | null;
}

export interface PortfolioRow {
  id: number;
  name: string;
  value: string | null;
  quantity?: string | null;
  quote?: QuoteMeta | null;
  excluded_from_reports?: boolean;
}

export interface PortfolioOverview {
  as_of: string;
  valuation_complete: boolean;
  net_worth: string | null;
  invested_assets: string | null;
  account_count: number;
  accounts: PortfolioRow[];
  savings: PortfolioRow[];
  credit_cards: PortfolioRow[];
  precious_metals: PortfolioRow[];
  crypto: PortfolioRow[];
}

export interface MetalHolding {
  id: number;
  name: string;
  product_type: string;
  brand: string;
  metal_type: string;
  purity: string;
  quantity_grams: string;
  purchase_price: string;
  total_cost: string;
  purchase_date: string | null;
  excluded_from_reports: boolean;
}

export interface SavingsHolding {
  id: number;
  name: string;
  bank_name?: string;
  principal: string;
  status: string;
  excluded_from_reports?: boolean;
}

export interface CryptoHolding {
  id: number;
  coingecko_id: string;
  symbol: string;
  display_name: string | null;
  quantity: string;
  purchase_price: string;
  total_cost: string;
  purchase_date: string | null;
  excluded_from_reports: boolean;
}

export interface MetalInput {
  metal_type?: string;
  brand: string;
  product_type: string;
  purity?: string;
  quantity_grams: string;
  purchase_price?: string;
  total_cost: string;
  purchase_date?: string | null;
  funding_account_id?: number | null;
  excluded_from_reports?: boolean;
}

export type MetalUpdate = Partial<MetalInput>;

export interface CryptoInput {
  symbol: string;
  display_name?: string;
  quantity: string;
  purchase_price?: string;
  total_cost: string;
  purchase_date?: string | null;
  funding_account_id?: number | null;
  excluded_from_reports?: boolean;
}

export type CryptoUpdate = Partial<CryptoInput>;

export interface SavingsAccountInput {
  name: string;
  bank_name?: string;
  principal: string;
  annual_rate?: string;
  start_date?: string;
  maturity_date?: string;
  funding_account_id?: number | null;
  excluded_from_reports?: boolean;
}

export interface CategoryInput {
  name: string;
  parent_id?: number | null;
  icon?: string | null;
  is_active?: boolean;
}

export type CategoryUpdate = Partial<CategoryInput>;

export type EventUpdate = Partial<EventInput>;

export interface User {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface UserAdminInput {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
  is_admin?: boolean;
}

export interface UserUpdateInput {
  display_name?: string;
  email?: string;
  is_active?: boolean;
  new_password?: string;
}
