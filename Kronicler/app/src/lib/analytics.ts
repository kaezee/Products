// Product analytics — DORMANT BY DEFAULT (Foundations-before-auth handoff §4).
//
// Records event NAMES and COUNTS only — never content. No prose, no entity
// names, no note bodies, no titles. This is a load-bearing privacy constraint
// the trust page will claim, so the event map below permits only numbers and
// short fixed enums (form/genre/source keywords) as props — there is, by
// construction, no channel for user content to leak.
//
// It stays switched OFF until both VITE_ANALYTICS_DOMAIN and VITE_ANALYTICS_URL
// are set (a self-hosted Plausible/Umami-style ingest). Without that config,
// track() no-ops: nothing is sent, nowhere. Switching it on is a config change,
// not a code change.

// The complete instrumentation plan (§4.3), in priority order. `moment_marked`
// is the number the whole product rests on. Props are numbers or fixed enums.
export type AnalyticsEvent =
  | { name: "session_start"; props: { days_since_last: number } }
  | { name: "project_created"; props: { form: string; genre: string; entry: string } }
  | { name: "chapter_created" }
  | { name: "words_written"; props: { words: number } }
  | { name: "entity_created"; props: { via: string } }
  | { name: "entity_linked_from_detection" }
  | { name: "moment_marked"; props: { source: string; chapter_words?: number } }
  | { name: "note_created"; props: { source: string } }
  | { name: "overview_discovery_clicked"; props: { kind: string } }
  | { name: "export_run" };

const ENV = import.meta.env as Record<string, string | undefined>;
const DOMAIN = ENV.VITE_ANALYTICS_DOMAIN;   // the site name registered with the ingest
const ENDPOINT = ENV.VITE_ANALYTICS_URL;    // e.g. https://plausible.example.com/api/event

const enabled = (): boolean => Boolean(DOMAIN && ENDPOINT);

// Final guard: only finite numbers and short strings survive, and strings are
// only ever passed fixed enum keywords. Belt-and-suspenders against any prop
// ever accidentally carrying content.
function clean(props: Record<string, unknown> | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.length <= 32) out[k] = v;
  }
  return out;
}

// Fire-and-forget. Never throws, never blocks the UI, never breaks the app.
export function track(event: AnalyticsEvent): void {
  if (!enabled()) return; // dormant — nothing is sent
  try {
    const props = clean((event as { props?: Record<string, unknown> }).props);
    const body = JSON.stringify({
      name: event.name,
      domain: DOMAIN,
      url: location.origin + "/",   // app root only — no path/query/content
      props,
    });
    void fetch(ENDPOINT as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,              // survives navigation / tab close
    }).catch(() => { /* swallow */ });
  } catch { /* analytics must never break the app */ }
}
