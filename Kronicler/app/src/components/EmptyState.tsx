import { Icon, type IconName } from "./icons";

// A single, calm empty state: the section's own rail icon, one line of what this
// is, one line of what to do, an optional numbered path, and one primary action.
// Used wherever a section has nothing yet, so a brand-new world reads as "here's
// the way in" rather than a grid of empty controls. The `icon` is the section's
// rail glyph (nav-*), so the empty state and the nav agree at a glance.
export function EmptyState({ icon, title, desc, steps, action, secondary }: {
  icon: IconName;
  title: string;
  desc: string;
  steps?: string[];
  action?: { label: string; onClick: () => void };
  secondary?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <span className="empty-icon"><Icon name={icon} size={26} /></span>
        <div className="empty-title">{title}</div>
        <div className="empty-desc">{desc}</div>
        {steps && steps.length > 0 && (
          <ol className="empty-steps">
            {steps.map((s, i) => (
              <li className="empty-step" key={i}>
                <span className="empty-step-n">{i + 1}</span>
                <span className="empty-step-t">{s}</span>
              </li>
            ))}
          </ol>
        )}
        {(action || secondary) && (
          <div className="empty-actions">
            {action && <button className="primary" onClick={action.onClick}>{action.label}</button>}
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}
