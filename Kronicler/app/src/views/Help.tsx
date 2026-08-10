import { MARK_MOMENT } from "../lib/shortcuts";

// Help (onboarding §5): one page, three sections, nothing more. The first-steps
// content is the checklist's, permanently re-readable after it retires; the last
// section is the single home for the system words, so the UI can use them plainly
// elsewhere and the definition is always one click away. Laid out as a hero
// column (the steps) beside a compact column (shortcuts + glossary) so the page
// fills its width instead of stacking into a single narrow strip.
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export function Help() {
  return (
    <div className="fi help">
      <h2 className="scope-title">Help</h2>
      <p className="scope-sub">The short version — everything Kronicler asks you to learn is on this page.</p>

      <div className="help-cols">
        <section className="help-col">
          <div className="label">First steps</div>
          <ol className="card help-steps">
            <li><b>Write your first chapter.</b> Even a title is enough — the page fills itself in as you write.</li>
            <li><b>Add someone, somewhere, or something.</b> A character, a place, a faction — anyone in your story. Their name then lights up wherever you write it.</li>
            <li><b>Record what changes.</b> Select a line where something shifts between two people, and mark it. This is the one gesture that's Kronicler's alone.</li>
            <li><b>Give a chapter a date.</b> Date a chapter and it lands on your timeline.</li>
          </ol>
        </section>

        <section className="help-col">
          <div className="label">Keyboard shortcuts</div>
          <div className="card help-keys">
            <div className="help-kbd"><span>Bold</span><kbd className="kbd">{MOD}B</kbd></div>
            <div className="help-kbd"><span>Italic</span><kbd className="kbd">{MOD}I</kbd></div>
            <div className="help-kbd"><span>Mark a moment</span><kbd className="kbd">{MARK_MOMENT.label}</kbd></div>
          </div>

          <div className="label">What things are called</div>
          <dl className="card help-gloss">
            <div><dt>Moment</dt><dd>A recorded change in the story: what shifts between two people, or a new fact about someone. You make one by selecting a line and marking it.</dd></div>
            <div><dt>Entity</dt><dd>Anyone or anything in your world: a character, a place, a faction, an item. Your cast and your set.</dd></div>
            <div><dt>Segment</dt><dd>A container in your manuscript above the chapter: a book, a season, a volume — whatever your story needs.</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}
