import { DemoControls } from "@/components/shell/demo-controls";
import { SignalCheckButton } from "@/components/shell/signal-check-button";

export function Header() {
  return <header className="topbar">
    <div className="workspace">CloudKavach <span className="badge demo">Demo mode</span></div>
    <div className="top-actions">
      <DemoControls />
      <SignalCheckButton />
    </div>
  </header>;
}
