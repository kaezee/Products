// Shared text-anchoring for moments AND comments (one implementation, one set of
// staleness rules). A W3C Web Annotation-style anchor over plain-text offsets into
// chapters.body: the quote is the source of truth, prefix/suffix disambiguate when
// the quote repeats, and the offsets are a fast path that gets silently repaired
// when prose above the anchor shifts them. Pure — unit-tested; the DB/DOM adapters
// are thin.

export interface Anchor {
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

export interface AnchorResolution {
  start: number;
  end: number;
  status: "ok" | "stale";
  repaired: boolean; // caller persists the new offsets when true
}

const CTX = 30; // chars of prefix/suffix kept for disambiguation

// Build an anchor from a plain-text selection [start,end) of `body`.
export function makeAnchor(body: string, start: number, end: number): Anchor {
  return {
    quote: body.slice(start, end),
    prefix: body.slice(Math.max(0, start - CTX), start),
    suffix: body.slice(end, end + CTX),
    start,
    end,
  };
}

// Resolve a stored anchor against the current body.
//   1. offsets still hold the quote  → ok, no change
//   2. quote found elsewhere         → ok, repaired (caller writes back)
//   3. quote gone                    → stale
export function resolveAnchor(body: string, a: Anchor): AnchorResolution {
  if (a.quote && body.slice(a.start, a.end) === a.quote) {
    return { start: a.start, end: a.end, status: "ok", repaired: false };
  }
  if (a.quote) {
    const hit = findWithContext(body, a);
    if (hit) return { start: hit.start, end: hit.end, status: "ok", repaired: true };
  }
  return { start: a.start, end: a.end, status: "stale", repaired: false };
}

function findWithContext(body: string, a: Anchor): { start: number; end: number } | null {
  const idxs: number[] = [];
  for (let i = body.indexOf(a.quote); i >= 0; i = body.indexOf(a.quote, i + 1)) idxs.push(i);
  if (idxs.length === 0) return null;
  if (idxs.length === 1) return { start: idxs[0], end: idxs[0] + a.quote.length };
  // Repeated quote: pick the occurrence whose surrounding text best matches the
  // stored prefix/suffix — nearest by offset breaks a remaining tie.
  let best = idxs[0], bestScore = -Infinity;
  for (const s of idxs) {
    const pre = body.slice(Math.max(0, s - a.prefix.length), s);
    const suf = body.slice(s + a.quote.length, s + a.quote.length + a.suffix.length);
    const score = commonSuffix(pre, a.prefix) + commonPrefix(suf, a.suffix) - Math.abs(s - a.start) * 1e-6;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return { start: best, end: best + a.quote.length };
}

function commonPrefix(x: string, y: string): number {
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}
function commonSuffix(x: string, y: string): number {
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n;
}
