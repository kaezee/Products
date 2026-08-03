# Kronicler — Backlog

Running list of pending work. Decisions of record live in `ux/DECISIONS.md`; this
is the "not built yet" companion. Ordered roughly by value/urgency within sections.
Each item notes **why** it's deferred and a rough **size/risk** so future-us can
pick the right next thing without re-deriving context.

_Last updated: 2026-08-03._

---

## ▶ ACTIVE: Onboarding & teaching the gesture (handoff)

Current priority, ahead of the backlog below. Build order from the handoff §10:

1. ✅ **Creation screen (§2.2–2.4)** — name + form + genre + entry choice, seeded types.
   - `lib/onboarding.ts` tables + tests; `seedProjectShape` seeds container
     segment-kinds + genre types; Library offers registry types in the dropdown.
2. **§2.6 decay + §2.7 guest conversion.**
   - ✅ Decay: first-project-only explanatory copy.
   - ☐ Guest conversion (deferred): "Add an email to keep it" → into the creation
     screen. Entangled with the async email-confirmation auth round-trip; small
     follow-up, not worth half-building the auth path now.
3. ✅ **§3 checklist rework** — demonstration ladder on the active Overview; real-data
     after-states; step 3 speaks a live moment sentence; no locks; retires at 4/4.
5. ✅ **§4.1 shortcut in popover** + **§4.4 panel net** — shortcut shown + wired
     (Ctrl/Cmd+Shift+M); dismissible teaching line atop the Continuity panel.
7. ✅ **§5 Help page** — rail footer; First steps / Shortcuts / What things are called.

### ▸ Dependency pass — do these together, last (the flagged items)

All blocked on the same thing: **a moment has no prose text-anchor yet** (the
deferred §2.1 moments model). Needs a small additive column on the moment/state
(anchor_start/anchor_end) + write-path wiring, then:

- ☐ **§6.3 margin indicator** — a moment marks the prose margin (not inline), click
    opens it in the Continuity panel. Also seed it in the example project.
- ☐ **§6.2 Continuity panel moment count** — per-chapter count, no zero badge.
- ☐ **§4.2 engine offers** — offer the mark when two linked entities co-occur in an
    unmarked sentence; ≤1/chapter; retire after 3 marks (per account); never re-arm.
- ☐ **§2.7 guest conversion** — route "Add an email to keep it" into the creation
    screen (entangled with the async email-confirmation auth round-trip).

**OPEN (§9):** `Mark a moment` binding — wired as **Ctrl/Cmd+Shift+M** (avoids macOS
⌘M minimize). Confirm or rebind in the dependency pass; it's a one-line change.

---

## Effort ranking (token usage / build cost, max → low)

A rough ordering to plan a session's spend. Size ≈ tokens: how much code gets
read + generated + iterated (and how much back-and-forth QA the risk implies).

**XL — biggest spend**
1. **Rich-text editor rebuild → TipTap** — touches editor, mentions, comments,
   storage, version history; iterative preview QA.
2. **Mobile version of the web app** — responsive overhaul across every view
   (rail, panels, editor, timeline, relationships graph); lots of layout + CSS.

**L**
3. **Composer (marking flow)** — new interaction to design and build.
4. **Admin panel — remove accounts** — auth/role gating, RLS, destructive flows.

**M**
5. **`moments` table + migration (§2.1) + knowledge derivation (§2.2)** — coupled.
6. **IA §2/§7 — Overview orientation + project switcher + landing rule.**
7. **Real entity Merge** — backend fold logic + confirm flow.
8. **Notes anchors + comments (§5/§6, B7)** — additive migration + anchor UI.
9. **Co-occurrence sentence** — mention-pair analysis + noise control.
10. **B5 panels polish** — scope control, virtualization, ordering, count caps.
11. **Discovery lifecycle** — dismiss/snooze/ranking (parked until marking density).
12. **IA §1 rail finish** — world-name header; remove Notes after §5.
13. **A7 — creation templates + "Rename levels" overflow.**
14. **B3 — Write ⋯ overflow + inline chapter-metadata edit.**

**S — lowest spend**
15. **Test-account time-away dev toggle** — rewind the `k.seen` mark to fake "away".
16. **`chapters.updated_at` migration** — makes recap data-accurate/cross-device.
17. **Lost-anchor repair UI + `orphaned_anchor` rename.**
18. **`unconnected` inverse-framing sentence** (post-composer only).
19. **Marked sentence-family wiring** — inert scaffolding.
20. **B9 — three-field date control.**
21. **Timeline day-vs-month precision** — decision + small change.
22. **Exit capture** — parked, undecided.
23. **CSS build warning fix.**
24. **Overview visual QA** — new recap / new-project screens.

_Caveat: these are estimates. Admin panel and Merge carry destructive-action risk,
so their real cost can rise with the care (and QA rounds) they need._

---

## Platform

- **Mobile version of the web app.** A responsive/mobile build of Kronicler — not
  just narrow-screen CSS but rethinking the rail, summoned panels, the editor, the
  timeline, and the relationships graph for touch and small viewports. Likely the
  second-largest effort after the editor rebuild; best done view-by-view.
  _Size: XL. Risk: med (broad surface, lots of layout)._

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
