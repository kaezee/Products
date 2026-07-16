# Kronicler — Phase 1 PRD, v2

> v2 supersedes v1 in full. Major changes: manuscript text now lives inside the product (§7 — the single largest decision since v1); the write path is specified as a first-class design problem (§8); IA is resolved from "requirements only" to a locked four-scope shell (§9); the structure-vs-dictionary doctrine is stated as positioning (§3); validation criteria are sharpened and de-biased (§12). Sections marked **[locked]** are settled; **[open]** items are listed in §13 only.

---

## 1. Problem

Fiction writers and worldbuilders track relationships between characters, places, and factions using tools that store information but don't understand it. Existing options fail in two distinct ways:

- **Knowledge tools** (Obsidian, Notion, World Anvil, Campfire) store relationships as unlabelled links or generic properties — no types, no time, no queryability. Users compensate with hand-maintained structure: MOC index pages, folder taxonomies, naming conventions. The "system" is unpaid user labor, and it goes stale.
- **Writing tools** (Scrivener, Word) hold the manuscript but model no relationships at all — a binder of documents with no connective layer.

None can answer *"show me every betrayal in this cast, ordered by story chronology"* — or catch the most common failure mode reported by novelists: a character referencing knowledge they shouldn't have yet, because no tool knows what's been revealed, to whom, as of which point in the story.

**Competitive framing (revised in v2):** Kronicler competes on manuscript **coherence** — keeping a long, entangled story true to itself while it's written. Scrivener competes on manuscript **production** — compile, format, publish. Because the manuscript now lives inside Kronicler (§7), Scrivener is a partial competitor; the battle is fought only at the editor surface, and only to the bar defined in §7.2. Kronicler never enters the production fight (no compile pipeline, no formatting engine, no publishing export).

## 2. Hypothesis for phase 1

v1's hypothesis (writers will prefer typed, timeline-anchored relationships over unlabelled links) was a **reading** hypothesis. The real risk is on the **write** side. Restated:

> **The cost of recording a fact can be driven below the value of recalling it — low enough that a writer migrates real, active work into Kronicler, drafts real chapters inside it, and keeps using it.**

Every competitor died on the recording side of this inequality (World Anvil's form friction is the canonical case), not the recall side. Phase 1 is a validation build for this inequality. Success is defined in §12, not by feature count.

## 3. Doctrine: opinionated structure, writer-owned dictionary **[locked]**

This is positioning, not a design note.

- **The engine owns structure, non-negotiably.** Kronicler arrives already knowing what a story world is made of: entities, chapters, typed relationships, append-only states, two time axes, unevenly distributed knowledge. These six opinions are the product. They are not customizable. A blank engine (Notion, Obsidian) transfers the design job to the user; Kronicler refuses to.
- **The writer owns meaning, sovereignly.** Every label, every relationship type, what any of it signifies — the writer's dictionary, never hardcoded. The engine manipulates only what it can verify (existence, connection, change, time, knowledge distribution); it never assumes semantics. There is no built-in concept of "betrayal" — a romance writer's vocabulary may be "yearning for / promised to / estranged from."
- **Sovereignty never means starting from zero.** Worlds are seeded with a starter vocabulary (§5.2). Starter types are seed data, not system data: no special status, fully renameable and deletable; the engine treats them identically to writer-minted types.
- **The customization test** for every future request: is it semantics or structure? Semantics → the writer's, always was. Structure → the product's; the answer is no.

Corollaries: no custom entity fields in phase 1, no configurable layouts, no theming (carried from v1 §7 research — cosmetic depth is a documented procrastination trap), no user-defined schema.

## 4. Target users

- **Primary: solo fiction writers / worldbuilders**, in two states the product must serve equally:
  - **Migrating** — an existing manuscript and world elsewhere (proxy: the Zoonya universe — 100+ entities, layered factions, multi-season plot). Entry path: paste/import per chapter; the mention scan (§7.4) immediately lights up their own cast in their own prose.
  - **Starting** — drafting natively from chapter one; the world accretes as a side effect of writing.
- Longer-term (not phase 1): game narrative designers — same entity/relationship model. Confirmed the data model doesn't change to serve them later.

## 5. Core data model

### 5.1 Ownership (unchanged — future-proofing decision stands)

```
worlds   (id, owner_id)
entities (id, world_id, type, title, aliases[], body, tags)
```

Entities are owned by a `world`, not a user; collaborators later = a join table, not a migration. **v2 change:** `aliases` is now a schema field. It is load-bearing, not cosmetic: the quick switcher (§9.5) and the mention scan (§7.4) must match "Slitherers" to an entity titled "Lower Order Races," or they silently miss half the manuscript. Fantasy casts run on aliases.

### 5.2 Relationship types — writer-extensible, semantically annotated **[v2 changes]**

```
relationship_types (id, world_id, label, valence, color, is_ambient)
```

- `valence` / `color` — optional, writer-set at mint time or later in Settings. Drives edge color in the graph, mark emphasis in thread views, "major beat" weighting. Default: neutral. **The engine never infers meaning from a label string.**
- `is_ambient` — marks types not expected to change (member of, located in). Ambient types are excluded from the dormant-thread detector (§9.2) and rendered structurally (muted) in the graph. This replaces any hardcoded type-name lists — there are none.
- **Starter vocabulary:** every new world seeds ~10 neutral, genre-agnostic types (ally, rival, family, member of, located in, knows about, owes…), valences pre-set sensibly, all editable/deletable per §3. Solves the cold-start blank-page tax that the founder's own migration (§12) is structurally blind to.
- Vocabulary management is dual-surface: inline creation via type-ahead wherever a relationship is recorded; rename/merge/delete-with-reassignment (destructive, global) only in Settings, with usage counts shown.

### 5.3 Relationships — multi-party from day one (unchanged)

```
relationships             (id, world_id, type_id)
relationship_participants (relationship_id, entity_id, role)
```

Schema stays multi-party (treaties, conspiracies, factions); retrofitting is expensive. **Phase 1 UI renders pairwise only** — multi-party rendering is a defined open question (§13), not a schema question.

### 5.4 Relationship states — the append-only core **[v2 changes to known_by semantics]**

```
relationship_states (
  id, relationship_id,
  type_id,               -- can change over time (ally → rival)
  story_time_ref,        -- ordinal integer; see progressive disclosure, §9.4
  manuscript_ref,        -- FK chapters.id — where revealed to the reader
  is_correction,         -- typo/edit fix, not a story event
  known_by,              -- EXCEPTION-ONLY; see below
  note                   -- may be authored prose captured from the draft (§8)
)
```

Append-only: a relationship's history is a sequence of states. This is what makes "every X ordered by chapter" and "track the ally→rival transition" simple queries.

**`known_by` default semantics (locked):** participants and the reader know every state **by default, at zero input cost**. The writer only ever annotates the exception — a concealment, a secret, an off-page event. Rationale: a field writers won't maintain is worse than no field; a chapter brief (§7.5) that confidently asserts wrong knowledge kills trust in all briefs. ~90% of states must require zero knowledge input.

**Beats are states.** There is no separate beats system: a state change *is* a story beat, and beat sheets are derived views (Relationships stream, filtered by valence/weight). A per-state `significance` flag is a possible one-column v1.5, not a system.

### 5.5 Chapters — now carry the manuscript **[v2: largest structural change]**

```
chapters         (id, world_id, title, manuscript_order, story_time_ref, body)
chapter_versions (id, chapter_id, body, created_at)
chapter_entities (chapter_id, entity_id, role)   -- 'pov' | 'mentioned' | 'present'
```

- `body` is the actual draft prose. `chapter_versions` is non-negotiable in phase 1: writers forgive a lost tag, never a lost paragraph.
- Chapters remain manuscript structure, **not graph nodes** — they never join the relationships table and never render as peers of entities on the graph. Their connection to the engine is indirect (`relationship_states.manuscript_ref`), so a chapter's "what happened here" is a query, not a hand-authored list.
- `chapter_entities` rows are largely derived by the mention scan (§7.4) and confirmed by the writer, not hand-entered.

## 6. Non-goals (explicitly deferred, not forgotten)

- **Manuscript production**: compile, formatting engine, EPUB/print export, submission tooling — never phase 1, likely never (see §1 framing)
- Multi-user collaboration (schema-ready; no UI)
- MCP/AI layer — additive on the same schema, later
- Contradiction-checking **automation** — phase 1 stores the knowledge field; auto-flagging is v2 (note: the in-editor knowledge warnings in §7.5 are *displays of stored fact*, not inference — they are phase 1)
- Consequence rules engine (indebted-to auto-flagging leverage)
- Freeform manual canvas (Obsidian-Canvas equivalent) — deferred; **must never be conflated with the derived graph** (§9.3); enters later as a lens or Manuscript-adjacent surface, never a fifth rail scope
- Custom in-world calendar; story-time stays an ordinal integer
- Theming/cosmetics; custom entity fields (§3)
- Time-lapse "play" animation on the graph scrub — demo value only; ships only if literally a timer stepping the scrub, never a specced feature

## 7. The editor — the engine's sensor **[new in v2, locked]**

### 7.1 Decision
Manuscript text lives inside Kronicler. Both writer states (§4) require it, and it is the delivery mechanism for the §2 hypothesis: with text and schema in one place, recording can happen inside writing (§8) — which no competitor can replicate, because none holds both.

### 7.2 The bar
The editor is not the product; it is the engine's sensor. The bar is **"writing here is never a sacrifice,"** not "beats Scrivener": absolutely trustworthy autosave, version history, clean typography, focus mode, word counts — and nothing else. Any editor feature request beyond this list is tested against §1's framing before consideration.

### 7.3 Trust escalation
Holding a manuscript is a higher trust tier than holding metadata. Consequences, both phase 1: `chapter_versions` (§5.5), and the export guarantee (§10) hardens from goodwill line to non-negotiable.

### 7.4 Live mention scan
As the writer types (or pastes, for migrators), prose is scanned against entity titles **and aliases**. Matches not yet formalized surface quietly in-draft — one tap to link or to formalize into a typed relationship. This replaces "unlinked mentions" as a forensic report with a live capture surface, and it is the migrating writer's first-hour payoff.

### 7.5 The brief drawer & knowledge lines
The chapter brief (§9.2, Manuscript scope) is toggleable *beside the editor*: everything true as this chapter opens, computed from states — current states among the present cast, knowledge exceptions ("Odran doesn't know the locket burned — don't let him reference it"), dormant threads touchable in this scene. Warnings appear where they prevent the error — at the draft — not in a report read later. This is v1 §1's headline failure mode solved preventively.

## 8. The write path **[new in v2 — next design sprint]**

The most important surface in the product. Principles locked; interaction detail is the top open question (§13).

- **Primary capture is in-prose.** The writer selects the sentence where a fact lands and marks it: state change → participants → type (type-ahead over the dictionary, mint inline). `manuscript_ref` sets itself (you're in the chapter); `story_time_ref` inherits from the chapter; the selected prose becomes the state's `note`. Recording cost approaches zero because it happens at the moment of authorship.
- **Secondary capture is sentence-shaped, not form-shaped**, available anywhere via the global create flow (⌘K): one line typed like prose, not a modal of dropdowns. Writers are fast at sentences and slow at forms.
- **Knowledge exceptions are markable from the same selection** (mark as concealed-from → picks who doesn't know). Consistent with §5.4: only exceptions cost input.
- **Corrections vs. story changes:** when editing an existing state, the UI must ask which it is (`is_correction`), cheaply. Interaction open (§13).
- **Capture inbox:** a global zero-decision capture action (the useful half of Obsidian's daily note); contents feed Overview's triage queue. No filing at capture time, ever.

## 9. IA — locked shell **[replaces v1 §6 in full]**

### 9.1 The shell

**Global chrome (every screen):** world switcher (world config reachable from it) · persistent universal search field · ⌘K affordance. **Rail — four work scopes:** Overview, Library, Manuscript, Relationships. **Rail foot, outside the work area:** Settings, Account.

The rail maps one-to-one onto the schema: Library = `entities`, Manuscript = `chapters`, Relationships = `relationship_states`, Overview = a query across all three, Settings = `relationship_types` + config. **Governing rule: destinations are scopes; everything else is a lens inside a scope.** New capability never earns a rail item — it earns a tab inside the scope whose table it reads. This rule closes the sidebar-bloat failure mode structurally.

**Naming principle:** structure derives from the schema; language derives from the writer's vocabulary. `relationship_states` is a fine table name and a terrible menu item. ("Relationships" ships for validation; "Chronicle" is the branded alternative — watch for hesitation in §12 before considering it.)

### 9.2 Scope contents

- **Overview** — read-only orientation; owns nothing, links everywhere. Recent state changes (wall-clock order), unlinked-mention queue, capture inbox triage, orphaned entities, dormant-thread flags (keyed off `is_ambient`, never type names). Default landing.
- **Library** — all entities. Fixed small tab set per type (Characters/Places/Factions + writer-minted types, created in Settings with a type-vs-tag nudge and an overflow pattern past ~5). Each tab: its own virtualized list (1000+ rows), own scroll, per-type search/sort/filter; recency sort default (floats active work). **Saved views** (named filter+sort+grouping configs) are the sectioning mechanism — cheap, writer-created, sibling tabs; they answer "custom lists" without minting types. Entity page lenses: **Document** (body; connections woven in, grouped by relationship type with story-time/chapter context and expandable state history; appears-in, visually distinct per §5.5; unlinked mentions w/ one-tap formalize) and **Thread** (lanes per relationship against the chapter axis; marks are states; dormant lanes flagged; axis toggles per §9.4). Browsing is the designed-against failure state: facets, recency, and ⌘K keep it rare; virtualization keeps it fast.
- **Manuscript** — all chapters; never shares a list, tab, or scroll with entities. Order toggle manuscript ↔ story time (per §9.4). Chapter page lenses: **Document** (the editor, §7) and **Brief** (§7.5).
- **Relationships** — world-scoped states; two lenses over one persistent filter set (type, participant, known-by, as-of scrub — filters survive lens switches): **Stream** (the signature query: filterable, orderable by either axis; the answer to "why Kronicler over a spreadsheet"; derived beat sheets live here) and **Graph** (§9.3).
- **Settings** — vocabulary CRUD (destructive ops here only, usage counts shown), entity types, world config, export, account.

### 9.3 Graph constraints **[locked]**

Value test for every graph capability: *it must answer a question a writer actually has that no list or timeline can.* The graph answers: structural diagnosis (clusters = subplots; single-bridge nodes = load-bearing characters), development asymmetry (thin factions visible), the temporal scrub (world as-of any chapter), the knowledge lens (the world as any character believes it — dramatic irony as a spatial object), typed sub-networks (the debt economy; each type an overlay).

- **Ego view is the default**; whole-world is the deliberate zoom-out. At 100+ entities the unfiltered global graph teaches nothing.
- **Controls are named questions (lenses), never physics sliders.** No forces panel, no repel strength, no text-fade knob — configuration-in-place-of-purpose is the prettify trap (§3 corollaries, v1 §7 research).
- **Layout stability:** deterministic across sessions for an unchanged world; additions perturb locally, never reshuffle globally. Spatial memory is the point of a spatial view. Optional node pinning is v1.5 (pins position, never authors edges).
- **Managed camera:** the writer never does camera work. Every query/lens change auto-frames; arrival via search hand-off arrives framed; pan is bounded to content + margin (the empty void is unreachable); one-action recovery (fit-to-view) always available; semantic zoom (labels and detail scale with meaning — degree, state count, recency — not manually).
- **Selection is a peek, not a panel:** floating, draggable, pinnable card; summary + "Open document / Open thread"; editing never happens in the graph. No docked fixed-width panel at any entity count.
- The graph is rendered space (a camera over a computed layout); the deferred manual canvas is authored space. Never conflated (§6).

### 9.4 Story time — progressive disclosure **[locked]**

`story_time_ref` stays in the schema (retrofitting temporal data is miserable) but the **UI shows no second axis until the story diverges**: it mirrors manuscript order silently, with no toggle anywhere. The first time a writer marks a chapter out of sequence, the axis wakes across the product (Manuscript order toggle, thread-view axis, stream ordering). Linear writers never learn the concept exists; nonlinear writers get it the moment they need it.

### 9.5 Find / narrow / go-to — three verbs, never merged **[locked]**

- **Find** — universal search: persistent visible field, every screen; full-text over entity docs + aliases, chapter prose, state notes, captures. Output is always a results page grouped by scope; verb is always *navigate*; it never reshapes the view you're standing in. Results integrate: unlinked-mention badges inline (search as capture point), and a **"show N entities in graph" hand-off** (matched entities + participants of matched states → graph pre-filtered, camera framed). State-note results are a category no competitor can return.
- **Narrow** — lens filter bars: scoped, stateful, reshape in place. Applied lenses render visually *on* (a writer who forgets they're inside a character's knowledge-view is a continuity error waiting to happen).
- **Go to** — ⌘K switcher: name/alias match, create-new inline, global; when the target is in the current lens, centers and highlights instead of navigating away.

## 10. Trust requirements (v1 §7, carried and extended)

All v1 items stand: soft-delete/undo on everything; orphans stay discoverable (badged in main lists, queued in Overview — never quarantined); full-text search in v1; never gate access to already-created content; never cap a core entity type; no cosmetic depth. **v2 additions:** full structured export — entities as markdown, relationships/states as data, chapter prose as text — one click, free tier, forever (the answer to local-first trust that a hosted tool must earn explicitly); prose version history (§5.5).

## 11. Business model notes (directional, unchanged in substance)

Value metric: the relational engine (typed queries, timeline, knowledge tracking), never entity count, seats — or, now, manuscript access (§10 makes prose hostage-taking doubly forbidden). Low-cost subscription justified by real hosting cost; time-boxed founding-writer lifetime offer worth considering; Van Westendorp before locking numbers.

## 12. Validation criteria **[sharpened]**

Phase 1 is validated if:

1. A meaningful slice of the Zoonya universe is migrated in, **and real chapters are drafted inside Kronicler**, over 3–4 sustained weeks, without reverting to the old setup out of frustration. (Drafting inside is the addition — the old criterion couldn't test the write path, which §2 says is the actual risk.)
2. **1–2 writers who are not the founder** run the same criteria. Builder survival in a builder's own tool is weak evidence; outside writers also hit the cold start (§5.2) that the founder's migration structurally skips.
3. Observed, not asked: does the writer navigate to Relationships unprompted; does the in-prose capture get used over the global create; does the brief get opened before drafting. Behavior over opinion.

## 13. Open questions (the honest list)

1. **The state composer's interaction detail** — in-prose marking flow and the sentence-shaped global create (§8). Principles locked; the screen is undesigned. **Next design sprint, ahead of everything.**
2. Multi-party relationship rendering (schema holds it; v1 UI pairwise — what's the minimal honest rendering of a 5-party pact in graph/thread/stream?)
3. `is_correction` micro-interaction on state edit.
4. Saved-view creation/management mechanics (Library and Relationships).
5. Import path for migrators beyond paste-per-chapter (docx? markdown folder?) — phase 1 can be manual; decide before any outside-writer validation.
6. Naming test: Relationships vs Chronicle (§9.1, resolved by §12 observation).
7. Pricing research (Van Westendorp) — post-validation.

## 14. Build order **[revised]**

1. Schema (§5) — including aliases, type annotations, chapter bodies + versions
2. Core CRUD + soft-delete + starter vocabulary seeding
3. **The signature query** — states filterable/orderable by either axis (Stream). The engine complete before any polish, even if raw.
4. **The editor + in-prose write path + mention scan** (§7–8) — the hypothesis delivery mechanism; sequenced immediately after the engine because §2's risk lives here
5. Doc view with woven connections; chapter Brief
6. Shell IA (§9.1–9.2), Overview, search + ⌘K
7. Graph lens (§9.3) — deliberately late: a graph over a thin states table is the screensaver this product exists to not be
8. Thread view; saved views; export
9. Migration of the Zoonya slice; then outside writers (§12)
10. Everything in §6 — only after validation
