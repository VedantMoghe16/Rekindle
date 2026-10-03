import type { Metadata, Viewport } from "next";
import "../styles/paytm.css";
import { Lockup, StatusNotch } from "@/components/paytm/ui";
import { Toaster } from "@/components/paytm/toast";
import { Translator } from "@/components/paytm/translator";

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
          <p>Paytm merchants buy from and sell to each other every day. Vyapar AI makes that easy both ways: sellers find nearby buyers, and buyers post a need and get up to 3 offers that can actually deliver.</p>
          <ol>
            <li><b>1</b>Sell: find nearby buyers, with reasons</li>
            <li><b>2</b>Buy: post a need, compare 3 real offers</li>
            <li><b>3</b>Gemini + Sarvam write, speak, call and translate in 22 Indian languages</li>
            <li><b>4</b>Cognee remembers every vendor, buyer and objection</li>
          </ol>
        </aside>
        <div className="device">
          <StatusNotch />
          {children}
          <Toaster />
          <Translator />
        </div>
      </div>
    </body>
  </html>;
}
