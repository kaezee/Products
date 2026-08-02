import type { ChapterStatus } from "./types";

// The chapter pipeline, in order. The stored keys are fixed (they're a small
// shared vocabulary and a DB check constraint); the labels here are the only
// thing shown to a writer — change a word and it changes everywhere. Only the
// dot carries the colour, so the labels stay legible in both themes.
export const CHAPTER_STATUSES: { key: ChapterStatus; label: string; color: string }[] = [
  { key: "planned", label: "Planned", color: "#8C8577" }, // outlined, nothing written
  { key: "draft",   label: "Draft",   color: "#3B82C4" }, // being written (default)
  { key: "review",  label: "Review",  color: "#C98A2B" }, // in a revision pass
  { key: "ready",   label: "Ready",   color: "#3E9C6B" }, // done, ready to publish
  { key: "on_hold", label: "On Hold", color: "#8E7CC3" }, // parked for now
];

const BY_KEY = new Map(CHAPTER_STATUSES.map((s) => [s.key, s]));

export function statusMeta(key: ChapterStatus | null | undefined) {
  return BY_KEY.get((key ?? "draft") as ChapterStatus) ?? CHAPTER_STATUSES[1];
}
