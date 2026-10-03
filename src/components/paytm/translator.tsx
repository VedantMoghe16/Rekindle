"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Languages, LoaderCircle, X } from "lucide-react";
import { LANGUAGES } from "@/lib/vyapar/languages";

/**
 * App-wide language switch. The UI is written in English; when the merchant picks another language, every visible
 * string is translated by Sarvam (cached server-side and in this browser) and swapped in place. Re-renders are
 * picked up by a MutationObserver. Anything inside [data-no-translate] (call transcripts, inputs) is left as is.
 */
const STORE = "vyapar-lang";
const EVENT = "vyapar-lang";
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "SVG"]);
const ATTRS = ["placeholder", "aria-label", "title"] as const;

function readLang() {
  try { return localStorage.getItem(STORE) ?? "en-IN"; } catch { return "en-IN"; }
}
export function setLanguage(code: string) {
  try { localStorage.setItem(STORE, code); } catch { /* per-session only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: code }));
}
export function useLanguage() {
  const [lang, setLang] = useState("en-IN");
  useEffect(() => {
    setLang(readLang());
    const on = (e: Event) => setLang((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return lang;
}

const worth = (s: string) => s.trim().length > 1 && /[A-Za-z]{2}/.test(s);

export function Translator() {
  const lang = useLanguage();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const texts = new WeakMap<Text, { orig: string; shown: string }>();
    const attrs = new WeakMap<Element, Record<string, { orig: string; shown: string }>>();
    const memo = new Map<string, string>();
    try { Object.entries(JSON.parse(localStorage.getItem(`${STORE}:${lang}`) ?? "{}") as Record<string, string>).forEach(([k, v]) => memo.set(k, v)); } catch { /* empty cache */ }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const english = lang === "en-IN";

    const skipped = (el: Element | null) => !el || Boolean(el.closest("[data-no-translate]")) || SKIP.has(el.tagName.toUpperCase());

    async function pass() {
      if (stopped) return;
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n as Text;
        if (skipped(t.parentElement)) continue;
        const rec = texts.get(t);
        // React changed the text since we translated it: the new value is the new original.
        if (!rec || t.nodeValue !== rec.shown) texts.set(t, { orig: t.nodeValue ?? "", shown: t.nodeValue ?? "" });
        textNodes.push(t);
      }
      const attrEls = Array.from(document.body.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(","))).filter((el) => !el.closest("[data-no-translate]"));
      for (const el of attrEls) {
        const rec = attrs.get(el) ?? {};
        for (const a of ATTRS) {
          const v = el.getAttribute(a);
          if (v != null && (!rec[a] || v !== rec[a].shown)) rec[a] = { orig: v, shown: v };
        }
        attrs.set(el, rec);
      }
      if (english) {
        for (const t of textNodes) { const r = texts.get(t)!; if (t.nodeValue !== r.orig) { t.nodeValue = r.orig; r.shown = r.orig; } }
        for (const el of attrEls) for (const [a, r] of Object.entries(attrs.get(el) ?? {})) if (el.getAttribute(a) !== r.orig) { el.setAttribute(a, r.orig); r.shown = r.orig; }
        return;
      }
      const wanted = new Set<string>();
      for (const t of textNodes) { const o = texts.get(t)!.orig.trim(); if (worth(o) && !memo.has(o)) wanted.add(o); }
      for (const el of attrEls) for (const r of Object.values(attrs.get(el) ?? {})) { const o = r.orig.trim(); if (worth(o) && !memo.has(o)) wanted.add(o); }
      if (wanted.size) {
        setBusy(true);
        const list = [...wanted];
        for (let i = 0; i < list.length && !stopped; i += 150) {
          const chunk = list.slice(i, i + 150);
          const res = await fetch("/api/vyapar/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: lang, texts: chunk }) }).then((r) => r.json()).catch(() => null);
          if (!res?.ok) break;
          chunk.forEach((s, j) => { if (res.data.translations[j] !== s || !res.data.failed) memo.set(s, res.data.translations[j]); });
        }
        try { localStorage.setItem(`${STORE}:${lang}`, JSON.stringify(Object.fromEntries(memo))); } catch { /* quota */ }
        setBusy(false);
        if (stopped) return;
      }
      const apply = (orig: string) => {
        const core = orig.trim();
        const tr = memo.get(core);
        return tr ? orig.replace(core, tr) : orig;
      };
      for (const t of textNodes) {
        const r = texts.get(t)!;
        if (!t.isConnected) continue;
        const next = apply(r.orig);
        if (t.nodeValue !== next) { t.nodeValue = next; r.shown = next; }
      }
      for (const el of attrEls) for (const [a, r] of Object.entries(attrs.get(el) ?? {})) {
        const next = apply(r.orig);
        if (el.getAttribute(a) !== next) { el.setAttribute(a, next); r.shown = next; }
      }
    }

    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(pass, 120); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    document.documentElement.lang = lang.split("-")[0];
    pass();
    return () => { stopped = true; observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [lang]);

  return busy ? <div className="translating" data-no-translate><LoaderCircle className="spin" size={14} />Translating with Sarvam…</div> : null;
}

/** Globe button for app bars: opens the language sheet. */
export function LanguageButton() {
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === lang);
  return <>
    <button className="icon-btn lang-btn" onClick={() => setOpen(true)} aria-label="App language" data-no-translate>
      <Languages />{lang !== "en-IN" && <span>{current?.native.slice(0, 2)}</span>}
    </button>
    {open && createPortal(<div className="sheet-backdrop" onClick={() => setOpen(false)} data-no-translate>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose app language">
        <div className="row"><b className="grow">App language</b><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button></div>
        <p className="xs muted">The whole app switches to this language, translated by Sarvam. Call transcripts stay as spoken.</p>
        <div className="lang-grid">{LANGUAGES.map((l) => <button key={l.code} className={l.code === lang ? "on" : ""} onClick={() => { setLanguage(l.code); setOpen(false); }}>
          <b>{l.native}</b><small>{l.name}</small>{l.code === lang && <Check size={14} />}
        </button>)}</div>
      </div>
    </div>, document.querySelector(".device") ?? document.body)}
  </>;
}
