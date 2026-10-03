import type { Metadata, Viewport } from "next";
import "../styles/paytm.css";
import { Lockup, StatusNotch } from "@/components/paytm/ui";
import { Toaster } from "@/components/paytm/toast";
import { DemoDrawer } from "@/components/paytm/demo-drawer";

export const metadata: Metadata = { title: "Paytm for Business · Vyapar AI", description: "An AI sales teammate for Paytm merchants: find nearby buyers, pitch in Hinglish, remember objections, close the loop." };
export const viewport: Viewport = { themeColor: "#002e6e", width: "device-width", initialScale: 1 };

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
    </head>
    <body>
      <div className="stage">
        <aside className="stage-side">
          <div className="lockup-wrap"><Lockup /></div>
          <span className="pill">Vyapar AI</span>
          <h1>Your own AI sales team, inside Paytm for Business</h1>
          <p>Paytm already knows every merchant's location, category and payment volume. Vyapar AI turns that into a B2B network: it finds nearby merchants who need what you sell, pitches them on WhatsApp in Hinglish, remembers every objection and books the sample.</p>
          <ol>
            <li><b>1</b>Tell it what to sell, in Hinglish</li>
            <li><b>2</b>It ranks nearby Paytm merchants</li>
            <li><b>3</b>Sarvam writes and speaks the pitch</li>
            <li><b>4</b>Cognee remembers every objection</li>
            <li><b>5</b>n8n books samples, meetings, payments</li>
          </ol>
        </aside>
        <div className="device">
          <StatusNotch />
          {children}
          <Toaster />
        </div>
      </div>
      <DemoDrawer />
    </body>
  </html>;
}
