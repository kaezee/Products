// Single source of truth for app keyboard shortcuts — the display label AND the
// keydown match predicate live here, so the popover, the Help page, and the
// handler can never drift, and a future remap is one edit. Match on e.code (the
// physical key), not e.key: with Shift held the period key reports ">", so
// e.key === "." would silently never fire.

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

type KeyEventLike = { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; code: string };

// Mark a moment — Cmd/Ctrl+Shift+. (period). Chosen for zero documented browser
// collision: not a Firefox/Chrome/Safari/Edge devtools or chrome binding on
// macOS or Windows (macOS Cmd+Shift+. is a Finder toggle, app-scoped, so it does
// not intercept while a browser is focused).
export const MARK_MOMENT = {
  label: IS_MAC ? "⇧⌘." : "Ctrl+Shift+.",
  matches(e: KeyEventLike): boolean {
    return (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === "Period";
  },
};
