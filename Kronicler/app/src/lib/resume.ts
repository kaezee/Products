// "Where you stopped" — the chapter to resume at, shown as the amber marker on
// the Overview grid, the Write tree, and the Timeline. It must point at the
// chapter the writer last TOUCHED, not the last chapter in the book.
//
// `chapters.updated_at` isn't wired yet (a deferred additive migration), so we
// use a per-world, per-browser signal — the same family as the recap's
// `k.seen` — recorded whenever the writer EDITS a chapter (a body change), not
// merely opens it. Fall back to the furthest-along written chapter when there's
// no record yet (fresh browser, or nothing edited since).
import type { Chapter } from "./types";

const KEY = (worldId: string) => `k.lastch.${worldId}`;

export function markResume(worldId: string, chapterId: string) {
  try { localStorage.setItem(KEY(worldId), chapterId); } catch { /* private mode / disabled storage */ }
}

export function resumeChapterId(chapters: Chapter[], worldId: string): string | null {
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY(worldId)); } catch { /* ignore */ }
  if (stored && chapters.some((c) => c.id === stored)) return stored;
  const byOrder = [...chapters].sort((a, b) => b.manuscript_order - a.manuscript_order);
  return (byOrder.find((c) => !c.planned && (c.body || "").trim().length > 0)
    ?? byOrder.find((c) => !c.planned)
    ?? byOrder[0])?.id ?? null;
}
