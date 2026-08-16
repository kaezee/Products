# Product Decisions & Design Log

*A portable retrospective of building **Kronicler** — the product thinking, the
design decisions, the architecture calls, and the honest retros — written so it
can be fed to Claude Code (or any collaborator) at the start of the **next**
product and skip a month of re-learning.*

- **Window covered:** spec/IA work from **~2026-08-02**, active build **2026-08-10 → 2026-08-16** (63 commits to `main`, continuous auto-deploy).
- **Product:** Kronicler — a novel-writing web app (React 18 + TypeScript + Vite + Supabase) where **structure emerges from the writing** instead of a separate wiki.
- **How to use this doc:** Sections 1–3 are the *transferable* playbook — read these first for the next product. Sections 4–6 are the Kronicler-specific record and the honest retro that produced the playbook.

---

## 1. Operating principles (the transferable core)

These are the rules that actually governed day-to-day decisions. They cost nothing
to carry into the next product and saved the most time here.

1. **Answer before you build.** The single most expensive mistake was building
   before fully understanding the ask. Restate the request, surface the real
   question, get the "yes," *then* write code. A five-minute answer beats a
   two-hour wrong feature. (See the retro — this rule was learned the hard way.)

2. **The "lazy senior dev" ladder.** Before writing new code, walk the rungs and
   stop at the first that works: (1) does it need to exist at all? (2) is it
   already in the codebase — reuse it; (3) stdlib/language built-in; (4) native
   platform/framework feature; (5) an already-installed dependency; (6) a
   one-liner; (7) minimum viable implementation; (8) full custom — last resort.
   Be lazy about *solutions*, never about *understanding*. Never trim validation,
   error handling, security, auth, or accessibility to save lines — those are the
   necessary code, not the fat.

3. **Decisions of record, with an explicit "rules out."** Every foundational call
   goes in a dated `DECISIONS.md` entry: the decision, *why*, and — critically —
   **what it rules out**. This is what lets a future session (or a fresh Claude)
   avoid re-litigating settled questions. Do not reverse a naming / IA / schema
   call without reading this file first.

4. **Additive-only at the data layer while anything else reads the DB.** Never
   rename or drop a column/table a live build (or a legacy fallback) still reads.
   Schema changes expand first; contract only when nothing depends on the old
   shape. This one invariant kept a legacy build alive on the same database
   through the entire restructure.

5. **Small, verified batches → `main` → auto-deploy.** Each change is a focused,
   typechecked, built, self-contained batch merged straight to `main` and
   deployed. Feedback from real usage drives the next batch. No long-lived
   branches, no big-bang merges.

6. **Verify against real data, not assumptions.** Every non-trivial change is
   checked through row-level security (rolled back) and/or in the browser before
   it ships. "It should work" is not "it works."

7. **Surface, don't add a destination.** When information needs to be *found*,
   prefer surfacing it in context (dashboards, the object's own page, a modal)
   over minting a new nav destination. A retired destination that resurfaces its
   content contextually beats a tab nobody opens. (A modal is not a destination —
   it's how you give a browse view without reopening an IA decision.)

8. **Model changes beat surface patches.** When a UI keeps feeling wrong after
   several tweaks, the model is usually the problem. The best fixes here *dissolved*
   confusion by changing the model (e.g. "the project **is** its own book") rather
   than papering over it with more controls.

9. **Progressive disclosure.** Power features stay hidden until they're useful:
   the knowledge lens appears only once there's a secret; empty sections vanish;
   the second "book" only appears when you have more than one. A first-time user
   should never meet a control they don't yet need.

10. **Preview before write; nothing truly deleted.** Anything bulk (import) shows
    what it will do before it touches the DB. Everything deletable is soft-deleted
    into a Trash with a recovery window. The user should never be one misclick from
    irreversible loss.

---

## 2. Design-system philosophy (what to reuse verbatim)

Kronicler ran on a small, strict design system. The *structure* transfers even
though the palette won't.

- **A four-tier surface ladder.** Canvas → surface → raised → sunken. Every
  element sits on exactly one rung; "elevation" is a token, not an ad-hoc shadow.
  Content set *into* a card uses the sunken tone (this is why notes read as
  content, not chrome).
- **Semantic colour roles, never raw colours.** Colours are owned by meaning
  (valence families: bond / obligation / hostile, plus entity swatches). A fill
  token is never used without its `on-` partner. Valence/entity colour never
  lands on an icon or as inline system text.
- **A "Never list."** An explicit, short list of things the system never does —
  e.g. *no border on a well; no radius above 8 on a container or 2 on a prose
  mark; no zero-count or empty container holding space; no spacing value outside
  the scale.* A Never list is faster to enforce than a style guide to interpret.
- **Prose annotation channels are deliberate and few.** Entity mentions, moment
  marks, comments — each has one visual channel, and a "clean text" toggle can
  suppress all of them so the writer can read their own words. Annotations are a
  *view*, never baked into the content.
- **Modal sizing follows the modal's *type* (learned this week):**
  - *Alert / confirm* — small fixed width, height hugs its short message, centered.
  - *Form / editor* — fixed width, height hugs bounded content, then scrolls.
  - *Browse / list / search* — **fixed width AND fixed height**; header/search
    pinned, only the inner list scrolls. Its frame must **never** resize as items
    are added or as a search filters them. Dialogs may hug content; anything with
    a scrolling list gets a fixed frame. Only the inner body scrolls, never the
    page.
- **Empty states are designed, not blank.** Every zero-state shows the way in
  (illustration + one grounded sentence + a single action), never an empty grid.

---

## 3. Architecture decisions (the load-bearing ones)

- **Supabase (Postgres + RLS + Auth).** Every table is owner-scoped through
  `worlds.owner_id → auth.users`. Row-level security is the security boundary:
  a user can only ever read their own rows. Verify RLS on *every* table before
  inviting real users.
- **Plain foreign keys + explicit purge helpers, not `ON DELETE CASCADE`.**
  Hard-deletes route through tested teardown functions (`_k_purge_*`). Rationale:
  cascade is easy to leave incomplete across ~20 constraints and hides what gets
  destroyed. A `BEFORE DELETE` trigger on `auth.users` runs the purge so account
  deletion succeeds without cascade. (Account deletion also writes an audit row
  with a *plain* `user_id`, no FK, so the record survives the user.)
- **No AI, no third-party data path.** The "continuity"/"moments" intelligence is
  computed **in the browser**. The writer's prose only ever travels to *their own*
  database row over HTTPS. There is no LLM, no external API, nothing that reads
  the text. This is the backbone of the IP/trust story — and it's cheap to keep
  precisely because there's no pathway to walk back.
- **Analytics dormant by default, names-and-counts only.** Product analytics is
  off unless self-hosted ingest is configured, and by construction can only emit
  event names, numbers, and short fixed enums — **never** prose, names, or titles.
  A cleaning function is the belt-and-suspenders guard.
- **Additive-only + a legacy build on the same DB.** A prior "A" build stayed
  deployable on the same Supabase project because every migration was additive.
  This is the invariant that made rapid iteration safe.
- **The `chapters` / `segments` split is deliberate.** Leaf prose (`chapters`) and
  the container tree (`segments`) are separate tables. A proposed unified tree was
  rejected: destructive, breaks the legacy build, reverses a ratified call.
- **UI vocabulary ≠ schema.** Users see "project" / "world" / "book"; the schema
  keeps `world_id`. Renaming the UI is a presentation change, never a migration.

---

## 4. The build, as sprints (with retros)

Roughly one focused cycle per theme. Each entry: **what shipped** → **the retro**.

### Sprint 0 · Foundations & trust (Aug 2 spec → Aug 10)
**Shipped:** PWA (installable + offline quick-capture), passwordless auth, a
verified Content-Security-Policy, self-hosted fonts (dropped Google origins),
security-hardening pass. The Aug-2 voice/IA spec was reviewed *against the shipped
app* before building — producing three foundational "did NOT adopt" decisions
(UI-only Project/World rename; no destructive migrations while legacy reads the DB;
keep chapters/segments split).
**Retro:** Reviewing a big spec for contradictions *before* executing it was the
highest-leverage hour of the whole project. It prevented a ~16-table rename that
would have broken production. **Lesson: specs are proposals, not instructions —
reconcile them with reality first.**

### Sprint 1 · Self-explaining UI + Overview audits (Aug 10–11)
**Shipped:** inline "?" definitions, ⌘K shortcut hints, a slimmed Help primer;
a numbered audit of Overview bugs (wrong links, broken grammar, bad counts, POV
labels, clipping).
**Retro:** Numbering the audit findings made them trackable and made "done" honest.
**Lesson: turn a vague "polish pass" into a numbered list you can close.**

### Sprint 2 · Overview as the home (Aug 12–14)
**Shipped:** manuscript grid, resume marker, empty-state hero + illustration,
notes-as-content, Trash coverage, confirm-everywhere deletes, first-run
land-in-project, account deletion.
**Retro:** One miss stands out — a "world so far" snapshot card was built that the
user *never asked for* ("why did you create something I never asked for?"). It was
reverted. **Lesson (the big one): the request was "where is X?", not "build me a
new X." Answer the literal question first.** This is where principle #1 was born.

### Sprint 3 · The Timeline (Aug 14–15)
**Shipped:** standalone chapters as their own lanes; content-percentage framing;
an **elastic axis** that compresses far-flung empty gaps; white-canvas-follows-
content; world-clock auto-extend + real-time apply; removed drag-to-date and
timeline notes; capped the ruler at whole years; "the project is its own book."
**Retro:** The timeline took the most iterations because the *elastic axis was
built before the underlying need was fully understood* — leading to "still not it,
first think then execute." The eventual wins were **deletions and a model change**
(project = book), not more features. **Lesson: when a surface keeps feeling
"sloppy," stop adding — question the model, and prefer removing.**

### Sprint 4 · Notes, everywhere they belong (Aug 15–16)
**Shipped:** click a margin ✳ to focus *that* moment; a "clean text" reading
toggle; character-page notes (+ the ability to pin from there); dated note cards;
a searchable **Show more** modal folding in comments with note/comment tags; and
a **fixed-frame** fix after the browse modal was mistakenly sized like a form.
**Retro:** Two model insights — notes/comments are "things you left yourself,"
so one surface with a tag beats two disconnected lists; and a *browse* modal is a
different object than a *form* modal. **Lesson: name the object type before you
style it. Mis-classifying a browse view as a form produced a resizing bug.**

---

## 5. Retro — the honest ledger

**What worked**
- Decisions-of-record with "rules out" — future sessions didn't re-argue settled calls.
- Additive-only DB + a legacy fallback — iteration never risked production data.
- Ship-to-`main`-per-batch with typecheck+build gates — fast, and rarely broke.
- Answering questions in plain text *before* coding, once adopted, cut rework sharply.
- Designed empty states and progressive disclosure — the app never felt hostile to a new user.

**What didn't**
- **Building before understanding** (the unrequested card; over-built timeline
  axis). Cost hours and trust each time.
- **Over-engineering ahead of need** — the elastic axis solved a real problem but
  was iterated in public; a paper sketch of the model first would've been cheaper.
- **Mis-classifying UI objects** — a browse modal sized like a form; annotations
  once entangled with content instead of being a toggleable view.

**What I'd do differently on the next product**
1. Start with a one-page **model sketch** (nouns, their relationships, the default
   case) before any UI. Most "sloppy UI" was really an unresolved model.
2. Keep a **decisions log from commit #1** (this document is that, retrofitted).
3. Adopt the **modal-type taxonomy** and the **surface ladder** on day one.
4. Write the **trust/data story** early — it shapes architecture (no-AI, RLS,
   export) and it's your answer to the two questions every user asks: *"will you
   use my work?"* and *"will I lose it?"*
5. Default to **answer-then-build** and **delete-before-add** from the start.

---

## 6. Open threads carried forward (Kronicler-specific)

- **B7 notes model** — anchoring a note to project/book/chapter; deferred; must be
  additive / dual-read if ever done.
- **`timeline_markers → notes`** migration — deferred for the same reason.
- **Trust/privacy page** — the architecture supports a strong, honest claim; the
  *page* itself isn't built yet. High-leverage before external users.
- **One-click, obvious backup** — full JSON export exists but is buried; make it a
  prominent action (dogfooding + user-trust insurance).
- **Pre-outreach security pass** — verify RLS on every table and that account
  deletion fully purges, before inviting strangers in.

---

*This log is intended to be read top-down by a fresh collaborator. If you're
starting the next product: read §1–§3, copy the modal taxonomy and surface ladder,
stand up decisions-of-record on day one, and write the trust story before the
first feature.*
