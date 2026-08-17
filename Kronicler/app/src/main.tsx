import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { initSystemThemeSync } from "./lib/theme";
import { applyReadingPrefs } from "./lib/readingPrefs";

applyReadingPrefs();

initSystemThemeSync();

// A tab left open across a redeploy runs an old bundle whose lazy chunks (e.g. the
// .docx importer) were purged by the new deploy — so a dynamic import fails with
// "Failed to fetch dynamically imported module". Reload once to pick up the current
// build; a 10s guard prevents a reload loop if the failure is something else.
window.addEventListener("vite:preloadError", () => {
  const KEY = "k.preloadReloadAt";
  if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) > 10000) {
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
