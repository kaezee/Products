import { Icon, type IconName } from "./icons";

// A single, calm empty state: an icon, one line of what this is, one line of
// what to do, an optional numbered path, and one primary action. Used wherever
// a section has nothing yet, so a brand-new world reads as "here's the way in"
// rather than a grid of empty controls.
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
          <div className="empty-steps">
            {steps.map((s, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><b>{i + 1}</b> {s}</span>
                {i < steps.length - 1 && <span className="empty-arrow"><Icon name="arrow" size={13} /></span>}
              </span>
            ))}
          </div>
        )}
        {action && <button className="primary" onClick={action.onClick}>{action.label}</button>}
        {secondary}
      </div>
    </div>
  );
}
