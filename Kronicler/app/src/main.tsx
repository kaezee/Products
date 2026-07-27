import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { initSystemThemeSync } from "./lib/theme";
import { applyReadingPrefs } from "./lib/readingPrefs";

applyReadingPrefs();

initSystemThemeSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
