import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Entity } from "../lib/types";
import { scanMentions } from "../lib/mentions";

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

// Level 2 writing surface. A real <textarea> (native typing, caret, paste,
// selection, autosave — all untouched) with a perfectly-aligned layer *behind*
// it that paints entity mentions. Clicking a highlighted name opens a peek card.
// Body stays plain text; no rich-text framework.
export function ProseEditor({ value, entities, onChange, onSelectText, placeholder }: {
  value: string;
  entities: Entity[];
  onChange: (v: string) => void;
  onSelectText: (t: string) => void;
  placeholder?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<{ x: number; y: number; entity: Entity } | null>(null);

  const spans = useMemo(() => scanMentions(value, entities), [value, entities]);
  const backHtml = useMemo(() => {
    let out = "";
    let i = 0;
    for (const s of spans) {
      out += escapeHtml(value.slice(i, s.start));
      out += `<mark class="ment">${escapeHtml(value.slice(s.start, s.end))}</mark>`;
      i = s.end;
    }
    out += escapeHtml(value.slice(i));
    if (value.endsWith("\n")) out += " "; // keep trailing blank line heights equal
    return out;
  }, [value, spans]);

  function syncScroll() {
    if (backRef.current && taRef.current) {
      backRef.current.scrollTop = taRef.current.scrollTop;
      backRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }
  useLayoutEffect(syncScroll, [value]);

  function onClick(e: React.MouseEvent) {
    const ta = taRef.current!;
    const pos = ta.selectionStart;
    const hit = spans.find((s) => pos >= s.start && pos <= s.end);
    const ent = hit ? entities.find((x) => x.id === hit.entityId) : null;
    if (ent && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPeek({ x: Math.min(e.clientX - rect.left, rect.width - 250), y: e.clientY - rect.top, entity: ent });
    } else {
      setPeek(null);
    }
  }

  return (
    <div className="prose-wrap" ref={wrapRef}>
      <div className="prose-back" ref={backRef} aria-hidden dangerouslySetInnerHTML={{ __html: backHtml }} />
      <textarea
        ref={taRef}
        className="prose-in"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Escape") setPeek(null); }}
        onSelect={(e) => {
          const el = e.currentTarget;
          onSelectText(el.value.slice(el.selectionStart, el.selectionEnd));
        }}
      />
      {peek && (
        <div className="pop" style={{ position: "absolute", left: Math.max(8, peek.x), top: peek.y + 16, width: 240, zIndex: 5, background: "var(--surface)", border: "1px solid var(--lineStrong)", borderRadius: 12, padding: "12px 14px", boxShadow: "var(--pop)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span className="title-serif" style={{ fontSize: 15, flex: 1 }}>{peek.entity.title}</span>
            <span className="chip">{peek.entity.type}</span>
          </div>
          {peek.entity.aliases.length > 0 && <div className="note" style={{ marginBottom: 6 }}>"{peek.entity.aliases.join('", "')}"</div>}
          <div style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.5 }}>
            {peek.entity.body ? peek.entity.body.slice(0, 160) + (peek.entity.body.length > 160 ? "…" : "") : <span className="muted">No description yet.</span>}
          </div>
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <span className="muted" style={{ cursor: "pointer", fontSize: 12 }} onClick={() => setPeek(null)}>close</span>
          </div>
        </div>
      )}
    </div>
  );
}
