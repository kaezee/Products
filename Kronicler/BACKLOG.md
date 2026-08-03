# Kronicler — Backlog

Running list of pending work. Decisions of record live in `ux/DECISIONS.md`; this
is the "not built yet" companion. Ordered roughly by value/urgency within sections.
Each item notes **why** it's deferred and a rough **size/risk** so future-us can
pick the right next thing without re-deriving context.

_Last updated: 2026-08-03._

---

## Admin & testing (new)

- **Admin panel — remove accounts.** A gated admin surface to delete user
  accounts (and their worlds/data). Destructive + sensitive: must be role-gated
  (Supabase RLS + an `is_admin` claim/role), never reachable by a normal user.
  Account deletion should soft-delete first (recoverable window) then hard-purge.
  _Size: M. Risk: high (auth + destructive) — build behind a role check first._

- **Test accounts with settable "time away".** A way to simulate a returning
  writer so the §4.4 recap / §4.1 orientation states can be tested on demand.
  Note: the recap is currently driven by a per-browser `localStorage` mark
  (`k.seen.<worldId>`), so the cheapest test hook is a dev-only control that
  rewinds that timestamp (e.g. "pretend I've been away 4 weeks"). A fuller
  version lives in the admin panel: spin up seeded test accounts and set their
  effective last-active date.
  _Size: S (dev toggle) → M (admin-managed test accounts). Risk: low._
  _Related: if we add `chapters.updated_at` (below), time-away can become
  data-accurate and cross-device instead of per-browser._

---

## Editor (the big one)

- **Rich-text editor rebuild → TipTap.** Replace the hand-rolled
  markdown-markers-hidden-in-text editor (RichProse) with TipTap (free, MIT).
  Formatting becomes a property of a range, not literal `*` characters, so the
  whole class of "asterisk pops into view on backspace / adjacent bold+italic /
  Enter" bugs becomes structurally impossible. Must: re-wire mentions as nodes,
  preserve comment anchoring (offset+quote), keep saving to the same plain-text/
  markdown `body` format the legacy build reads, preserve version history.
  Deliver on a preview link and validate before promoting to live.
  _Size: L. Risk: med-high (touches mentions, comments, storage). Parked at
  user's request; current editor patched to a "good enough" state meanwhile._

---

## Chronicle / Overview — handoff follow-ups

From `KRONICLEROVERVIEWCHRONICLEHANDOFF.md`. The frontend/derived scope is built;
these remain:

- **§2.1 `moments` table + migration.** Unify relationship-changes and
  state-changes under one `moments` model with `moment_participants` (multi-party,
  witnesses). Additive-only. _Deferred because it only feeds the **marked**
  sentence families, which §8 keeps inert until the composer ships._
  _Size: M. Risk: med (live shared DB migration)._

- **§2.2 knowledge derivation rework.** Derive "who knows what" from participants
  (a character knows the last state they participated in) instead of a stored
  `known_by`. Versioned states already exist. _Coupled to the composer._
  _Size: M._

- **Composer (the marking flow).** §8 explicit separate design sprint. Field spec
  is settled (participants + optional typed change, knowledge derived) but the
  interaction isn't designed. _Everything "marked" stays inert until this ships._
  _Size: L._

- **Real entity Merge.** The duplicate "Merge" button currently navigates to the
  entity; there's no merge backend. Needs a real merge (fold aliases/mentions/
  relationships from one entity into another) + confirm flow. Destructive.
  _Size: M. Risk: med._

- **`chapters.updated_at` (+ recap accuracy).** Add an additive timestamp so
  time-away is data-accurate and cross-device, replacing the per-browser
  last-seen. _Size: S migration + wire-up._

- **Co-occurrence derived sentence.** "Nobody has touched {A} and {B} since
  chapter {n}." Needs mention-pair analysis with noise control. _Size: M._

- **`unconnected` inverse-framing sentence (post-composer only).** "{Entity}
  appears in six chapters, but nothing has been recorded about her." Gate: ≥3
  chapters mentioned, 0 moments. Ship **after** the composer, never before (pre-
  composer every entity qualifies). _Size: S once composer exists._

- **Lost-anchor repair UI + rename.** Overview shows one quiet aggregate line;
  the actual Re-anchor / Delete repair belongs in the chapter's Continuity panel.
  Also rename the internal kind `orphaned-anchor` → `orphaned_anchor` ("nothing is
  lost, only the anchor broke"). _Size: S–M._

- **Marked sentence families wiring.** Templates for relationship/state/irony
  moments (§3.1 "Marked") — wire to the renderer; they light up when the composer
  produces moments. _Size: S (inert scaffolding)._

- **Discovery lifecycle** (dismiss / snooze / ranking for "Worth a look"). §8:
  real need, can't be calibrated until real marking density exists. _Parked._

- **Exit capture** ("anything you want future-you to know?" on leaving). §8:
  discussed, not decided. _Parked._

---

## IA trial remainders

Tracked in the session task list; not yet done:

- **§1 rail finish** — world-name header; remove Notes from the rail after §5.
- **§5 notes anchors + §6 comments** — notes anchored to a text range (additive
  migration); comments model polish.
- **§2 Overview orientation + §7 switcher + landing rule** — partially subsumed by
  the chronicle work; reconcile what's left (project switcher behaviour, landing
  rule on open).

---

## Deferred spec items (from `ux/DECISIONS.md`)

- **A7** — templates at project creation + "Rename levels" in the Write ⋯ overflow.
- **B3** — Write ⋯ overflow menu + inline chapter-metadata edit.
- **B5** — panels polish: scope control, virtualization, unresolved-first ordering,
  99+ count caps.
- **B7** — notes model: anchor + optional date (additive migration). _Overlaps the
  IA §5 item above — do together._
- **B9** — three-field date control (day / month / year precision).

---

## Smaller / open questions

- **Timeline day-vs-month precision** — how granular the timeline positions dated
  chapters; needs a decision (ties to B9).
- **CSS build warning** — `esbuild` reports one `Unexpected "("` css-syntax-error
  warning (pre-existing, non-fatal). Track down and fix.
- **Overview visual QA** — the new-project and recap screens were built + unit-safe
  but not visually QA'd in the live app; give them a pass.
