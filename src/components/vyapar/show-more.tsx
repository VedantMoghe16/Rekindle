"use client";

import { useState } from "react";

export function ShowMore({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? <>{children}</> : <button className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>{label}</button>;
}
