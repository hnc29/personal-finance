import "./styles.css";
import { QueryProvider } from "./query-provider";
import ServiceWorker from "./service-worker";

export const viewport = { themeColor: "#22614a" };

export const metadata = {
  title: "Personal Finance",
  description: "Local-first personal finance ledger",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><QueryProvider>{children}</QueryProvider><ServiceWorker /></body></html>;
}
