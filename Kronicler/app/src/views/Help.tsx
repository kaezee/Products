import { MARK_MOMENT } from "../lib/shortcuts";

// Help (onboarding §5): one page, three sections, nothing more. The first-steps
// content is the checklist's, permanently re-readable after it retires; the last
// section is the single home for the system words, so the UI can use them plainly
// elsewhere and the definition is always one click away.
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export function Help() {
  return (
    <div className="fi help">
      <h2 className="scope-title">Help</h2>
      <p className="scope-sub">The short version — everything Kronicler asks you to learn is on this page.</p>

      <div className="label">First steps</div>
      <div className="card">
        <div className="help-step"><b>Write your first chapter.</b> Even a title is enough — the page fills itself in as you write.</div>
        <div className="help-step"><b>Add someone, somewhere, or something.</b> A character, a place, a faction — anyone in your story. Their name then lights up wherever you write it.</div>
        <div className="help-step"><b>Record what changes.</b> Select a line where something shifts between two people, and mark it. This is the one gesture that's Kronicler's alone.</div>
        <div className="help-step"><b>Give a chapter a date.</b> Date a chapter and it lands on your timeline.</div>
      </div>

      <div className="label">Keyboard shortcuts</div>
      <div className="card">
        <div className="help-kbd"><span>Bold</span><kbd className="kbd">{MOD}B</kbd></div>
        <div className="help-kbd"><span>Italic</span><kbd className="kbd">{MOD}I</kbd></div>
        <div className="help-kbd"><span>Mark a moment</span><kbd className="kbd">{MARK_MOMENT.label}</kbd></div>
      </div>

      <div className="label">What things are called</div>
      <div className="card">
        <div className="help-step"><b>Moment</b> — a recorded change in the story: what shifts between two people, or a new fact about someone. You make one by selecting a line and marking it.</div>
        <div className="help-step"><b>Entity</b> — anyone or anything in your world: a character, a place, a faction, an item. Your cast and your set.</div>
        <div className="help-step"><b>Segment</b> — a container in your manuscript above the chapter: a book, a season, a volume — whatever your story needs.</div>
      </div>
    </div>
  );
}
