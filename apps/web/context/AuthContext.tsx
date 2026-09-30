"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User, AuthResponse, api, setWebAuthToken } from "../lib/api";

const AUTH_TOKEN_KEY = "pf_auth_token";
const AUTH_USER_KEY = "pf_auth_user";
const AUTH_ADMIN_BACKUP_KEY = "pf_admin_backup_token";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isImpersonating: boolean;
  login: (username: string, password: string) => Promise<AuthResponse>;
  register: (username: string, password: string, displayName?: string, email?: string) => Promise<AuthResponse>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  viewAsUser: (userId: number) => Promise<void>;
  exitViewAs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isImpersonating = Boolean(
    user?.impersonated_by_username || (typeof window !== "undefined" && localStorage.getItem(AUTH_ADMIN_BACKUP_KEY))
  );

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
        const storedUser = localStorage.getItem(AUTH_USER_KEY);

        if (storedToken) {
          setWebAuthToken(storedToken);
          setToken(storedToken);

          if (storedUser) {
            setUser(JSON.parse(storedUser));
          }

          try {
            const me = await api.auth.getMe();
            setUser(me);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(me));
          } catch {
            // If token expired, clear session
            setWebAuthToken(null);
            setToken(null);
            setUser(null);
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
            localStorage.removeItem(AUTH_ADMIN_BACKUP_KEY);
          }
        }
      } catch (err) {
        console.error("Failed to load auth session", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  const login = async (username: string, password: string): Promise<AuthResponse> => {
    const res = await api.auth.login(username, password);
    setWebAuthToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    localStorage.setItem(AUTH_TOKEN_KEY, res.access_token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
    localStorage.removeItem(AUTH_ADMIN_BACKUP_KEY);
    return res;
  };

  const register = async (
    username: string,
    password: string,
    displayName?: string,
    email?: string,
  ): Promise<AuthResponse> => {
    const res = await api.auth.register(username, password, displayName, email);
    setWebAuthToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    localStorage.setItem(AUTH_TOKEN_KEY, res.access_token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
    localStorage.removeItem(AUTH_ADMIN_BACKUP_KEY);
    return res;
  };

  const logout = () => {
    setWebAuthToken(null);
    setToken(null);
    setUser(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_ADMIN_BACKUP_KEY);
    window.location.href = "/login";
  };

  const refreshUser = async () => {
    try {
      const me = await api.auth.getMe();
      setUser(me);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(me));
    } catch (err) {
      console.error("Failed to refresh user", err);
    }
  };

  const viewAsUser = async (userId: number) => {
    if (!token) return;
    // Save current admin token if not already impersonating
    if (!localStorage.getItem(AUTH_ADMIN_BACKUP_KEY)) {
      localStorage.setItem(AUTH_ADMIN_BACKUP_KEY, token);
    }
    const res = await api.users.viewAs(userId);
    setWebAuthToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    localStorage.setItem(AUTH_TOKEN_KEY, res.access_token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
  };

  const exitViewAs = async () => {
    const adminToken = localStorage.getItem(AUTH_ADMIN_BACKUP_KEY);
    if (adminToken) {
      setWebAuthToken(adminToken);
      setToken(adminToken);
      localStorage.setItem(AUTH_TOKEN_KEY, adminToken);
      localStorage.removeItem(AUTH_ADMIN_BACKUP_KEY);
      try {
        const me = await api.auth.getMe();
        setUser(me);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(me));
      } catch (err) {
        console.error("Failed to restore admin user", err);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isImpersonating,
        login,
        register,
        logout,
        refreshUser,
        viewAsUser,
        exitViewAs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
