import "./styles.css";
import { QueryProvider } from "./query-provider";

export const metadata = { title: "Personal Finance", description: "Local-first personal finance ledger" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><QueryProvider>{children}</QueryProvider></body></html>;
}
