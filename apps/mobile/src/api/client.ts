import { getApiBaseUrl } from "./config";
import {
  Account,
  AccountBalance,
  AccountInput,
  AccountUpdate,
  Category,
  CategoryInput,
  CategoryUpdate,
  FinancialEvent,
  EventInput,
  PortfolioOverview,
  MetalHolding,
  SavingsHolding,
  CryptoHolding,
  User,
  AuthResponse,
  UserAdminInput,
  UserUpdateInput,
} from "../types";

let currentAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentAuthToken = token;
}

export function getAuthToken(): string | null {
  return currentAuthToken;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (currentAuthToken) {
    headers["Authorization"] = `Bearer ${currentAuthToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Request failed (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Authentication & Users
  login: async (username: string, password: string): Promise<AuthResponse> => {
    return request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  register: async (
    username: string,
    password: string,
    displayName?: string,
    email?: string,
  ): Promise<AuthResponse> => {
    return request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        display_name: displayName,
        email,
      }),
    });
  },

  getMe: async (): Promise<User> => {
    return request<User>("/api/v1/auth/me");
  },

  changePassword: async (oldPassword: string, newPassword: string): Promise<{ message: string }> => {
    return request<{ message: string }>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
  },

  listUsers: async (): Promise<User[]> => {
    return request<User[]>("/api/v1/users");
  },

  createUser: async (data: UserAdminInput): Promise<User> => {
    return request<User>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateUser: async (id: number, data: UserUpdateInput): Promise<User> => {
    return request<User>(`/api/v1/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  deleteUser: async (id: number): Promise<void> => {
    await request<void>(`/api/v1/users/${id}`, {
      method: "DELETE",
    });
  },

  // Health
  checkHealth: async (): Promise<{ status: string; app?: string; db?: string }> => {
    return request<{ status: string; app?: string; db?: string }>("/api/v1/health");
  },

  // Accounts
  getAccounts: async (): Promise<Account[]> => {
    return request<Account[]>("/api/v1/accounts");
  },

  getAccountBalance: async (id: number): Promise<AccountBalance> => {
    return request<AccountBalance>(`/api/v1/accounts/${id}/balance`);
  },

  createAccount: async (input: AccountInput): Promise<Account> => {
    return request<Account>("/api/v1/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateAccount: async (id: number, input: AccountUpdate): Promise<Account> => {
    return request<Account>(`/api/v1/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  // Categories
  getCategories: async (): Promise<Category[]> => {
    return request<Category[]>("/api/v1/categories");
  },

  createCategory: async (input: CategoryInput): Promise<Category> => {
    return request<Category>("/api/v1/categories", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateCategory: async (id: number, data: CategoryUpdate): Promise<Category> => {
    return request<Category>(`/api/v1/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Events / Transactions
  getEvents: async (limit?: number, offset?: number): Promise<FinancialEvent[]> => {
    const params = new URLSearchParams();
    if (limit !== undefined) params.append("limit", limit.toString());
    if (offset !== undefined) params.append("offset", offset.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<FinancialEvent[]>(`/api/v1/financial-events${query}`);
  },

  createEvent: async (input: EventInput): Promise<FinancialEvent> => {
    return request<FinancialEvent>("/api/v1/financial-events", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateEvent: async (id: number, input: Partial<EventInput>): Promise<FinancialEvent> => {
    return request<FinancialEvent>(`/api/v1/financial-events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteEvent: async (id: number): Promise<void> => {
    await request<void>(`/api/v1/financial-events/${id}`, {
      method: "DELETE",
    });
  },

  // Portfolio
  getPortfolioOverview: async (): Promise<PortfolioOverview> => {
    return request<PortfolioOverview>("/api/v1/read-models/portfolio-overview");
  },

  // Assets
  getMetals: async (): Promise<MetalHolding[]> => {
    return request<MetalHolding[]>("/api/v1/assets/metals");
  },

  createMetal: async (data: import("../types").MetalInput): Promise<MetalHolding> => {
    return request<MetalHolding>("/api/v1/assets/metals", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateMetal: async (id: number, data: import("../types").MetalUpdate): Promise<MetalHolding> => {
    return request<MetalHolding>(`/api/v1/assets/metals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  deleteMetal: async (id: number): Promise<{ id: number; deleted: boolean }> => {
    return request<{ id: number; deleted: boolean }>(`/api/v1/assets/metals/${id}`, {
      method: "DELETE",
    });
  },

  getSavings: async (): Promise<SavingsHolding[]> => {
    return request<SavingsHolding[]>("/api/v1/assets/savings");
  },

  createSavings: async (data: import("../types").SavingsAccountInput): Promise<SavingsHolding> => {
    return request<SavingsHolding>("/api/v1/savings/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  closeSavings: async (id: number, data: { closed_date: string; receiving_account_id?: number; actual_interest?: string }): Promise<any> => {
    return request<any>(`/api/v1/savings/accounts/${id}/close`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  earlyCloseSavings: async (id: number, data: { closed_date: string; receiving_account_id?: number; penalty_fee?: string }): Promise<any> => {
    return request<any>(`/api/v1/savings/accounts/${id}/early-close`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getCrypto: async (): Promise<CryptoHolding[]> => {
    return request<CryptoHolding[]>("/api/v1/assets/crypto");
  },

  createCrypto: async (data: import("../types").CryptoInput): Promise<CryptoHolding> => {
    return request<CryptoHolding>("/api/v1/assets/crypto", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateCrypto: async (id: number, data: import("../types").CryptoUpdate): Promise<CryptoHolding> => {
    return request<CryptoHolding>(`/api/v1/assets/crypto/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  deleteCrypto: async (id: number): Promise<{ id: number; deleted: boolean }> => {
    return request<{ id: number; deleted: boolean }>(`/api/v1/assets/crypto/${id}`, {
      method: "DELETE",
    });
  },

  syncMetalPrices: async (): Promise<{ updated_count: number }> => {
    return request<{ updated_count: number }>("/api/v1/assets/metals/sync-prices", {
      method: "POST",
    });
  },

  syncCryptoPrices: async (): Promise<{ updated_count: number; usd_vnd_rate?: string }> => {
    return request<{ updated_count: number; usd_vnd_rate?: string }>("/api/v1/assets/crypto/sync-prices", {
      method: "POST",
    });
  },
};
