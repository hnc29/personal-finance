"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "../context/AuthContext";
import { ImpersonationBanner } from "../components/ImpersonationBanner";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ImpersonationBanner />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
