// Per-device reading preferences for the manuscript prose: which design-system
// face the chapter text wears, and at what size. Applied by overriding the
// --k-read-* tokens on the document root, which is what .rich reads — so a
// change reflows every chapter live. Stored in localStorage (not the DB yet),
// same as the theme; can move per-world later.

export type ReadFace = "literata" | "public-sans" | "roboto-mono";

export const READ_FACES: { key: ReadFace; label: string; stack: string }[] = [
  { key: "literata",     label: "Literata",   stack: "'Literata', Georgia, 'Times New Roman', serif" },
  { key: "public-sans",  label: "Public Sans", stack: "'Public Sans', system-ui, -apple-system, sans-serif" },
  { key: "roboto-mono",  label: "Roboto Mono", stack: "'Roboto Mono', ui-monospace, 'SF Mono', monospace" },
];

export const READ_SIZE_MIN = 14;
export const READ_SIZE_MAX = 22;
export const READ_SIZE_DEFAULT = 17;

export function getReadFace(): ReadFace {
  const v = localStorage.getItem("k.readFace") as ReadFace | null;
  return READ_FACES.some((f) => f.key === v) ? (v as ReadFace) : "literata";
}
export function getReadSize(): number {
  const n = Number(localStorage.getItem("k.readSize"));
  if (!Number.isFinite(n) || n <= 0) return READ_SIZE_DEFAULT;
  return Math.min(READ_SIZE_MAX, Math.max(READ_SIZE_MIN, Math.round(n)));
}

export function applyReadingPrefs() {
  const root = document.documentElement.style;
  const face = READ_FACES.find((f) => f.key === getReadFace())!;
  root.setProperty("--k-read-face", face.stack);
  root.setProperty("--k-read-size", getReadSize() + "px");
}

export function setReadFace(f: ReadFace) {
  localStorage.setItem("k.readFace", f);
  applyReadingPrefs();
}
export function setReadSize(n: number) {
  const v = Math.min(READ_SIZE_MAX, Math.max(READ_SIZE_MIN, Math.round(n)));
  localStorage.setItem("k.readSize", String(v));
  applyReadingPrefs();
}
