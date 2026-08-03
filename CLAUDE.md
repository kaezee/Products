# Working conventions for this repo

Guidance for AI coding agents (Claude Code) working here. Kept short on purpose —
this file loads into every session, so verbosity here is itself token waste.

## Write the minimum code — the "lazy senior dev" ladder (adapted from Ponytail, MIT)

Before writing new code, walk this ladder and stop at the first rung that works:

1. Does it need to exist at all? (YAGNI — the best code is the code you never write.)
2. Is it already in this codebase? Reuse it.
3. Standard library / language built-in?
4. A native platform or framework feature?
5. An already-installed dependency? (Don't add a new dep for a small job.)
6. A one-liner?
7. Minimum viable implementation.
8. Full custom solution — only as a last resort.

Be lazy about *solutions*, never about *understanding*: still read enough to get the
context right. Never trim validation, error handling, security, auth, or
accessibility to save lines — those are the necessary code, not the fat.

## Context / token hygiene

- Read narrowly: targeted Grep and specific line-ranges over whole-file Reads. Don't
  re-read a file you (or the harness) already have in context.
- Don't re-paste large payloads (big SQL, long file bodies) into tool calls or chat —
  reference the file instead.
- Batch independent tool calls in one turn; prefer scoped Edits over rewrites.
- On MCP/DB tools, use `minimal_output`/pagination and select only the rows/columns
  needed.
- Fan-out searches across many files → an Explore subagent, so raw dumps stay out of
  the main thread.
- Match the surrounding file's comment density and idioms; no narration comments.

## Project facts (so you don't re-derive them)

- Monorepo: **Kronicler** (React 18 + TypeScript + Vite + Supabase) and **Paisev**.
- Decisions of record: `Kronicler/ux/DECISIONS.md` — read it before reversing any
  naming / IA / schema call.
- DB changes are **additive-only** while a legacy build shares the same Supabase
  project; never rename/drop a column or table the old build reads.
- Schema words never appear in the UI (e.g. `world_id` stays in code; users see
  "project" / "world").
