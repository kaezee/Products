import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons";

// A lightweight, non-blocking toast (snackbar) for action confirmations —
// "Note saved", "Note deleted". Best-practice shape: transient (auto-dismisses),
// bottom-centred, never traps focus, announced politely to screen readers, and
// capped so a burst can't wall off the screen. Call toast(...) from anywhere; a
// single <ToastHost/> at the app root renders them.

type Tone = "success" | "info";
export interface ToastItem { id: number; message: string; tone: Tone }

let emit: ((t: ToastItem) => void) | null = null;
let seq = 0;

export function toast(message: string, tone: Tone = "success") {
  if (emit) emit({ id: ++seq, message, tone });
}

const ICON: Record<Tone, IconName> = { success: "done", info: "asterisk" };
const LIFETIME = 3200;

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    emit = (t) => {
      setItems((prev) => [...prev, t].slice(-3)); // keep at most three on screen
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), LIFETIME);
    };
    return () => { emit = null; };
  }, []);

  if (!items.length) return null;
  return createPortal(
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {items.map((it) => (
        <div key={it.id} className={"toast toast-" + it.tone} role="status">
          <Icon name={ICON[it.tone]} size={15} className="toast-ic" />
          <span>{it.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
