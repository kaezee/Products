# Kronicler — app

Vite + React + TypeScript frontend on the live Supabase engine.

**Phase 3 status:** foundation in place — auth (email + password), world
switcher, and the read-side (Relationships **Stream** = the signature query,
and **Library**) wired to live data. The editor, in-prose write path, mention
scan, and version history are the remaining Phase 3 work.

Styling is deliberately raw here; the real design system (the prototype's
tokens) is applied in Phase 5, not before.

## Run locally

```bash
cd Kronicler/app
cp .env.example .env.local   # already filled with the project URL + publishable key
npm install
npm run dev                  # http://localhost:5173
```

`npm run build` type-checks and produces a production bundle.

> Note: this must run somewhere with network access to `*.supabase.co`. The
> build sandbox blocks it by egress policy, so the in-browser check happens on
> your machine or once deployed — not in CI here. The data layer is verified
> against live data via the database directly.

## Config

`.env.local` (gitignored) holds `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. The anon/publishable key is safe in the browser —
Row-Level Security is what protects data, and it's enabled on every table.

## Demo data

A demo world (**Reedwater**) is seeded for a demo login — ask for the
credentials. It shows the Odran/Mirel arc (ally → rival → betrayed → enemy)
and a concealment, so both views have content on first load.
