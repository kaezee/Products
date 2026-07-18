# Kronicler — Roadmap & Backlog

A living record of what's shipped, what's queued, and the product decisions
behind them. Kept in the repo so nothing lives only in chat.

_Last updated: 2026-07-18_

---

## The product, in one line
A relational engine for fiction writers/worldbuilders: your world's cast,
places, and their **relationship history** build themselves as you write, so
"every betrayal, in chapter order" is a query — not a spreadsheet you maintain.

---

## ✅ Shipped

**Foundation (Phases 0–7 — all complete)**
- Postgres schema, per-world Row-Level Security, soft-delete everywhere.
- The signature query: an append-only stream of relationship **states** (never
  mutated), orderable by manuscript position or story time.
- Two-axis time; valence families (allied / duty / neutral / hostile) driving
  colour; ambient + terminal flags.
- Real chapter editor with trustworthy autosave + bounded version history.
- Entity pages, chapter "Brief" (what to know before this scene).
- App shell: world switcher, search, ⌘K palette, left rail, design system.
- Graph lens (force-directed, deterministic layout).

**Content & worldbuilding**
- Entities: curated type dropdown (Character/Place/Faction/Item/Event/Creature)
  + deliberate custom types; per-section + global "add"; inline delete/rename.
- Editable section names (rename a type across all its entities).
- Library search (across sections) + A–Z/Recent sort; tab strip scrolls.
- Standing connections ("X is Y's wife") declarable on a character, no chapter
  needed; connections are editable (change type, swap participant) + deletable.
- Smarter mention scan: matches name-parts, but only capitalized ones (no
  common-word false positives); dismissable cast suggestions.
- **Select-to-entity in the editor**: select a word → make it a new entity, or
  add it as an alias of an existing one (Level 1 inline linking).

**Manuscript**
- Inline chapter create; drag-and-drop reorder; inline rename (list + editor);
  delete; subtle zero-padded chapter numbers (title is fully the writer's).

**Import / scale / safety**
- `.docx` import for manuscripts (chapters) and lore (entities), with a
  preview-before-write step, smart split strategies + toggles, and set-all-type.
- Trash / restore for entities, chapters, worlds; delete + rename worlds.
- Overview "Needs attention" caps the orphan flood after an import.

**Knowledge model (verified working, kept progressive)**
- States are known-by-everyone by default; mark a state "concealed from" chosen
  characters when recording it; the "As X believes" lens reads the world through
  their eyes (concealed states vanish). The lens now **only appears once a
  secret exists** — no clutter until it's useful.

**Level 2 — the rich editor (contentEditable)**
- The chapter editor is a contentEditable surface where entity mentions are real
  inline elements, tinted by type — **hover** a name for a preview card,
  **click "Open page →"** to jump to it. Uses `contenteditable="plaintext-only"`
  so Enter→newline, plain paste, and undo are native; the body stays PLAIN TEXT
  (autosave + versions untouched) and highlights are decorations re-painted on a
  debounce with the caret preserved. Browser-verified end-to-end (typing, caret,
  newline, hover, click-through) via Playwright.

**Notes — the planning board (infinite canvas)**
- Its own rail section: a true infinite canvas. Cards live in world space — you
  **pan** (drag empty board), **zoom** (wheel toward the cursor, or ± controls),
  **fit-to-view** (⤢) to reframe everything, and **double-click** empty canvas
  to drop a note there. Tag cards to entities; flag as secrets (🔒); a "Secrets"
  filter rolls up the flagged ones.
- **Wired to the knowledge lens.** A secret card has a **"→ concealed state"**
  action that turns the idea into a *real* relationship state the "As X believes"
  lens enforces — pre-filled with the tagged entities and note body, pick who's
  "kept in the dark", optionally pin a chapter. The note stays; the lens-enforced
  secret is added alongside it.

---

## 🎯 The roadmap

1. ~~**Level 2 — the rich editor (contentEditable).**~~ ✅ Shipped, in full:
   inline mentions, colour-by-type, hover preview, click-through.
2. ~~**Notes → full infinite canvas.**~~ ✅ Shipped: pan/zoom/fit canvas in
   world space, double-click-to-create, and the note→concealed-state bridge to
   the lens. _Still open as later niceties: resizable cards, lines connecting
   cards, a minimap, and a persistent "already promoted" marker on a note._
3. **Deeper state-marking.** Make recording "what happened" between characters
   faster/smarter as you write (fewer clicks, better suggestions).
4. **The reader's payoff.** Make Stream / Graph / Brief actively *tell* you
   things: dormant threads, contradictions, "who knows what," arcs.

---

## 🔧 UX backlog (from the volume audit)

**P2 — needed as the world fills in**
- Pagination / "load more" on the Relationships **Stream**.
- Pagination + virtualization on the **Library list** (150+ cast).
- Caps on **search results** ("show all N").

**P3 — structural / performance, when felt**
- Make the content pane scroll independently so chrome + rail stay put (sticky).
- Store/serve a chapter word-count instead of loading every body just to count.
- Debounce the mention scan (run on typing-pause) for very large casts.
- Graph at scale: cluster / cap / filter for hundreds of nodes.
- Drag-and-drop reordering on touch/mobile (desktop-mouse only today).

---

## 💡 Nice-to-haves / ideas raised
- "Take me to the matched word" highlighting in prose (lands naturally with L2).
- Swap-a-participant already done; group/hierarchy for taxonomies (e.g. lore
  sub-groups) is a later structural idea.
- Undo beyond soft-delete (a proper history/trash timeline) if needed.

---

## 🧭 Product principles we've been holding to
- **Progressive disclosure:** power features stay hidden until they're useful
  (knowledge lens appears only with a secret; empty sections vanish).
- **Preview before write:** anything bulk (import) shows what it'll do first;
  nothing touches the DB until confirmed.
- **Nothing is truly deleted:** soft-delete + Trash everywhere.
- **The manuscript is the source of truth:** structure emerges from writing,
  not a separate wiki — but standing facts can be declared directly too.
- **Verify against real data:** every non-trivial change is checked through RLS
  (rolled back) and/or in the browser before it ships.

---

## How we work
Small, verified batches → each merged to `main` → auto-deploys to Vercel
(`kronicler-three.vercel.app`). Feedback from real usage drives the next batch.
