# Kronicler — Design & Architecture Decisions

A running log of decisions that are expensive to reverse or easy to forget the
reasoning behind. Newest first. Each entry says what we decided, why, and what
it rules out — so a future contributor (or a future us) doesn't relitigate it or
accidentally undo it.

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
