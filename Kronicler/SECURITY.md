# Security reference

Living doc. The security-hardening pass of the Foundations-before-auth handoff
produced it; update it whenever the posture changes.

## Threat model in one line

Kronicler is a multi-tenant app where **guests are real Supabase anonymous
users**. Every guest is an authenticated principal with a `uid`, so the security
boundary is **Row-Level Security keyed on `owner_id = auth.uid()`**, not secrecy
of the client key. A guest is a potential attacker with a valid token — the
same scrutiny as any signed-in user.

## Database (Supabase, project `lluszbukkqlohzvjdajb`)

### RLS
All 16 public tables have `rls_enabled = true` with an owner-scoped policy
(`owner_id = auth.uid()`, or the equivalent join to `worlds`). Verified against
`pg_policies` and the security advisor.

### SECURITY DEFINER functions — fixed in migration `0031`
SECURITY DEFINER runs as the definer (postgres) and **bypasses RLS**, so any
such function reachable by `anon`/`authenticated` is a privilege boundary. Audit
of the six definer functions found four that were needlessly client-exposed:

| Function | Problem | Fix |
|---|---|---|
| `purge_expired_trash(interval)` | No auth check, no owner scoping — deletes expired trash for **every** user. A guest could pass a zero/negative interval and wipe all users' soft-deleted content before the 30-day grace period. | `REVOKE EXECUTE` from `anon`, `authenticated`, `public`. Only caller is the daily cron `kronicler-purge-expired-trash`, which runs as postgres — unaffected. |
| `_seed_sample_world(uuid)` | Takes an arbitrary `owner` — seed junk **into another user's account**. | `REVOKE EXECUTE`; still called internally by `seed_sample_world()`. |
| `_apply_sample_prose(uuid)` | Takes an arbitrary `world`, bypasses RLS — write prose **into a victim's world**. | `REVOKE EXECUTE`; internal only. |
| `_anchor_sample_states(uuid)` | Same cross-tenant write vector. | `REVOKE EXECUTE`; internal only. |

Left client-callable **by design**:
- `seed_sample_world()` — no args, seeds a world owned by `auth.uid()`; guests
  need it for the example world.
- `purge_trash_item(kind, id)` — already checks `auth.uid()` and `owner_id`
  before purging, so a guest can only purge their own trash.

Because `seed_sample_world()` is itself SECURITY DEFINER, it keeps calling the
now-revoked helpers as the definer — guest onboarding is intact. Verified live:
the four functions report `anon_exec=false, auth_exec=false` after the migration.

### Advisor findings deliberately left as-is
- **"Anonymous Access Policies" on every `public.*` table** — expected. Guest
  mode intentionally uses anonymous auth; the policies are owner-scoped, so an
  anon principal only ever sees its own rows.
- **"Leaked Password Protection Disabled"** — moot. Auth is passwordless
  (Google OAuth + email magic link + guest); there are no passwords to leak.

## Client XSS surface

`RichProse.tsx` is the only place the app writes to `innerHTML` (the
contentEditable prose decorator). **No DOMPurify is used, and it isn't needed**:
`decorateHtml` builds the markup itself and every interpolated value is either

- passed through `escapeHtml` (which escapes `& < > " '`) — this covers all
  user-authored text **and** the `data-id` / `data-type` attribute values, or
- from a fixed, non-user set: emphasis tags are the literals `strong`/`em`/
  `both`, and the swatch token comes from the 12-value `ENTITY_SWATCHES` enum.

There is no path by which user content reaches the DOM unescaped, so adding a
sanitizer would be redundant weight over markup we fully control. If prose HTML
ever gains a channel that echoes user input verbatim (e.g. raw pasted HTML),
revisit this decision and add DOMPurify at that boundary.

## Secrets

- `.env.local` is gitignored; only `.env.example` (placeholder key) is tracked.
- The committed key in `app/src/lib/supabase.ts` is the `sb_publishable_` (anon)
  type — designed to ship in the browser. No `service_role` key or secret key
  exists anywhere in the tree or history.
- **gitleaks** (`.gitleaks.toml` + `.github/workflows/gitleaks.yml`) scans every
  push/PR. The config allowlists `sb_publishable_` keys only; secret keys and
  `service_role` JWTs still trip it. Full-history scan (233 commits) is clean.

## HTTP headers (`app/vercel.json`)

Shipped now — safe for this app (not meant to be framed, uses none of the gated
APIs):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`

### Content-Security-Policy — TEST ON A PREVIEW BEFORE ENFORCING
A too-strict CSP white-screens production, so it is **not** shipped blind. The
policy below is the intended one; deploy it to a Vercel **preview** first and
exercise it with **guest mode** (which needs no email/OAuth): "Explore as a
guest" → example world seeds → open the editor and type → go offline and capture
a note. That path alone exercises every directive that matters — `script-src`
(app boot), `style-src` (inline styles), `connect-src` (Supabase), and the
service worker. Promote the CSP once the console is clean.

CSP does **not** govern OAuth — `signInWithOAuth` is a top-level navigation away
to Google, not a page fetch — so Google sign-in being unconfigured is irrelevant
to this test.

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none'
```

Notes for the test:
- `style-src 'unsafe-inline'` is required — the UI uses React inline `style`
  props throughout. Removing it needs a full move to classes; not worth it.
- `script-src 'self'`: watch the PWA service-worker registration. If
  vite-plugin-pwa injects an inline register script, it needs a hash added here
  (or switch `injectRegister` to a self-hosted file). This is the most likely
  thing to break — verify SW registration in the preview.
- `connect-src`: add the analytics ingest origin **only if** `VITE_ANALYTICS_URL`
  is set. Google OAuth is a top-level navigation, not a fetch, so it needs no
  `connect-src` entry.

## Open / deferred
- Error monitoring (Sentry/GlitchTip) — needs an SDK + DSN (infra decision), so
  deferred.
- Automated cross-tenant RLS test suite (pgTAP with two users) — posture is
  verified by advisor + policy audit + the `0031` fix; a standing test suite is
  a backlog item.
