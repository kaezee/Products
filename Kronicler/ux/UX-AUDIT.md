# Kronicler — UX walkthrough & audit

A persona-grounded pass over the real product (code-verified, not guessed),
against: terminology clarity, delete/reversibility, keyboard bindings, first-run
(no demo data), click-economy, redundant controls, and back-button behaviour.

## Personas used
- **Margaret, 58 — novelist, not techy.** Writes in Word. Fears "breaking it."
  Reads buttons literally. Will use the browser Back button.
- **Dev, 29 — techy worldbuilder.** Lives in Notion/Obsidian. Expects ⌘Z,
  URLs/bookmarks, keyboard shortcuts, and Back to work.
- **First-timer (any age).** Lands on an empty account. Needs an obvious start.

---

## Findings (prioritised)

### P0 — first impression & safety

1. **World creation uses a native `prompt()`** (`App.tsx: makeWorld`). The very
   first action a new user takes throws a grey browser dialog — off-brand, feels
   broken, and is blocked in some embedded contexts. → Inline/modal name field.

2. **Empty-state instruction is a scavenger hunt.** Copy says *"hit the K chip up
   top"* but the create control is a tiny muted **＋** sitting next to a decorative
   **K** badge, a world dropdown, and a **✎**. A first-timer can't tell what to
   click. → A single prominent **"Create your first world"** button in the empty
   state.

3. **Delete uses `confirm()` everywhere, but everything is already soft-delete.**
   The confirm dialogs are safe and honest ("recoverable"), but: (a) native
   dialogs are off-brand and cause confirm-fatigue, and (b) since deletes are
   reversible, the *right* pattern is **do it instantly + show an "Undo" toast**,
   not a blocking prompt. Trash (the real safety net) is buried in Settings. →
   Optimistic delete + 1-tap Undo toast; keep Trash as the deep net.

### P1 — terminology (novelist's-eye)

Jargon leaking into user copy (all DB/graph terms a writer won't hold):

| In the UI | Where | Reads as… | Better |
|---|---|---|---|
| **entity / "New entity"** | ChapterEditor, Library, Trash | database | "character / place / thing" (contextual to type), or "add to library" |
| **concealed state** | NoteToState buttons/title | database | "secret" / "make this a tracked secret" |
| **Stream** | Relationships tab | unclear | "History" / "Changes" |
| **ego · Yuna** | Relationships focus chip | network science | "just Yuna" / "focus: Yuna" |
| **valence** | Manage types | chemistry | "tone" / "feeling" |
| ~~Band / unbanded~~ | Timeline | music/radio | ✅ **shipped** → "Arc" / "no arc" |
| ~~standing~~ | Connections, Stream | legal/unclear | ✅ **shipped** → "no chapter" (+ tooltip) |

Everything else reads cleanly. The rail labels (Overview, Library, Manuscript,
Timeline, Relationships, Notes) are fine; "Library" for the world-bible is
acceptable.

### P1 — navigation / the Back button

4. **No browser-history integration.** Nav is in-memory `useState`, no routing.
   Consequences a real user hits fast:
   - **Browser Back leaves the app** instead of returning to the previous view.
   - **Refresh dumps you back to Overview** — mid-chapter, you lose your place.
   - **No bookmarks / deep links** to a chapter or character.
   → Map `nav` to the URL (hash or History API): Back/forward work, refresh
     restores, links are shareable. In-app "← Library" links already exist and
     are good; this is about the *browser's* controls matching expectations.

### P2 — keyboard & shortcuts

- **Good:** ⌘K palette, Escape closes, Enter submits, native undo/paste in the
  prose editor (contenteditable plaintext-only).
- **Gap:** no global **⌘Z** for structural actions (delete a chapter/connection).
  Reversal is Trash-only. The Undo-toast (finding 3) covers the common case; a
  documented shortcut list would help Dev.

### Positives worth keeping
- **Reversibility is genuinely solid** — soft-delete everywhere, honest "nothing
  is truly lost" copy, Trash restore.
- **Rapid-entry** on connections/composer (stays open, Enter to add) — low
  click-count.
- **Bulk-band is now 2 clicks** and contextual.
- **Progressive disclosure** — the knowledge lens only appears once a secret
  exists; empty sections guide.

---

## Shipped from live feedback
- **Timeline "Band" → "Arc"** across every user-facing string (code/DB names unchanged).
- **"standing" → "no chapter"** (Connections + Stream) with an explaining tooltip.
- **Directional relationships now show a live plain-English preview** of how each
  side reads ("On Inea's page: is daughter → Lomelui / On Lomelui's page: mother
  → Inea"), so a writer catches a backwards direction at a glance. Inverse-word
  suggestion now understands natural phrasings ("is daughter" → "parent").
- **Delete a relationship straight from the Stream** (the ✕ that only existed on
  the character page is now in the Relationships list too).

## Recommended fix order
1. **P0 batch** (biggest confusion-per-fix): native-prompt → inline world create
   + prominent first-run CTA; delete → optimistic + Undo toast.
2. **Terminology pass** (mechanical, high clarity): entity→contextual,
   concealed-state→secret, ego→focus, Stream→History, valence→tone. ("Band"
   rename is a judgment call — needs a decision.)
3. **URL routing** (Back/refresh/deep-links) — medium effort, high payoff.
4. Shortcut hint / Trash surfaced.
