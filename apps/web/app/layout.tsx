import "./styles.css";
import { QueryProvider } from "./query-provider";
import ServiceWorker from "./service-worker";

export const viewport = { themeColor: "#0b6b4f" };

export const metadata = {
  title: "Personal Finance",
  description: "Local-first personal finance ledger",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><QueryProvider>{children}</QueryProvider><ServiceWorker /></body></html>;
}
