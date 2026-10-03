"use client";

import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";

const EVENT = "paytm:toast";

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const id = Date.now() + Math.random();
      setItems((list) => [...list.slice(-2), { id, message: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 2600);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  return <div className="toast-host" role="status" aria-live="polite">{items.map((i) => <div className="toast" key={i.id}><CircleCheck />{i.message}</div>)}</div>;
}
