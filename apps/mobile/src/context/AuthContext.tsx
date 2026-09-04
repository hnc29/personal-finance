import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { User, AuthResponse } from "../types";
import { api, setAuthToken } from "../api/client";

const AUTH_TOKEN_KEY = "@pf_auth_token";
const AUTH_USER_KEY = "@pf_auth_user";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthResponse>;
  register: (username: string, password: string, displayName?: string, email?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        const storedUser = await AsyncStorage.getItem(AUTH_USER_KEY);

        if (storedToken) {
          setAuthToken(storedToken);
          setToken(storedToken);

          if (storedUser) {
            setUser(JSON.parse(storedUser));
          }

          // Verify token validity with server
          try {
            const me = await api.getMe();
            setUser(me);
            await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(me));
          } catch {
            // Token might be expired or server unreachable; if expired clear token
            // but keep local offline user if available
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
    const res = await api.login(username, password);
    setAuthToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, res.access_token);
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
    return res;
  };

  const register = async (
    username: string,
    password: string,
    displayName?: string,
    email?: string,
  ): Promise<AuthResponse> => {
    const res = await api.register(username, password, displayName, email);
    setAuthToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, res.access_token);
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
    return res;
  };

  const logout = async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(AUTH_USER_KEY);
  };

  const refreshUser = async () => {
    try {
      const me = await api.getMe();
      setUser(me);
      await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(me));
    } catch (err) {
      console.error("Failed to refresh user", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
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
