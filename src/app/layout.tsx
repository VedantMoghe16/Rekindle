import type { Metadata } from "next";
import "./globals.css";
import "./styles/leads.css";
import "./styles/pipeline.css";
import "./styles/marketing.css";
import "./styles/shell.css";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { Toasts } from "@/components/shell/toasts";

export const metadata: Metadata = { title: "Rekindle", description: "Know when not now becomes now." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="app"><Sidebar /><main className="main"><Header />{children}</main></div><Toasts /></body></html>;
}
