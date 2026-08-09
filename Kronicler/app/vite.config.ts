import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA (Foundations-before-auth handoff §3): installable + offline app shell so
// the app opens on a phone with no connection. Configured conservatively —
// autoUpdate + skipWaiting + clientsClaim + cleanupOutdatedCaches — so a new
// deploy always wins and no one is stranded on a stale cache. Only the built
// app shell is precached; Supabase calls always go to the network (they are
// never precached, so reads/writes hit the live DB when online).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Kronicler",
        short_name: "Kronicler",
        description: "Write your story; the world keeps itself.",
        theme_color: "#FCFAF4",
        background_color: "#FCFAF4",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: { port: 5173 },
});
