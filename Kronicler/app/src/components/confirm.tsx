import { useEffect, useState, type ReactNode } from "react";

// One in-app confirmation dialog for the whole app, replacing the browser's
// native confirm(). Call confirmDialog(...) from anywhere; it returns a Promise
// that resolves true (confirmed) or false (cancelled). A single <ConfirmHost/>
// mounted at the app root renders the modal.

export interface ConfirmOptions {
  message: ReactNode;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type Req = { opts: ConfirmOptions; resolve: (v: boolean) => void };
let emit: ((r: Req) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
  return new Promise((resolve) => {
    // Fallback to the native dialog only if the host isn't mounted yet.
    if (emit) emit({ opts: o, resolve });
    else resolve(typeof window !== "undefined" ? window.confirm(typeof o.message === "string" ? o.message : "Are you sure?") : false);
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);

  useEffect(() => { emit = (r) => setReq(r); return () => { emit = null; }; }, []);

  useEffect(() => {
    if (!req) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { req.resolve(false); setReq(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [req]);

  if (!req) return null;
  const { opts } = req;
  const done = (v: boolean) => { req.resolve(v); setReq(null); };

  return (
    <div className="overlay confirm-overlay" onClick={() => done(false)}>
      <div className="confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{opts.title ?? "Please confirm"}</div>
        <div className="confirm-msg">{opts.message}</div>
        <div className="confirm-actions">
          <button onClick={() => done(false)}>{opts.cancelLabel ?? "Cancel"}</button>
          <button className={opts.tone === "danger" ? "danger" : "primary"} autoFocus onClick={() => done(true)}>
            {opts.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
