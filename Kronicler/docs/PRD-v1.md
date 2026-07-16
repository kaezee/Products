# Kronicler — Phase 1 PRD

## 1. Problem

Fiction writers and worldbuilders track relationships between characters, places, and factions using tools that store information but don't understand it. Existing options (Scrivener, Notion, World Anvil, Campfire, Obsidian) either:

- store relationships as unlabelled links (Obsidian) — no meaning, no queryability
- store them as generic properties (Notion, World Anvil) — labellable, but not temporal, not queryable as a timeline, and not native to the tool's own logic
- don't model relationships at all (Scrivener) — a binder of documents, no connective layer

None of them can answer: *"show me every betrayal in this cast, ordered by story chronology"* — or catch the single most common failure mode reported by novelists across review sources: a character referencing knowledge they shouldn't have yet, because the tool has no concept of what's been revealed, to whom, as of which point in the story.

## 2. Goal for phase 1

Validate one hypothesis: **a writer will trust and prefer typed, timeline-anchored relationships over unlabelled links or freeform notes, enough to migrate real, active work into the tool and keep using it.**

Phase 1 is explicitly a validation build, not a feature-complete v1. Success is defined in §9, not by feature count.

## 3. Non-goals (explicitly deferred, not forgotten)

- Multi-user collaboration (schema is built to support this later — see §4 — but no collaboration UI ships in phase 1)
- MCP/AI layer — optional, additive, sits on top of the same schema whenever it's built
- Contradiction-checking automation — phase 1 stores the writer/reader-knowledge field; auto-flagging contradictions is a defined v2 feature, not phase 1
- Relationship "consequence" rules engine (e.g. indebted-to auto-flagging leverage) — real idea, deferred until a writer hits the wall without it
- Freeform manual canvas (Obsidian-Canvas equivalent, for beat-sheet/pacing planning) — motivated, deferred, doesn't touch core schema
- Custom in-world calendar system — story-time ships as a simple ordinal integer in phase 1
- Any theming/cosmetic customization beyond the locked design system

## 4. Target users

- Primary: solo fiction writers / worldbuilders managing a cast and world large enough that unlabelled notes stop working (proxy: Kaezee's own Zoonya universe — 100+ entities, layered factions, multi-season plot)
- Longer-term (not phase 1): game narrative designers — same entity/relationship model, different audience. Confirmed the data model doesn't need to change to serve this audience later.

## 5. Core data model

### 5.1 Ownership (decided specifically to avoid a future migration)

```
worlds (id, owner_id)
entities (id, world_id, type, title, body, tags)
```

Entities are owned by a `world`, not directly by a user. This is the one schema decision made purely for future-proofing: adding collaborators later means adding a `world_collaborators` join table, not migrating every table's ownership column.

### 5.2 Relationship types — writer-extensible, not a fixed enum

```
relationship_types (id, world_id, label)
```

Writers define their own vocabulary per world (confirmed: fantasy/worldbuilding needs custom vocab, a fixed enum would need painful migration later).

### 5.3 Relationships — multi-party from day one

```
relationships (id, world_id, type_id)
relationship_participants (relationship_id, entity_id, role)
```

Built as multi-party (not just pairwise A↔B) because group relationships (treaties, conspiracies, factions) are common in worldbuilding and retrofitting pairwise → multi-party later would change the table shape, not just add a column. Decided now specifically because it's expensive to redo.

### 5.4 Relationship states — the append-only timeline core

```
relationship_states (
  id,
  relationship_id,
  type_id,               -- can change over time (ally → rival)
  story_time_ref,        -- simple ordinal integer for v1, not a custom calendar
  manuscript_ref,        -- FK to chapters.id — where this was revealed to the reader
  is_correction,          -- true if this row is a typo/edit fix, not a real story event
  known_by,               -- which POV entities/characters know this, as of this state (writer/reader-knowledge)
  note
)
```

This table is append-only: a relationship's history is a sequence of states, not a single mutable row. This is what makes "show me every betrayal ordered by chapter" and "track the ally→rival transition as a story beat" both simple queries rather than special features.

`is_correction` exists so the timeline-of-record isn't polluted by someone fixing a typo. `known_by` exists so dramatic-irony tracking (reader knows before character X does) has a home in the schema even before any UI surfaces it.

### 5.5 Chapters — a separate entity type, not a graph node

```
chapters (id, world_id, title, manuscript_order, story_time_ref)
chapter_entities (chapter_id, entity_id, role)   -- 'pov' | 'mentioned' | 'present'
```

Chapters are manuscript structure, not participants in typed relationships — they don't belong in the `relationships` table. A chapter's connection to the relational engine is indirect: `relationship_states.manuscript_ref` points at a chapter, so a chapter's "what happened here" view is a query (`relationship_states WHERE manuscript_ref = this_chapter`), not a hand-authored list. This is also why chapters must never be forced onto the same visual surface as characters/places — at scale (hundreds of chapters), that surface breaks; chapters get their own scoped, independent view.

## 6. IA & navigation — requirements, not a locked layout

**Status: intentionally unresolved as a final design.** Multiple full mockups were attempted and rejected during scoping; rather than lock a wrong layout, this section documents the hard requirements any IA solution must satisfy, plus the open questions still to resolve before design work proceeds. Treat this as a spec for the IA, not the IA itself.

### 6.1 Jobs to be done (the actual basis for any navigation decision)

1. Orient — "what's changed or needs attention since I was last here"
2. Read/write a single thing — a character, place, faction, chapter — with its relationships visible alongside it, not in a separate mode
3. See the whole shape of the world — pattern-spotting, visual, spatial — genuinely different in kind from #2, the only job that needs a spatial canvas
4. Find something by content ("what mentions the locket") — distinct from:
5. Jump to a known entity by name, fast, from anywhere, with create-new built in
6. Configure the world — relationship vocabulary, settings, account

### 6.2 Hard constraints (non-negotiable, derived from direct feedback in scoping)

- **Search must be universal and persistent, not buried in a rail icon or a mode.** A visible search entry point must be reachable from every screen, not something the user switches into.
- **Quick-jump (switcher) and content search are two different interactions and must not be merged**: switcher = "I know the name, get me there or let me create it," reachable via global keyboard shortcut from anywhere; content search = "find by what's inside," a scoped, deliberate search action.
- **Any list-style view (characters, places, factions, chapters) must scale to 1000+ rows without degrading**: virtualized rendering (only visible rows in the DOM), per-type search/sort/filter, no shared scroll across entity types. Entity-type tabs/filters must stay a fixed, small count regardless of how many rows exist inside any one of them.
- **Characters and chapters must never share a single browsing list or scroll.** Confirmed directly as a rejected pattern — mixing them causes exactly the bloat this constraint exists to prevent.
- **The graph/relational canvas (auto-generated from `relationship_states`) and any future freeform/manual canvas (Obsidian-Canvas equivalent) are different tools solving different jobs and must not be collapsed into one view.** Graph is automatic and derived from data; a manual canvas (deferred to v2) is hand-arranged and outside the schema. Conflating them was an identified mistake during scoping.
- **A doc view for any entity must show its typed connections woven into the page itself** (not a competing side panel fighting for space), following the pattern validated from Obsidian's linked/unlinked-mentions section — but grouped by relationship type with story-time/chapter context, not by source document.
- **"Unlinked mentions"-equivalent must exist**: surfacing plain-text mentions of an entity that haven't been formalized into a typed relationship yet.
- **The relational canvas must not force a fixed-width side panel that competes with the graph for space** at any entity count — whatever selection-detail mechanism is used, it must not degrade as the graph grows.

### 6.3 Open questions to resolve before IA design work resumes

- Exact interaction for viewing an entity's connections while inside the spatial canvas (peek vs. panel vs. something else) — attempted twice, not yet accepted.
- Whether relationship vocabulary management (§5.2) lives inside Setup or contextually inside the entity/relationship UI itself.
- Dashboard's relationship to the rest of the IA — confirmed as home/orientation screen, not yet reconciled with whatever final navigation shape is chosen.

## 7. Friction-research-derived requirements (v1, cheap, high trust payoff)

Sourced from direct review research (Trustpilot, Google Play, forum complaints) on World Anvil, Campfire, Scrivener, Notion story-bible use:

- **Soft-delete / undo on all entity types.** No hard deletes. Cited complaint: "how can a writing app not have a trash can?"
- **Orphaned/unlinked entities must stay discoverable**, never silently disappear for lack of a relationship or section membership.
- **Full-text search across all entity content ships in v1**, not v2 — direct fix for the "ctrl-F, 14 results, give up and guess" failure pattern.
- **Never gate access to a writer's own already-created content behind a paywall**, regardless of future pricing model. Cited complaint: a tool capping free-tier article count below what a long-time user had already created, locking them out of editing their own past work.
- **Never cap a core entity type (e.g. characters) on a free tier** — cap something peripheral if tiers exist at all.
- **Avoid deep cosmetic customization in phase 1** — cited as an active procrastination trap in review data ("writers spend hours prettifying the tool instead of writing").

## 8. Business model notes (directional, not final)

- Value metric: access to the relational engine (typed queries, timeline tracking, contradiction-checking once built), not entity count or seats — free tier should feel like parity with Notion/Obsidian's free tier; paid tier is the differentiator layer only.
- Billing shape: default to low-cost ongoing subscription (justified by real per-user hosting cost, unlike local-first tools like Scrivener/Obsidian); consider a time-boxed or capacity-capped "founding writer" lifetime offer for early cash flow and goodwill, sunset once usage data exists.
- Pricing figures above are directional — no willingness-to-pay research has been run yet against actual target writers. Van Westendorp or similar study recommended before locking numbers.

## 9. Validation criteria — how phase 1 succeeds

Phase 1 is validated if: the Zoonya universe (or a meaningful slice of it) is migrated in, and used for real active work — not toy data — over a sustained period (proposed: 3–4 weeks) without reverting to the old notes/Obsidian setup out of frustration. "Built and feature-complete" is not the success condition; sustained real use is.

## 10. Explicit build-order priority (engine before UI polish)

1. Schema (§5) — worlds, entities, relationship_types, relationships, relationship_participants, relationship_states, chapters, chapter_entities
2. Core CRUD (create/read/update/soft-delete entities and relationships)
3. The signature query: relationship states filterable and orderable by story-time or manuscript order (this is the feature that answers "why Kronicler over a spreadsheet")
4. Doc view with typed connections + unlinked mentions
5. Migration path for a real slice of the Zoonya vault (manual entry is acceptable for phase 1 — the point is real content, not automated import)
6. IA/navigation implementation, once §6's open questions are resolved
7. Everything in §3 (non-goals) — only after phase 1 validates the core hypothesis
