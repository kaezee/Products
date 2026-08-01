import { useEffect, useRef, useState } from "react";
import type { Entity, EntityType } from "../lib/types";
import { scanMentions } from "../lib/mentions";
import { getEntityTypes } from "../lib/api";
import { buildTypeSwatches } from "../lib/entityTypes";
import { VALENCE_COLOR } from "../lib/valence";
import type { MentionState } from "../lib/mentionState";
import { Icon } from "../components/icons";

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

// Lightweight markdown emphasis over the plain-text value: **bold** and *italic*.
// We keep the markers in the text (dimmed on screen) so the stored body stays
// plain, portable, and byte-for-byte the same as what the caret logic counts —
// the emphasis is decoration only, exactly like a mention. One line at a time
// (no newline inside a token), bold matched before italic, no overlaps.
type Emph = { start: number; end: number; innerStart: number; innerEnd: number; tag: "strong" | "em" };
function scanEmphasis(text: string): Emph[] {
  const marks: Emph[] = [];
  const bold = /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = bold.exec(text))) {
    marks.push({ start: m.index, end: m.index + m[0].length, innerStart: m.index + 2, innerEnd: m.index + m[0].length - 2, tag: "strong" });
  }
  const italic = /(?<!\*)\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g;
  while ((m = italic.exec(text))) {
    const s = m.index, e = s + m[0].length;
    if (marks.some((b) => s < b.end && e > b.start)) continue; // inside a bold run
    marks.push({ start: s, end: e, innerStart: s + 1, innerEnd: e - 1, tag: "em" });
  }
  marks.sort((a, b) => a.start - b.start);
  const res: Emph[] = [];
  let last = -1;
  for (const k of marks) if (k.start >= last) { res.push(k); last = k.end; }
  return res;
}

const SUPPORTS_PO = (() => {
  try {
    const d = document.createElement("div");
    d.setAttribute("contenteditable", "plaintext-only");
    return d.contentEditable === "plaintext-only";
  } catch { return false; }
})();

// Level 2, full: a contentEditable prose surface where entity mentions are real
// inline elements (hover-preview + click-through), while the stored value stays
// PLAIN TEXT. plaintext-only gives native Enter→\n, plain paste, and undo; we
// only add the decoration spans and preserve the caret across re-highlights.
// A small imperative handle a parent can hold to select an anchor range in this
// prose (used to jump to a comment). Returns false if the quote can't be found.
export interface ProseApi {
  selectRange: (start: number, end: number, quote: string) => boolean;
  format: (marker: "**" | "*") => void;
}

export function RichProse({ value, entities, onChange, onSelectText, onOpenEntity, stateOf, onMarkEntity, onMarkMoment, onComment, apiRef, placeholder }: {
  value: string;
  entities: Entity[];
  onChange: (v: string) => void;
  onSelectText: (t: string) => void;
  onOpenEntity?: (id: string) => void;
  stateOf?: (entityId: string) => MentionState[];
  onMarkEntity?: () => void;
  onMarkMoment?: () => void;
  onComment?: (range: { start: number; end: number; quote: string }) => void;
  apiRef?: (api: ProseApi | null) => void;
  placeholder?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const decorateTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const [peek, setPeek] = useState<{ x: number; y: number; entity: Entity } | null>(null);
  // The floating annotation control — anchored to the current text selection.
  const [sel, setSel] = useState<{ x: number; y: number; len: number; word: boolean } | null>(null);

  // Keep the latest entity set available to the decorate routine.
  const entRef = useRef(entities);
  entRef.current = entities;

  // type name (lowercased) → curated swatch, so every mention gets its colour
  // from the world's type registry (built-ins + custom), never a hardcoded hex.
  const swatchRef = useRef<Map<string, string>>(new Map());

  // A run of plain text [from,to) with any mentions fully inside it decorated.
  // Mentions never straddle emphasis markers (the * chars are word boundaries),
  // so a mention is always wholly inside or wholly outside an emphasis token.
  function renderRun(text: string, from: number, to: number, mentions: ReturnType<typeof scanMentions>, typeById: Map<string, string>): string {
    const swatches = swatchRef.current;
    let out = "", i = from;
    for (const s of mentions) {
      if (s.start < i || s.end > to) continue;
      const t = typeById.get(s.entityId);
      const sw = t ? swatches.get(t.toLowerCase()) : undefined;
      const style = sw
        ? ` style="--k-ment-color:var(--k-entity-${sw});--k-ment-tint:var(--k-entity-${sw}-tint)"`
        : "";
      const typeAttr = t ? ` data-type="${escapeHtml(t.toLowerCase())}"` : "";
      out += escapeHtml(text.slice(i, s.start));
      out += `<span class="ment" data-id="${s.entityId}"${typeAttr}${style}>${escapeHtml(text.slice(s.start, s.end))}</span>`;
      i = s.end;
    }
    out += escapeHtml(text.slice(i, to));
    return out;
  }

  function decorateHtml(text: string): string {
    const ents = entRef.current;
    const mentions = scanMentions(text, ents);
    const typeById = new Map(ents.map((e) => [e.id, e.type]));
    const emph = scanEmphasis(text);
    let out = "", i = 0;
    for (const tok of emph) {
      out += renderRun(text, i, tok.start, mentions, typeById);
      out += `<${tok.tag} class="md-em">`;
      out += `<span class="md-mark">${escapeHtml(text.slice(tok.start, tok.innerStart))}</span>`;
      out += renderRun(text, tok.innerStart, tok.innerEnd, mentions, typeById);
      out += `<span class="md-mark">${escapeHtml(text.slice(tok.innerEnd, tok.end))}</span>`;
      out += `</${tok.tag}>`;
      i = tok.end;
    }
    out += renderRun(text, i, text.length, mentions, typeById);
    return out;
  }

  function caretOffset(el: HTMLElement): number | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  }
  function setCaret(el: HTMLElement, off: number | null) {
    if (off == null) return;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null, rem = off, node: Node | null = null;
    while ((n = walk.nextNode())) {
      const len = (n as Text).length;
      if (rem <= len) { node = n; break; }
      rem -= len;
    }
    const r = document.createRange();
    if (node) r.setStart(node, rem);
    else { r.selectNodeContents(el); r.collapse(false); }
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }

  // Plain-text [start,end) of the current selection within el (order-normalized).
  function selectionOffsets(el: HTMLElement): { start: number; end: number } | null {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || !el.contains(s.anchorNode)) return null;
    const r = s.getRangeAt(0);
    const a = document.createRange(); a.selectNodeContents(el); a.setEnd(r.startContainer, r.startOffset);
    const b = document.createRange(); b.selectNodeContents(el); b.setEnd(r.endContainer, r.endOffset);
    let start = a.toString().length, end = b.toString().length;
    if (start > end) [start, end] = [end, start];
    return { start, end };
  }
  function locate(el: HTMLElement, off: number): { node: Node; off: number } | null {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null, rem = off;
    while ((n = walk.nextNode())) {
      const len = (n as Text).length;
      if (rem <= len) return { node: n, off: rem };
      rem -= len;
    }
    return null;
  }
  function setSelectionOffsets(el: HTMLElement, a: number, b: number) {
    const p1 = locate(el, a), p2 = locate(el, b);
    if (!p1 || !p2) return;
    const r = document.createRange();
    r.setStart(p1.node, p1.off); r.setEnd(p2.node, p2.off);
    const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
  }

  // Select an anchor range so a parent can jump to a comment. If the stored
  // offsets no longer hold the quote (the prose was edited), re-find the quote;
  // return false only when it's truly gone (a detached comment).
  function selectRange(start: number, end: number, quote: string): boolean {
    const el = edRef.current;
    if (!el) return false;
    const text = el.textContent ?? "";
    let a = start, b = end;
    if (text.slice(a, b) !== quote) {
      const idx = quote ? text.indexOf(quote) : -1;
      if (idx < 0) return false;
      a = idx; b = idx + quote.length;
    }
    el.focus();
    setSelectionOffsets(el, a, b);
    const s = window.getSelection();
    if (s && s.rangeCount) {
      const r = s.getRangeAt(0).getBoundingClientRect();
      if (r.top || r.bottom) el.scrollIntoView({ block: "nearest" });
    }
    reportSelection();
    return true;
  }
  useEffect(() => {
    apiRef?.({ selectRange, format: applyWrap });
    return () => apiRef?.(null);
    // eslint-disable-next-line
  }, [apiRef]);

  // Toggle a markdown marker around the selection. Purely a plain-text edit —
  // wrap if bare, unwrap if the markers already hug the selection (either just
  // outside it or just inside), then re-decorate and restore the selection.
  function applyWrap(marker: string) {
    const el = edRef.current;
    if (!el) return;
    const range = selectionOffsets(el);
    if (!range || range.start === range.end) return;
    const { start: a, end: b } = range;
    const text = el.textContent ?? "";
    const inner = text.slice(a, b);
    const M = marker.length;
    const outside = text.slice(a - M, a) === marker && text.slice(b, b + M) === marker;
    const insideWrapped = inner.length > 2 * M && inner.startsWith(marker) && inner.endsWith(marker);
    let next: string, na: number, nb: number;
    if (outside) { next = text.slice(0, a - M) + inner + text.slice(b + M); na = a - M; nb = b - M; }
    else if (insideWrapped) { const st = inner.slice(M, inner.length - M); next = text.slice(0, a) + st + text.slice(b); na = a; nb = b - 2 * M; }
    else { next = text.slice(0, a) + marker + inner + marker + text.slice(b); na = a + M; nb = b + M; }
    el.textContent = next;
    onChange(next);
    decorate();
    setSelectionOffsets(el, na, nb);
    reportSelection();
  }

  function decorate() {
    const el = edRef.current;
    if (!el || composing.current) return;
    const text = el.textContent ?? "";
    const html = decorateHtml(text);
    if (el.innerHTML !== html) {
      const focused = document.activeElement === el;
      const off = focused ? caretOffset(el) : null;
      el.innerHTML = html;
      if (focused) setCaret(el, off);
    }
  }

  // Mount: configure the element and paint the initial value.
  useEffect(() => {
    const el = edRef.current;
    if (!el) return;
    el.contentEditable = SUPPORTS_PO ? "plaintext-only" : "true";
    el.innerHTML = decorateHtml(value);
    // eslint-disable-next-line
  }, []);

  // External value changes (version restore) while not actively editing.
  useEffect(() => {
    const el = edRef.current;
    if (!el || document.activeElement === el) return;
    if ((el.textContent ?? "") !== value) el.innerHTML = decorateHtml(value);
    // eslint-disable-next-line
  }, [value]);

  // Load the world's type registry so mentions colour from curated swatches.
  const worldId = entities[0]?.world_id;
  useEffect(() => {
    if (!worldId) return;
    let live = true;
    getEntityTypes(worldId).then((rows: EntityType[]) => {
      if (!live) return;
      const names = entRef.current.map((e) => e.type);
      swatchRef.current = buildTypeSwatches(rows, names);
      decorate();
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line
  }, [worldId]);

  // Re-highlight when the cast changes (entities finish loading, alias added…).
  useEffect(() => {
    // rebuild in case a new custom type appeared among the entities
    if (swatchRef.current.size) {
      swatchRef.current = buildTypeSwatches(
        [...swatchRef.current].map(([name, swatch]) => ({ name, swatch })),
        entities.map((e) => e.type),
      );
    }
    decorate();
    /* eslint-disable-next-line */
  }, [entities]);

  function onInput() {
    if (composing.current) return;
    setSel(null);
    const text = edRef.current?.textContent ?? "";
    onChange(text);
    window.clearTimeout(decorateTimer.current);
    decorateTimer.current = window.setTimeout(decorate, 150);
  }

  // Firefox lacks plaintext-only: keep Enter as a real "\n" and paste plain.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && sel) { setSel(null); return; }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); applyWrap("**"); return; }
      if (k === "i") { e.preventDefault(); applyWrap("*"); return; }
    }
    if (SUPPORTS_PO) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const tn = document.createTextNode("\n");
      r.insertNode(tn);
      r.setStartAfter(tn); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      onInput();
    }
  }
  function onPaste(e: React.ClipboardEvent) {
    if (SUPPORTS_PO) return;
    e.preventDefault();
    const t = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const tn = document.createTextNode(t);
    r.insertNode(tn);
    r.setStartAfter(tn); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    onInput();
  }

  function reportSelection() {
    const s = window.getSelection();
    const el = edRef.current;
    const wrap = wrapRef.current;
    const text = s && el && el.contains(s.anchorNode) ? s.toString() : "";
    onSelectText(text);
    if (text.trim() && s && s.rangeCount && wrap) {
      const rect = s.getRangeAt(0).getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      setSel({ x: rect.left - wr.left + rect.width / 2, y: rect.top - wr.top, len: text.trim().length, word: !/\s/.test(text.trim()) });
    } else {
      setSel(null);
    }
  }

  function showCardFor(m: HTMLElement) {
    window.clearTimeout(hideTimer.current);
    const ent = entities.find((e) => e.id === m.dataset.id);
    const wrap = wrapRef.current;
    if (!ent || !wrap) return;
    const wr = wrap.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    setPeek({ x: Math.min(mr.left - wr.left, wr.width - 250), y: mr.bottom - wr.top, entity: ent });
  }
  function scheduleHide() {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPeek(null), 220);
  }

  return (
    <div className="prose-wrap" ref={wrapRef}>
      <div
        ref={edRef}
        className="rich"
        data-placeholder={placeholder}
        spellCheck
        suppressContentEditableWarning
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onMouseUp={reportSelection}
        onKeyUp={reportSelection}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; decorate(); }}
        onMouseOver={(e) => { const m = (e.target as HTMLElement).closest?.(".ment") as HTMLElement | null; if (m) showCardFor(m); }}
        onMouseOut={(e) => { const m = (e.target as HTMLElement).closest?.(".ment"); if (m) scheduleHide(); }}
      />
      {sel && (
        <div className="annot-bar"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute", zIndex: 7,
            left: Math.max(84, Math.min(sel.x, (wrapRef.current?.clientWidth ?? 400) - 84)),
            top: sel.y > 42 ? sel.y - 8 : sel.y + 24,
            transform: sel.y > 42 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
          }}>
          <button className="annot-fmt" onClick={() => applyWrap("**")} title="Bold (⌘B)"><b>B</b></button>
          <button className="annot-fmt" onClick={() => applyWrap("*")} title="Italic (⌘I)"><i>I</i></button>
          {(onComment || onMarkEntity || onMarkMoment) && <span className="annot-sep" />}
          {onComment && (
            <button onClick={() => {
              const el = edRef.current;
              const range = el && selectionOffsets(el);
              if (el && range && range.start !== range.end) {
                onComment({ start: range.start, end: range.end, quote: (el.textContent ?? "").slice(range.start, range.end) });
              }
              setSel(null);
            }} title="Comment on the selection">💬 Comment</button>
          )}
          {/* Verb order follows selection size (§3.6): a word puts Mark entity
              first; a sentence puts Mark a moment first. */}
          {(() => {
            const markEntity = onMarkEntity && (
              <button key="me" onClick={() => { onMarkEntity(); setSel(null); }} title="Tag the selection as a character, place, item…">✦ Mark entity</button>
            );
            const markMoment = onMarkMoment && (
              <button key="mm" disabled={sel.len < 3} onClick={() => { onMarkMoment(); setSel(null); }} title="Record what happens between characters in the selection">✳ Mark a moment</button>
            );
            return sel.word ? [markEntity, markMoment] : [markMoment, markEntity];
          })()}
        </div>
      )}
      {peek && (() => {
        const sw = swatchRef.current.get(peek.entity.type.toLowerCase());
        const states = stateOf ? stateOf(peek.entity.id).slice(0, 4) : [];
        return (
        <div className="pop"
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={scheduleHide}
          style={{ position: "absolute", left: Math.max(8, peek.x), top: peek.y + 8, width: 250, zIndex: 6, background: "var(--surface)", border: "1px solid var(--lineStrong)", borderRadius: 12, padding: "12px 14px", boxShadow: "var(--pop)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="title-serif" style={{ fontSize: 15, flex: 1 }}>{peek.entity.title}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--sub)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: sw ? `var(--k-entity-${sw})` : "var(--faint)" }} />
              {peek.entity.type}
            </span>
          </div>
          {peek.entity.aliases.length > 0 && <div className="note" style={{ marginBottom: 6 }}>"{peek.entity.aliases.join('", "')}"</div>}
          <div style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.5 }}>
            {peek.entity.body ? peek.entity.body.slice(0, 140) + (peek.entity.body.length > 140 ? "…" : "") : <span className="muted">No description yet.</span>}
          </div>
          {states.length > 0 && (
            <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line)" }}>
              <div className="label" style={{ margin: "0 0 5px", fontSize: 10 }}>As of here</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {states.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, lineHeight: 1.35 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginTop: 1, background: VALENCE_COLOR[s.valence] }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ color: "var(--ink)" }}>{s.label}</span>
                      <span style={{ color: "var(--sub)" }}> · {s.other}</span>
                      {s.concealed && <span title="hidden from someone at this point" style={{ marginLeft: 4, display: "inline-flex", color: "var(--obligation)" }}><Icon name="lock" size={11} /></span>}
                      {s.isCorrection && <span className="faint" style={{ marginLeft: 4, fontSize: 10 }}>(revised)</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {onOpenEntity && (
            <div style={{ marginTop: 10 }}>
              <button style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => { const id = peek.entity.id; setPeek(null); onOpenEntity(id); }}>Open page →</button>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
