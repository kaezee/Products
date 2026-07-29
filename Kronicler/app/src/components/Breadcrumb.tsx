import { Icon, type IconName } from "./icons";

export interface Crumb {
  label: string;
  icon?: IconName;
  onClick?: () => void; // omitted on the current (last) crumb
}

// A navigable trail: Overview › Section › Leaf. Every crumb but the last is a
// button back to that level; the last is the page you're on. Kept dumb — App
// owns what the trail says, since it owns navigation.
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        const body = <>{c.icon && <Icon name={c.icon} size={13} />}{c.label}</>;
        return (
          <span className="crumb-seg" key={i}>
            {c.onClick && !last
              ? <button type="button" className="crumb-link" onClick={c.onClick}>{body}</button>
              : <span className={"crumb-cur" + (last ? " on" : "")} aria-current={last ? "page" : undefined}>{body}</span>}
            {!last && <span className="crumb-sep" aria-hidden="true">›</span>}
          </span>
        );
      })}
    </nav>
  );
}
