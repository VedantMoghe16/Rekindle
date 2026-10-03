import { Play, SlidersHorizontal } from "lucide-react";

export function Header() {
  return <header className="topbar">
    <div className="workspace">CloudKavach <span className="badge demo">Demo mode</span></div>
    <div className="top-actions">
      <button className="button"><SlidersHorizontal /> Demo controls</button>
      <button className="button primary"><Play /> Run signal check</button>
    </div>
  </header>;
}
