import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";

export const metadata: Metadata = { title: "Rekindle", description: "Know when not now becomes now." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="app"><Sidebar /><main className="main"><Header />{children}</main></div></body></html>;
}
