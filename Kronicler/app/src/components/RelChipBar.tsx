import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Valence } from "../lib/types";
import { VALENCE_COLOR, VALENCE_LABEL, VALENCE_ORDER } from "../lib/valence";
import { Icon, type IconName } from "./icons";

export type OrderBy = "recent" | "changed" | "tone" | "kind";

// The chip bar reads as a sentence describing the current view (RELATIONSHIPS-
// BUILD.md §3). It replaces the old right-hand control panel entirely: controls
// live here, on the canvas, and a chip that would do nothing simply isn't
// rendered. Each chip opens only its own dropdown.
export interface ChipData {
  variant: "graph" | "list";
  hasSecrets: boolean;
  centre: string | null; centreName: string | null;
  depth: 1 | 2 | 3; reachAt: number[]; effDepth: number;
  onClearCentre: () => void; setDepth: (d: 1 | 2 | 3) => void;
  tones: Set<Valence>; toneCount: Map<Valence, number>; setTones: (s: Set<Valence>) => void;
  kinds: Set<string>; kindDict: { id: string; label: string; valence: Valence }[];
  kindSeen: Map<string, number>; total: number; setKinds: (s: Set<string>) => void;
  pov: string; povPeople: { id: string; name: string; deg: number }[];
  recentPov: string[]; setPov: (id: string) => void;
  order: OrderBy; setOrder: (o: OrderBy) => void;
}

const SUGGEST = 7;
const ORDER_LABEL: Record<OrderBy, string> = { recent: "latest change", changed: "most changes", tone: "standing", kind: "kind" };

export function RelChipBar(d: ChipData) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!barRef.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function close() { setOpen(null); setQ(""); setCursor(0); }
  function toggle(k: string) { setQ(""); setCursor(0); setOpen((o) => (o === k ? null : k)); }

  const chip = (key: string, icon: IconName, label: string, active: boolean, extra?: ReactNode) => (
    <div className="relchip-wrap" key={key}>
      <button className={"relchip" + (active ? " set" : "")} onClick={() => toggle(key)} aria-expanded={open === key}>
        <Icon name={icon} size={12} aria-hidden />
        <span>{label}</span>
        {extra ?? <span className="relchip-cv">⌄</span>}
      </button>
      {open === key && <div className="reldrop">{renderDrop(key)}</div>}
    </div>
  );

  // ── combobox helpers (kinds, point of view) ────────────────────────────────
  const query = q.trim().toLowerCase();
  function comboKeys(rows: { key: string }[]) {
    return (e: ReactKeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); rows[cursor] && pickCombo(rows[cursor].key); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };
  }
  let pickCombo: (key: string) => void = () => {};

  function renderDrop(k: string) {
    if (k === "depth") {
      const opts: { v: 1 | 2 | 3; label: string }[] = [{ v: 1, label: "direct only" }, { v: 2, label: "2 steps out" }, { v: 3, label: "3 steps out" }];
      return (
        <div className="reldrop-list">
          <div className="reldrop-h">How far out</div>
          {opts.map((o) => {
            const dead = o.v > 1 && d.reachAt[o.v] === d.reachAt[o.v - 1];
            return (
              <button key={o.v} className={"reldrop-opt" + (d.effDepth === o.v ? " on" : "") + (dead ? " zero" : "")}
                disabled={dead} onClick={() => { d.setDepth(o.v); close(); }}>
                {o.label}<span className="reldrop-n">{d.reachAt[o.v] != null ? d.reachAt[o.v] - 1 : ""}</span>
              </button>
            );
          })}
        </div>
      );
    }
    if (k === "tone") {
      return (
        <div className="reldrop-list">
          <div className="reldrop-h">Standing</div>
          <button className={"reldrop-opt" + (d.tones.size === 0 ? " on" : "")} onClick={() => d.setTones(new Set())}>
            any standing<span className="reldrop-n">{d.total}</span>
          </button>
          {VALENCE_ORDER.map((v) => {
            const c = d.toneCount.get(v) ?? 0;
            return (
              <button key={v} className={"reldrop-opt" + (d.tones.has(v) ? " on" : "") + (c === 0 ? " zero" : "")}
                disabled={c === 0} onClick={() => { const n = new Set(d.tones); n.has(v) ? n.delete(v) : n.add(v); d.setTones(n); }}>
                <span className="reldrop-dot" style={{ background: VALENCE_COLOR[v] }} />{VALENCE_LABEL[v]}<span className="reldrop-n">{c}</span>
              </button>
            );
          })}
        </div>
      );
    }
    if (k === "order") {
      return (
        <div className="reldrop-list">
          <div className="reldrop-h">Order by</div>
          {(Object.keys(ORDER_LABEL) as OrderBy[]).map((o) => (
            <button key={o} className={"reldrop-opt" + (d.order === o ? " on" : "")} onClick={() => { d.setOrder(o); close(); }}>
              {ORDER_LABEL[o]}
            </button>
          ))}
        </div>
      );
    }
    if (k === "kinds") {
      const inView = d.kindDict.filter((t) => (d.kindSeen.get(t.id) ?? 0) > 0)
        .sort((a, b) => (d.kindSeen.get(b.id)! - d.kindSeen.get(a.id)!) || a.label.localeCompare(b.label));
      const absent = d.kindDict.filter((t) => (d.kindSeen.get(t.id) ?? 0) === 0).sort((a, b) => a.label.localeCompare(b.label));
      const pool = query ? [...inView, ...absent].filter((t) => t.label.toLowerCase().includes(query)) : inView;
      const list = query ? pool : pool.slice(0, SUGGEST);
      const hidden = query ? 0 : Math.max(pool.length - SUGGEST, 0) + absent.length;
      const rows = list.map((t) => ({ key: t.id }));
      pickCombo = (id) => { const n = new Set(d.kinds); n.has(id) ? n.delete(id) : n.add(id); d.setKinds(n); setQ(""); setCursor(0); };
      return (
        <div className="reldrop-combo">
          <div className="reldrop-cbx">
            <span className="reldrop-ic"><Icon name="search" size={12} /></span>
            <input className="reldrop-search" autoFocus placeholder="Filter kinds…" value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0); }} onKeyDown={comboKeys(rows)} />
            <span className="reldrop-cbxn">{d.kindDict.length}</span>
          </div>
          <div className="reldrop-lbl">{query ? `${list.length} match${list.length === 1 ? "" : "es"}` : "in this view · most used first"}</div>
          <div className="reldrop-scroll">
            {!query && (
              <button className={"reldrop-opt" + (d.kinds.size === 0 ? " on" : "")} onClick={() => d.setKinds(new Set())}>
                every kind<span className="reldrop-n">{d.total}</span>
              </button>
            )}
            {list.map((t, i) => (
              <button key={t.id} className={"reldrop-opt" + (d.kinds.has(t.id) ? " on" : "") + (cursor === i ? " cur" : "")}
                onMouseEnter={() => setCursor(i)} onClick={() => pickCombo(t.id)}>
                <span className="reldrop-dot" style={{ background: VALENCE_COLOR[t.valence] }} />{t.label}
                <span className="reldrop-n">{d.kindSeen.get(t.id) || "—"}</span>
              </button>
            ))}
            {list.length === 0 && <div className="reldrop-none">nothing matches “{q}”</div>}
          </div>
          {hidden > 0 && !query && <div className="reldrop-more">type to search {hidden} more</div>}
          {d.kinds.size > 0 && (
            <div className="reldrop-foot">
              <a onClick={() => d.setKinds(new Set())}>Clear {d.kinds.size}</a>
              <a onClick={close}>Done</a>
            </div>
          )}
        </div>
      );
    }
    if (k === "pov") {
      const rank = (a: { id: string; deg: number; name: string }, b: { id: string; deg: number; name: string }) => {
        const ra = d.recentPov.indexOf(a.id), rb = d.recentPov.indexOf(b.id);
        if (ra !== rb) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
        return b.deg - a.deg || a.name.localeCompare(b.name);
      };
      const pool = query ? d.povPeople.filter((p) => p.name.toLowerCase().includes(query)).sort(rank)
        : d.povPeople.filter((p) => p.deg > 0).sort(rank);
      const list = query ? pool : pool.slice(0, SUGGEST);
      const hidden = query ? 0 : d.povPeople.length - list.length;
      const rows = list.map((p) => ({ key: p.id }));
      pickCombo = (id) => { d.setPov(id); close(); };
      return (
        <div className="reldrop-combo">
          <div className="reldrop-cbx">
            <span className="reldrop-ic"><Icon name="search" size={12} /></span>
            <input className="reldrop-search" autoFocus placeholder="Filter people…" value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0); }} onKeyDown={comboKeys(rows)} />
            <span className="reldrop-cbxn">{d.povPeople.length}</span>
          </div>
          <div className="reldrop-lbl">{query ? `${list.length} match${list.length === 1 ? "" : "es"}` : (d.recentPov.length ? "recent · then most connected" : "most connected")}</div>
          <div className="reldrop-scroll">
            {!query && (
              <button className={"reldrop-opt" + (d.pov === "all" ? " on" : "")} onClick={() => { d.setPov("all"); close(); }}>
                everyone’s view
              </button>
            )}
            {list.map((p, i) => (
              <button key={p.id} className={"reldrop-opt" + (d.pov === p.id ? " on" : "") + (cursor === i ? " cur" : "")}
                onMouseEnter={() => setCursor(i)} onClick={() => pickCombo(p.id)}>
                as {p.name} knows it<span className="reldrop-n">{p.deg || "—"}</span>
              </button>
            ))}
            {list.length === 0 && <div className="reldrop-none">nothing matches “{q}”</div>}
          </div>
          {hidden > 0 && !query && <div className="reldrop-more">type to search {hidden} more</div>}
        </div>
      );
    }
    return null;
  }

  const toneLabel = d.tones.size ? [...d.tones].map((v) => VALENCE_LABEL[v]).join(" + ") : "any standing";
  const kindsLabel = d.kinds.size ? `${d.kinds.size} of ${d.kindDict.length} kinds` : "every kind";
  const povLabel = d.pov !== "all" ? `as ${d.povPeople.find((p) => p.id === d.pov)?.name ?? "someone"} knows it` : "everyone’s view";

  return (
    <div className={"relbar" + (d.variant === "graph" ? " float" : "")} ref={barRef}>
      {d.centre && (
        <div className="relchip-wrap">
          <span className="relchip set">
            <Icon name="crosshair" size={12} aria-hidden />
            <span>centred on {d.centreName}</span>
            <span className="relchip-x" role="button" tabIndex={0} title="Clear centre"
              onClick={d.onClearCentre} onKeyDown={(e) => { if (e.key === "Enter") d.onClearCentre(); }}>
              <Icon name="close" size={12} aria-hidden />
            </span>
          </span>
        </div>
      )}
      {d.centre && chip("depth", "waypoints", d.effDepth === 1 ? "direct only" : `${d.effDepth} steps out`, false)}
      {chip("tone", "tone", toneLabel, d.tones.size > 0)}
      {chip("kinds", "link", kindsLabel, d.kinds.size > 0)}
      {d.hasSecrets && chip("pov", "eye", povLabel, d.pov !== "all")}
      {d.variant === "list" && chip("order", "sort", `ordered by ${ORDER_LABEL[d.order]}`, false)}
    </div>
  );
}
