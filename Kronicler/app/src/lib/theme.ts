// Account-scoped theme. Persisted in localStorage for instant paint (the inline
// script in index.html reads it before first render). DB sync (per-user) comes
// with the user_preferences table in a later step.
export type Theme = "paper" | "white" | "dark" | "system";
const KEY = "k.theme";

export function getStoredTheme(): Theme {
  try {
    let t = localStorage.getItem(KEY);
    if (t === "grey") { t = "white"; localStorage.setItem(KEY, t); } // migrated: grey → white
    return (t as Theme | null) ?? "paper";
  } catch { return "paper"; }
}

function resolve(t: Theme): "paper" | "white" | "dark" {
  if (t === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "paper";
  return t;
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", resolve(t));
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t); } catch { /* private browsing — apply anyway */ }
  applyTheme(t);
}

// Keep "system" live: re-apply when the OS preference flips.
export function initSystemThemeSync(): void {
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getStoredTheme() === "system") applyTheme("system");
    });
  } catch { /* no matchMedia — ignore */ }
}
