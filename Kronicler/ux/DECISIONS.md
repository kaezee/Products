# Kronicler — Design & Architecture Decisions

A running log of decisions that are expensive to reverse or easy to forget the
reasoning behind. Newest first. Each entry says what we decided, why, and what
it rules out — so a future contributor (or a future us) doesn't relitigate it or
accidentally undo it.

---

## 2026-08-16 · One modal system: rem width tiers, always centred, browse=fixed / form=hug

**Decision:** Every modal is centred in the viewport (never top-pinned) with a
consistent edge margin. Widths are a small set of **rem** tiers — sm 26 / md 38
(default) / lg 52 / xl 64 — capped at `100vw − 2rem`; height caps at
`min(85vh, 100vh − 3rem)` and the body scrolls. **Browse/list modals** (Notes,
Trash) use a **fixed frame** (they're always full of list); **forms and wizards**
(confirm, notepad, New project, Import) **hug their content**, and if one part is
a long list, only *that part* scrolls — not the whole modal.

**Why:** rem scales modals with the user's text size (accessibility); tiers stop
ad-hoc per-modal sizing; forms cap so the space becomes focus-margin, not a
form stretched across a monitor (Material/Atlassian/Carbon convention). The
fixed-vs-hug split is the crux — a fixed height on a *wizard* creates dead space
on simple steps and scrolls the whole modal (clipping the header); hugging a
*browse* modal makes it jump as items/search change.

**Rules out:** hand-sized px modal widths; top-anchored overlays; fixed heights on
wizards; content-hugging on list browsers.

## 2026-08-16 · The project IS its own book (timeline main-book lane)

**Decision:** Every dated chapter not filed into an explicit Book belongs to one
implicit **main book** (the project), drawn as a single titled span-bar on the
timeline — not a pile of one-chapter "standalone" lanes. Its span is the World
Clock, so "this book runs 1000–2000" is directly settable. `+ Book` (was
`+ Section`) only surfaces for a *second* container.

**Why:** a first-time writer thinks "this project is my book"; forcing structure
up front is confusing. Progressive disclosure — one book = zero structure work.

**Rules out:** the old per-chapter "standalone lane" model; requiring structure
before a writer has a second book. (No schema change — presentation over the
existing segment + loose-chapter data.)

## 2026-08-16 · Timeline notes retired; notes surface contextually

**Decision:** Removed timeline "notes" (dated markers-as-notes). Notes live in two
places — the global nav and the writing surface — and surface contextually
(Overview, chapter, character), never as a third "notes" flavour on the timeline.

**Why:** three things called "notes," two of them the same idea, was the
confusion. A *dated non-chapter event* is a real but power-user concept; if it
returns it comes back as **"events / milestones,"** a distinct concept, not a note.

**Rules out:** a third notes surface on the timeline.

## 2026-08-16 · Story time is year-precision — the ruler never shows sub-year

**Decision:** The timeline ruler caps at whole years (no `1970.59`); "N in view"
reports *real* story-years, not the warped/compressed span.

**Why:** chapters store a year, not a calendar date — the ruler must not invent
precision the data doesn't have.

**Rules out:** fractional-year tick labels; reporting warped years as if real.

## 2026-08-16 · A backup is a COMPLETE snapshot, or it's a false promise

**Decision:** `exportWorld` captures **every** world-scoped table (it was silently
dropping segments, comments, edit history, and the type registries). A prominent
"Full backup" is the primary action in Settings. Format bumped to v2.

**Why:** a "download everything" button that drops your book structure and
comments is worse than a buried one. Data durability is the writer's #1 trust ask.

**Rules out:** partial backups presented as complete.

## 2026-08-14 · Markers enclose — never a single-edge accent stroke

**Decision:** A status / selection / "you-are-here" marker is always an
**enclosing** shape — a full ring, outline, dot, chip, or tinted fill — never a
**one-sided edge stroke** (a left/right/top/bottom bar). Concretely, "where you
stopped" (the amber `--marker`) is a full amber ring everywhere it appears:
- Overview grid cell — `.ms-cell.here` `border: 2px solid var(--marker)`
- grid legend — `.ms-legend-here` `box-shadow: 0 0 0 1.5px var(--marker)`
- Timeline band — `.wt2-chband.resume` `outline: 2px solid var(--marker)`
- Write structure tree — `.wt-ch.resume` `box-shadow: inset 0 0 0 1.5px var(--marker)`

**Why:** a single-edge bar reads as unfinished — a clipped box, a rule that lost
its other three sides — and it fights the row's own rounded rectangle, pointing
at one corner instead of enclosing the thing it marks. It also breaks LTR/RTL
symmetry and stacks badly with a fill state (the stroke sits on one edge while
the fill owns the whole shape). An enclosing ring hugs the element's radius, is
direction-neutral, and layers cleanly over a `.on` fill (blue fill + amber ring
= "selected *and* where you stopped"). It also keeps ONE marker vocabulary across
grid, timeline, and tree, so the writer learns "amber ring = here" exactly once.

**What it rules out:** using `border-left` / `border-right` / `inset Npx 0 0`
edge shadows as an *accent, status, active, or marker* indicator. Reach for a
ring/outline (enclose), a leading dot or chip (symbol), or a tint fill instead.

**Not covered (these one-sided borders are legitimate and stay):** structural
**dividers** between rows/sections (`border-bottom`/`border-top` hairlines),
layout **seams** between panels (`.ed-panel`, `.wt2-side` left borders), **axis /
guide lines** (`.wt2-grid`, `.wt2-knownedge`), and the **blockquote** indent
(`.moment-offer-q` `border-left`) — a typographic quote convention, not a marker.
The rule is about *accent/marker* strokes, not about every single-side border.

**Audit note:** swept the stylesheet for single-edge accent strokes used as
markers — `.wt-ch.resume` was the only offender (it had `inset 2.5px 0 0`),
now an enclosing ring matching the grid/timeline. No others found.

---

## 2026-08-02 · Projects switcher: keep the full-screen gallery; fix its affordances

**Decision:** The rail-header project switcher opens the **full-screen Projects
gallery** (not a popover). This resolves the open B8 question in favour of the
gallery — the writer has repeatedly treated it as a real screen and wants it.
Its two affordances were wrong and are fixed:
- The trigger showed a **chevron-down (⌄)** — the universal "opens a dropdown
  menu below" signal — but it opens a whole screen. Replaced with a **grid icon**
  (LayoutGrid, "view all projects"). A dropdown chevron on a control that
  navigates to a screen is a lie about what the control does.
- The gallery had only a small "✕" top-right. Added a labelled **‹ Back** button
  top-left (Esc still works) — a screen you navigate *into* needs an obvious way
  back, not just a close glyph.

**Why not the B8 popover:** the writer wants the Docs-style "all projects" screen
they originally asked for; a popover would delete it. B8's "no library/files
screen" is therefore **not** adopted.

**Audit note:** swept every `chevron-down` usage — the switcher was the only
misuse. The other three (resolved-comments disclosure, structure-tree collapse,
entity-page section toggle) are legitimate expand/collapse toggles and were left
alone.

---

## 2026-08-02 · Voice/IA spec (Parts A–C): what we adopted, and what we deliberately did NOT

Context: a large naming/voice/IA specification ("Parts A–C") was written to unify
Kronicler's vocabulary (Project/World split, `moment`, `standing`, banned software
words) and restructure the editor/IA. Before building, we reviewed it for
contradictions against the **currently shipped** app and its **live deployment
arrangement**. Three foundational decisions came out of that review. They gate
everything downstream, so they are recorded here.

### D1 — "Project / World" is a UI relabel only. The schema keeps `world_id`.

**Decision:** The writer-facing container is called a *Project*; its contents are
the *World*. This is a **presentation-layer rename**. The database column stays
`world_id`; the `worlds` table stays `worlds`. No `world_id → project_id`
migration.

**Why:**
- The spec itself says so in two places — A1 ("banned words remain fine in code
  and schema") and B0.5 ("schema names never appear in UI"). Those imply a
  relabel, not a column rename.
- C3's build order *also* lists a literal `world_id → project_id` migration.
  That directly contradicts A1/B0. We resolve the contradiction in favour of
  **UI-only**, because…
- …a physical rename is **not additive**. It would touch ~16 tables, every RLS
  policy, every RPC, and the `relationship_state_stream` view, and it cannot be
  done in a single shippable step (C3's own rule) without an expand/contract
  dance.
- Most importantly, it would **break the live A version** (see D2).

**Rules out:** renaming `world_id` anywhere in schema/RPCs; a separate `projects`
table (Project ≡ one `worlds` row for now; "multiple projects sharing one world"
stays a hypothetical v2 per C1).

### D2 — The legacy "A" build stays working on the SAME database, so no destructive migrations.

**Decision:** We shipped the restructured "B" build to production (`main` →
kronicler.app) on 2026-08-02, and preserved the prior "A" build on the
`legacy/model-a` branch, deployable on the *same* Supabase project because every
change to date was additive. We keep that invariant: **no migration may remove or
rename a column/table that A reads.**

**Why:** A queries `world_id`, the separate `chapters` table, and the
`timeline_markers` table directly. Any of these three spec items would strand A:
- `world_id → project_id` rename (→ see D1, rejected)
- B6's unification of `chapters` into `segments(…, body)` (→ see D3, rejected)
- B7's `timeline_markers → notes` migration (→ deferred; must be additive/dual-read
  if ever done)

**Rules out:** destructive or renaming migrations while A is a supported fallback.
If A is later declared throwaway, revisit — but say so explicitly here first.

### D3 — Keep the `chapters` / `segments` split. B6's unified tree is NOT adopted.

**Decision:** `chapters` (leaf prose) and `segments` (the container tree) remain
separate tables, as ratified earlier in the project. B6's proposed
`segments(id, project_id, parent_id, position, level, title, body)` with "prose on
leaf nodes only" — i.e. folding chapters into segments — is **not** built.

**Why:**
- It reverses a previously ratified decision ("keep chapters/segments split; no
  migration to unified leaves").
- It is a large, destructive migration that breaks A (D2).
- B7 ("anchor a note to project / book / **chapter** via `anchor_segment_id`")
  depends on this unification. Since we keep the split, B7's note anchoring must
  reference a `chapter_id` for chapter-level anchors, not a single `segment_id`.

**Rules out:** a single unified structure tree in v-now. If we ever want it, it's
an additive expand/contract, and B7 changes with it.

### What we BUILT under these decisions (the "safe string layer")

Pure copy + one refactor, per the spec's build-order steps 1–2. No schema, no
tree, no switcher architecture, nothing that depends on an open question:

- **A2/A3** Project/World split as UI copy; `state`/`state note` → **moment**;
  banned software words removed from UI (`collection`, `cast`, writer-facing
  `tone`).
- **A4** collapsed the two valence label maps into a single source of truth in
  `lib/valence.ts` (deleted `VALENCE_LABEL_LOCAL` in `Relationships.tsx`);
  writer-facing "tone" → **"standing"**. Internal enum (`bond|obligation|neutral|
  hostile`) unchanged.
- **A5** Relationships "Manage kinds" → **"Manage"**; modal titled
  **"Relationship kinds"**.
- **A8** exact string rewrites that carry no dependency on the deferred layers.

### What we deliberately DEFERRED (and why — do not "fix" these ad hoc)

- **Needs-attention chip copy** (A8 open item / C2): the six chips
  (duplicate?/reopened/lost chapter/irony/dormant/unconnected) must become
  sentences using the writer's proper nouns per A0. Writing them correctly
  requires the detection logic each chip computes. **Left as-is until specified.**
- **Timeline "+ Segment" → level-name relabel** (A8): deferred because the
  Timeline uses the `segment_kinds` registry (series/book/season) while Write uses
  the per-world `levelNames` (container/leaf). These are two different naming
  systems; conflating them is exactly what B6's unified tree would resolve — and
  B6 is not adopted (D3). Only the pure-string timeline change (delete-confirm
  wording) was applied.
- **Timeline day-vs-month precision** (B9/C2): unresolved; the B3 metadata example
  ("… day 6 …") presupposes a day field whose existence is open. Not touched.
- **Timeline summon icon in the editor** (B5): B5 reintroduces a Timeline icon
  that was explicitly removed earlier at the writer's request. Not re-added
  pending confirmation.
- **All-worlds gallery → popover-only switcher** (B8/C1): B8 removes the
  Docs-style "all worlds" gallery that was explicitly requested and shipped. Kept
  the gallery; only relabelled it (Worlds → Projects). Reversal not made without
  confirmation.
- **The whole B schema/IA layer** (B1 rail redirect wiring, B5 panels, B6 tree,
  B7 notes model): all await the decisions above; each is its own step.

Open items still needing the writer's input before their steps can start:
needs-attention chip detection logic, and Timeline day-vs-month precision.
