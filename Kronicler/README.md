# Kronicler

A relational engine for fiction writers and worldbuilders — typed, timeline-anchored
relationships between characters, places, and factions, with the manuscript living
inside the tool.

Source of truth: [`docs/PRD-v2.md`](docs/PRD-v2.md). `docs/PRD-v1.md` is kept for
historical context only — v2 supersedes it in full.

## Status: engine proven — next is the first touchable UI

Build order (PRD v2 §14), current position marked:

1. **Schema** ✅ — `migrations/0001`, refined by `migrations/0003`
   (obligation valence family + `is_terminal`, from the prototype study)
2. **Soft-delete + starter vocabulary seeding** ✅ (auto-seeds on world create)
3. **The signature query (Relationships Stream)** ✅ — `migrations/0002`,
   proven against synthetic data; Core CRUD comes free via Supabase/PostgREST
4. The editor + in-prose write path + mention scan ← **next; design ratified
   in `prototype/interaction-prototype-v2.jsx`**
5. Doc view + chapter Brief
6. Shell IA, Overview, search + ⌘/Ctrl+K
7. Graph lens
8. Thread view, saved views, export
9. Migrate the Zoonya slice, then outside writers
10. Everything in PRD §6 (non-goals) — only after validation

The live schema is deployed to the dedicated **Kronicler** Supabase project.
`prototype/` holds the ratified interaction design (write path + IA); its
design tokens are the emerging design language for the real UI.

## What's in the schema

Seven tables, matching PRD v2 §5 one-to-one:

- **`worlds`** — the top-level container. Owned by a user (`owner_id`), not shared —
  collaboration later means adding a `world_collaborators` table, never migrating
  every other table's ownership column.
- **`entities`** — characters, places, factions, anything else. Has `aliases[]`:
  load-bearing, not decoration — it's how "Slitherers" resolves to the entity
  titled "Lower Order Races" everywhere the app needs to recognize a mention.
- **`relationship_types`** — the writer's own vocabulary (ally, rival, owes,
  whatever the story needs). Every new world is seeded with ~10 starter types so
  you're never staring at a blank dictionary; they're fully renameable and
  deletable, no different from ones you mint yourself.
- **`relationships`** + **`relationship_participants`** — built multi-party from
  day one (a treaty between five factions is one relationship, not five pairwise
  ones), even though the UI will only render pairs at first.
- **`relationship_states`** — the append-only timeline. A relationship's history
  is a sequence of these rows, never an edited single row — that's what makes
  "every betrayal, in story order" a plain query instead of a special feature.
  Knowledge (`known_by`) is exception-only: everyone's assumed to know a state
  by default, and you only ever record the cases where someone's being kept in
  the dark.
- **`chapters`** + **`chapter_versions`** + **`chapter_entities`** — your actual
  draft prose lives here, versioned on every save so nothing is ever silently
  lost. Chapters never appear as nodes in the relationship graph; a chapter's
  "what happened here" is always computed from `relationship_states`, not
  hand-maintained.

Every table that represents a real thing (not a join or immutable log) supports
soft-delete (`deleted_at`) — nothing is ever hard-deleted, per the trust
requirements in PRD §10. Row-level security is on everywhere, scoped through each
table's world, so one writer's data is never reachable by another's.

## Not yet decided

Which Supabase project this schema gets applied to — pending a call before
anything is pushed live.
