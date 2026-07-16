// Deterministic graph layout (PRD §9.3: "layout stability — deterministic
// across sessions for an unchanged world"). No randomness: initial positions
// are seeded from a hash of each entity id, then a fixed number of
// force-directed iterations refine them. Same nodes + edges → same layout,
// every time. Small graphs only (phase-1 scale), so O(n² · iters) is fine.

export interface Pt { x: number; y: number }

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const unit = (s: string) => (hash32(s) % 100000) / 100000;

export function computeLayout(nodeIds: string[], edges: [string, string][]): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  nodeIds.forEach((id) => {
    const a = unit(id) * Math.PI * 2;
    const r = 0.55 + 0.45 * unit(id + "#r");
    pos.set(id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
  });
  if (nodeIds.length <= 1) return pos;

  const REP = 0.05, ATT = 0.03, CENTER = 0.01, ITER = 160;
  for (let it = 0; it < ITER; it++) {
    const disp = new Map<string, Pt>(nodeIds.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const p = pos.get(nodeIds[i])!, q = pos.get(nodeIds[j])!;
        let dx = p.x - q.x, dy = p.y - q.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const d = Math.sqrt(d2);
        const f = REP / d2;
        dx /= d; dy /= d;
        const di = disp.get(nodeIds[i])!, dj = disp.get(nodeIds[j])!;
        di.x += dx * f; di.y += dy * f; dj.x -= dx * f; dj.y -= dy * f;
      }
    }
    edges.forEach(([a, b]) => {
      const p = pos.get(a), q = pos.get(b);
      if (!p || !q) return;
      const dx = p.x - q.x, dy = p.y - q.y;
      const da = disp.get(a)!, db = disp.get(b)!;
      da.x -= dx * ATT; da.y -= dy * ATT; db.x += dx * ATT; db.y += dy * ATT;
    });
    nodeIds.forEach((id) => {
      const p = pos.get(id)!, dsp = disp.get(id)!;
      p.x += dsp.x - p.x * CENTER;
      p.y += dsp.y - p.y * CENTER;
    });
  }
  return pos;
}
