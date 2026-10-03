"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

type Source = "sarvam" | "device" | null;

/** Plays a Hinglish voice note: Sarvam Bulbul when configured, otherwise the device's hi-IN voice (labelled). */
export function useSpeak() {
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<Source>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audio.current?.pause(); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  async function play(text: string) {
    if (playing) return stop();
    setPlaying(true);
    try {
      const res = await fetch("/api/vyapar/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (res.ok && res.headers.get("content-type")?.includes("audio")) {
        const url = URL.createObjectURL(await res.blob());
        const a = new Audio(url);
        audio.current = a;
        a.onended = () => setPlaying(false);
        setSource("sarvam");
        await a.play();
        return;
      }
    } catch { /* fall through to device voice */ }
    const synth = window.speechSynthesis;
    if (!synth) return setPlaying(false);
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ""));
    u.lang = "hi-IN";
    u.rate = 0.98;
    const voice = synth.getVoices().find((v) => v.lang === "hi-IN") ?? synth.getVoices().find((v) => v.lang.startsWith("en-IN"));
    if (voice) u.voice = voice;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    setSource("device");
    synth.speak(u);
  }
  function stop() {
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    setPlaying(false);
  }
  return { play, stop, playing, source };
}

const BARS = Array.from({ length: 30 }, (_, i) => 22 + Math.abs(Math.sin(i * 1.7)) * 78);

export function VoiceNote({ text, compact }: { text: string; compact?: boolean }) {
  const { play, playing, source } = useSpeak();
  const seconds = Math.max(6, Math.round(text.split(/\s+/).length / 2.6));
  return <div className="voice">
    <button className="play" onClick={() => play(text)} aria-label={playing ? "Pause voice note" : "Play voice note"}>{playing ? <Pause /> : <Play fill="#fff" />}</button>
    <div className={`wave${playing ? " playing" : ""}`}>{BARS.slice(0, compact ? 24 : 30).map((h, i) => <i key={i} style={{ height: `${h}%`, animationDelay: `${(i % 7) * 0.08}s` }} />)}</div>
    <small>0:{String(seconds).padStart(2, "0")}{!compact && ` · ${source === "device" ? "Device voice" : "Sarvam Bulbul"}`}</small>
  </div>;
}
