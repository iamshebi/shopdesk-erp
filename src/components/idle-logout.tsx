"use client";
import { useEffect, useRef, useState } from "react";
import { idleLogout } from "@/app/auth-actions";

/** Signs the user out after `minutes` without mouse, keyboard or touch activity. Warns one minute before. */
export default function IdleLogout({ minutes }: { minutes: number }) {
  const last = useRef(Date.now());
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!minutes) return;
    const bump = () => { last.current = Date.now(); setLeft(null); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      const remaining = minutes * 60 - Math.floor((Date.now() - last.current) / 1000);
      if (remaining <= 0) { clearInterval(timer); idleLogout(); }
      else setLeft(remaining <= 60 ? remaining : null);
    }, 1000);
    return () => { clearInterval(timer); events.forEach((e) => window.removeEventListener(e, bump)); };
  }, [minutes]);
  if (left === null) return null;
  return (
    <div className="no-print fixed bottom-4 right-4 z-50 card max-w-xs p-4 text-sm shadow-lg fade-in">
      <div className="font-medium">Still there?</div>
      <div className="mt-1 text-slate-500">You&apos;ll be signed out in {left} seconds. Move the mouse or press a key to stay signed in.</div>
    </div>
  );
}
