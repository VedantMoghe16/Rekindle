"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/** Animated agent steps on a fresh hunt; static (all done) when revisiting. */
export function PlanSteps({ steps, animate }: { steps: string[]; animate: boolean }) {
  const [done, setDone] = useState(animate ? 0 : steps.length);
  useEffect(() => {
    if (!animate) return;
    const timers = steps.map((_, i) => setTimeout(() => setDone(i + 1), 550 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [animate, steps]);
  return <div className="steps">{steps.map((s, i) => <div key={s} className={`step${i < done ? " done" : i === done ? " run" : ""}`}><span className="st">{i < done && <Check />}</span>{s}</div>)}</div>;
}

export function RevealAfterSteps({ count, animate, children }: { count: number; animate: boolean; children: React.ReactNode }) {
  const [show, setShow] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setShow(true), 550 * count + 250);
    return () => clearTimeout(t);
  }, [animate, count]);
  return show ? <div className="rise" style={{ display: "contents" }}>{children}</div> : null;
}
