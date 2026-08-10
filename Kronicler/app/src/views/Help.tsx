// Help, slimmed (self-explaining pass): the app now teaches itself in place —
// keyboard shortcuts live in the ⌘K palette, and vocabulary is explained by
// inline "?" where each term appears. So Help is just the short concept primer;
// there's no "replay getting-started" because the checklist reflects real data
// (it can't rewind on a world you've already built — a new world starts fresh).
export function Help() {
  return (
    <div className="fi help">
      <h2 className="scope-title">Help</h2>
      <p className="scope-sub">How Kronicler works — the short version.</p>

      <div className="help-slim">
        <div className="label">How it works</div>
        <div className="card help-prose">
          <p>You write your story as prose. The names you use — a character, a place, a faction — become <b>entities</b>, and each one lights up wherever you write it.</p>
          <p>The one move that’s Kronicler’s alone: <b>mark a moment</b>. Select a line where something shifts between two people and record it. Those moments build each relationship’s history and feed the “Worth a look” observations on your Overview.</p>
          <p>Give a chapter an in-world date and it lands on your <b>timeline</b>, which draws itself — no manual plotting.</p>
          <p className="help-tip">Two things worth knowing: press <kbd className="kbd">⌘K</kbd> to jump anywhere or see every shortcut, and hover the small <span className="help-q">?</span> beside a label to learn what a term means.</p>
        </div>
      </div>
    </div>
  );
}
