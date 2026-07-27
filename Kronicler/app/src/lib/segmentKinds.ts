import type { SegmentKind } from "./types";

// Default swatch per built-in segment kind (design doc 3 §4.3), used as a
// fallback when a world's registry hasn't loaded or lacks a kind.
export const BUILTIN_KIND_SWATCH: Record<string, string> = {
  series: "plum", book: "azure", season: "teal", volume: "moss", arc: "ochre",
};
// Swatches free for writer-minted kinds, then the rest as overflow.
const KIND_FREE_POOL = ["amber", "rust", "crimson", "magenta", "violet", "green", "slate", "teal", "azure", "moss", "plum", "ochre"];

// Map every kind NAME (lowercased) → its swatch. Registry rows win; built-ins
// fall back to their default; any remaining custom kind gets a free swatch by
// sorted order — so no kind is ever colourless (replaces KIND_TINT).
export function buildKindSwatches(registry: SegmentKind[], allKindNames: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of registry) m.set(r.name.toLowerCase(), r.swatch);
  for (const [n, s] of Object.entries(BUILTIN_KIND_SWATCH)) if (!m.has(n)) m.set(n, s);
  const custom = [...new Set(allKindNames.map((n) => n.toLowerCase()))].filter((n) => !m.has(n)).sort();
  custom.forEach((n, i) => m.set(n, KIND_FREE_POOL[i % KIND_FREE_POOL.length]));
  return m;
}
