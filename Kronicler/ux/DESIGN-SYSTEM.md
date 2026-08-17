# Kronicler — Design System

**Status: living document.** This is the source of truth for tokens, colour
roles, type, spacing, radius, surfaces, and the usage rules that govern them.
Components read the **semantic** token tier; this doc says what each token is
*for* and what the rules are. When the app and this doc disagree, the app is a
bug — fix the app.

_Last amended: 2026-08-08 (see Amendment log)._

---

## How this document evolves

Design changes arrive as dated **`PATCH-*.md`** files that amend the numbered
sections below. The workflow:

1. A patch proposes token values, new roles, or rules, naming the sections it
   amends.
2. When the patch is applied in code, **fold its content into the relevant
   section here** and add one line to the **Amendment log** at the bottom.
3. Never let a patch and this doc drift. The **newest applied patch wins**; this
   doc must be updated to match it, not the other way round.
4. Prefer *moving a rule* over inventing an exception. If a value looks wrong,
   change the token — don't special-case a component.

This doc governs *the system*. Product/IA decisions live in `DECISIONS.md`;
not-yet-built work in `../BACKLOG.md`.

### Token tiers

| Tier | File | Who touches it |
|---|---|---|
| Primitives | `src/styles/tokens.primitives.css` | nobody directly — raw scales (`--k-woad-700`, `--k-warm-50`…) |
| **Semantic** | `src/styles/tokens.semantic.css` | **components only read this tier** (`--k-action-fill`, `--k-bg-surface`…) |
| Components | `src/styles.css` + inline | consume semantic tokens; never hardcode a hex |

Colour resolves **per theme** (Paper = default warm cream, White = cool office,
Dark = dusk). Type, spacing, radius, and motion are theme-independent.

---

## §1 · Registers — the three worlds a colour can live in

Every colour in the UI belongs to exactly one register, and the register
dictates its treatment. This is the rule that keeps meaning legible.

| Register | May be | Never |
|---|---|---|
| **Chrome** — buttons, rail, panels, controls | saturated fills, container tints, focus rings | inside the prose column |
| **System** — banners, confirms, validation | always a *container*: fill + radius + border + icon | bare inline text |
| **Prose** — annotations on the writer's words | linework and one faint wash | fills, icons, radius > 2, containers |

---

## §2 · Colour ownership

| Family | Owns | Rule |
|---|---|---|
| **Woad** (action) | actions, links, focus, info | the only accent in chrome |
| **Entity** (12 swatches) | identity of a writer-created thing | writer-assigned; never decorative |
| **Valence** (4) | relationship state | engine-owned; never reassignable; **inline text + dots only** |
| **System** (1 red + info) | the app's own state | **container-only** |

There is **no decorative colour family**, and none should be added. Every colour
in Kronicler means something.

**The firewall rule:** system colour only ever appears inside a container (banner,
well, filled button, input border), always with an icon, **never as bare inline
text**. Valence colour only ever appears as inline text or a dot, **never inside a
container**. This keeps "enemy of" (valence) and "delete forever" (system) from
ever being the same red.

---

## §3 · Type

Line-heights are **absolute px**, never unitless ratios — that keeps text on the
4px grid as sizes vary. Three faces: **Literata** = content/reading, **Public
Sans** = chrome/UI, **Roboto Mono** = figures.

| Role | Token | Size / lh | Family | Use |
|---|---|---|---|---|
| Scope title | `--k-type-title-*` | 26 / ~31 | Literata | one per screen, top only |
| Entity name | `--k-type-entity-*` | 15 / ~21 | Literata | every entity name, everywhere |
| Body / chrome | `--k-type-body-*` | 13 / ~20 | Public Sans | UI text, buttons, sublines |
| Small | `--k-type-small-*` | 11.5 / ~17 | Public Sans | metadata, card sublines, refs |
| Micro label | `--k-type-micro-*` | 10 / ~14, .09em, 700, upper | Public Sans | section + card labels |
| **Metric** | `--k-type-metric-*` | **24 / 28, weight 600** | **Roboto Mono** | counts on cards |

**Rules:** Literata is content, Public Sans is chrome, Roboto Mono is figures —
no exceptions. A card subline never exceeds Small and must read quieter than the
micro label above it. One scope title per screen. A count is a **metric**, not a
heading — it uses the mono metric role so it reads as a figure.

---

## §4 · Surfaces — the four-tier ladder

| Tier | Token | Paper | White | Dark | Role |
|---|---|---|---|---|---|
| Canvas | `--k-bg-canvas` | `#FCFAF4` | `#F7F8FA` | `#080A11` | ground behind content |
| Surface | `--k-bg-surface` | `#FFFFFF` | `#FFFFFF` | `#101321` | cards, panels — the page |
| Well | `--k-bg-sunken` | `#F7F6F1` | `#F1F3F6` | `#05060B` | recessed blocks inside a surface |
| Raised | `--k-bg-raised` | `#FFFFFF` | `#FFFFFF` | `#181C2D` | popovers, modals, menus |

**Rules**

1. **A well has no border.** A tinted block inside a surface is already recessed;
   an outline makes it read as a second card. (Inputs, `.kbd`, tags and count
   pills are *not* wells — they keep their borders.)
2. A card may have a border **or** a fill, not a heavy version of both.
3. Sections inside a card divide with a **1px rule + 24px above it**, not nested
   cards.
4. **Raised is the only tier permitted a shadow**, and only on light themes; Dark
   lifts with borders and tonal steps.

---

## §5 · Colour roles (semantic tokens)

Every fill token ships with an **`on-` partner**. A component takes a fill and its
partner as a pair; it never picks a text colour independently. This makes the
badge-contrast class of bug unrepresentable.

### 5.1 Action (chrome accent) — split fill from container

| Token | Light | Dark | Use |
|---|---|---|---|
| `--k-action-fill` / `--k-on-action-fill` | `#394293` / `#FFFFFF` | `#7B86EA` / `#080A11` | primary button fills |
| `--k-action-container` / `--k-on-action-container` | `#DFE2F2`* / `#2B3273` | `#272B49` / `#C6CCE8` | selected states, active rail, tonal buttons |
| `--k-action-text` | `#22285D` (woad-700) | `#7B86EA` | action-coloured text + links |

\* White theme uses `#DEE3F4` for the container. `--k-action-default` is retired —
do not use it in components.

### 5.2 System feedback — container-only (§1 firewall)

`--k-system-error` (+ `-container` / `on-` partners) for destructive confirms,
Danger zone, validation, failed save/import, and stale-anchor prompts.
`--k-system-info` / `-container` for informational banners (e.g. the guest
banner). **No success token** — success is the word "saved". **No warning token**.
System colour is never bare inline text.

### 5.3 Icon inks

`--k-icon-default` (= text-secondary — resting icons, **never tertiary**),
`--k-icon-active` (= on-action-container — icons in a selected row),
`--k-icon-accent` (= action-text). An icon never carries valence or entity colour.

### 5.4 Selection

`--k-selection-bg` (`rgba(action-fill, .16)`) — text-selection is a brand surface,
visibly distinct from the mention wash and search outline.

### 5.5 Valence & entity

Valence (allied / obligation / neutral / hostile): inline text + a derived line
colour; badges use line + text, **no fill**. Neutral is theme-derived (inherits
each theme's secondary ink — "neutral" means *no valence*). Entity tints are
**derived from the active canvas** (`color-mix(canvas 88%, entity 12%)`), so a
tint is never cold on warm cream. Warm-axis values (obligation, amber, ochre,
rust) rotate per theme; cool families (azure, woad, allied, hostile) are constant.

---

## §6 · Spacing — the band rule

The 4px grid stays; what changes is which values are allowed *where*. Three bands;
a value outside a band is not permitted in that context.

| Band | Values | Use for |
|---|---|---|
| **Inner** | 4 · 8 | gaps inside a component (icon↔label, number↔subline, chip padding) |
| **Component** | 12 · 16 · 20 · 24 | padding inside cards/wells, gaps between sibling components |
| **Layout** | 32 · 40 · 48 · 64 | gaps between sections, page padding, major blocks |

**Rules:** 14, 18, 22, 28 are forbidden — move a band, don't invent a step.
Whitespace groups, it doesn't decorate: prefer widening a *section gap* over
padding. A section gap is always **≥ 32**; anything closer than 32 is one section.

---

## §7 · Radius — proportional

| Token | Value | Applies to |
|---|---|---|
| `--k-radius-mark` | 2 | prose annotation marks (mention wash, search outline) |
| `--k-radius-control` | 6 | buttons, inputs, chips that aren't pills |
| `--k-radius-container` | 8 | cards, wells, banners, panels, modals |
| `--k-radius-full` | 999 | valence + status pills only |

Radius scales with the object; do not exceed 8 on containers (Kronicler's register
is editorial), never exceed 2 on a prose mark, and never round a divider.

---

## §8 · Prose annotation channels

Prose carries five annotation systems. Each owns **one** channel; two systems
never share a channel. Annotations are **linework only** — no fills beyond the
faint wash, no icons, no radius above 2, no container (that's what separates them
from system messages, which are always contained).

| System | Channel | Treatment |
|---|---|---|
| Entity mention | underline + wash | 2px underline in the entity colour, wash = `--k-entity-<sw>-tint`, radius 2 |
| Comment anchor | dashed underline | 1.5px dashed, text-tertiary |
| Search match (static) | outline | 1px box, border-strong, radius 2, no fill |
| Find match (live, ⌘F) | fill | amber band: `--k-find-match`, current hit `--k-find-current` |
| Text selection | background | `--k-selection-bg` |
| Moment | left margin | 5px dot, text-tertiary, outside the text column |

**Two search treatments, one meaning.** A *static* search match (results/context
views, rendered in our own markup) keeps the outline box. The *live* in-editor
find (⌘F) is a different object: it paints over the writer's untouched prose via
the CSS Custom Highlight API, which can only fill — not outline — a range. It
uses amber (the "here / where you stopped" marker family), so a hit reads as
"where you're looking", stays clear of the woad text-selection and the entity
mention wash, and honours the "markers enclose — a fill counts" rule
(`DECISIONS.md`, 2026-08-14). The current hit is a stronger amber than the rest.

Mention-bearing text uses a 28px line-height so underlines and margin marks have
room. The margin channel sits outside the text column (reserve 32px left padding
on any prose surface that can hold moments). The Overview's derived sentences use
the mention channel too, via `<Mention name swatch>`.

---

## §9 · Layout

- **One containment model per screen.** Overview is cards on canvas; Write is a
  continuous prose column. Never mix within a screen.
- Every section on a screen has a container, or none do — partial containment
  makes trivia outrank the writing. Hierarchy is carried by container **size and
  padding**, not by which sections get containers.
- The editor content column stays free of illustration, colour and chrome — the
  one surface where quiet is correct.
- Constants: rail 176, side panel 280, content column **920**.

---

## §10 · The Never list

- A zero count, a denominator, or an empty container holding space _(exception:
  the onboarding checklist's `n of 4`)_
- A border on a well
- Radius above 8 on a container, or above 2 on a prose mark
- A spacing value outside §6's table
- Valence or entity colour on an icon
- System colour as inline text, or valence colour inside a container
- A fill token used without its `on-` partner

---

## Amendment log

- **2026-08-17** — §8: split the search channel into *static* (outline box, as
  before) and *live ⌘F find* (amber fill via the CSS Custom Highlight API, which
  cannot paint an outline). Added semantic tokens `--k-find-match` /
  `--k-find-current` (derived from `--k-marker`, so they re-resolve per theme).
  In-chapter find ships in the Write editor.
- **2026-08-08** — Applied `PATCH-scale-surfaces-and-colour-roles`: lightened
  surfaces (White canvas `#F7F8FA`, wells `#F1F3F6` / `#F7F6F1`); split action
  into fill / container / text with `on-` partners (retired `--k-action-default`);
  added system-error/info, icon-ink, selection, and metric-type roles + radius
  roles; neutral valence theme-derived; warm-axis rotation; entity tints derived
  from canvas. Wired primary fills, selected states, guest banner (info
  container), card metrics, resting icons off tertiary, de-bordered content wells,
  and applied the §8 mention channel to the Overview's derived sentences.
  _Not yet done:_ full §6 spacing audit beyond the stat row; the remaining four
  prose channels (comment / search / selection / moment) in the editor.
- _Older history predates this file; reconstruct from `DECISIONS.md` and git._
