import { NotePad } from "./NotePad";

// One-tap note capture (Foundations §3). Beats the phone's default notes app by
// landing somewhere it'll be found again — a project note under "What you left
// yourself" — and it works offline: the note is queued locally the instant you
// hit save, and syncs when there's a connection. onSave owns the queue write.
export function QuickCapture({ onClose, onSave }: { onClose: () => void; onSave: (body: string) => Promise<void> }) {
  return (
    <NotePad
      title="Quick note"
      helper="Saved to “What you left yourself.” Works offline — it syncs when you’re back."
      onClose={onClose}
      onSave={onSave}
    />
  );
}
