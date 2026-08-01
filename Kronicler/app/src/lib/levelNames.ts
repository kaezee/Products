// §4 level names — the writer's vocabulary for the two structure levels. The
// engine owns the tree shape; the writer owns what the levels are called
// (Book/Chapter, Season/Episode, Act/Scene, Volume/Issue…). Stored per world.
//
// Trial note: kept in localStorage so the naming is revertable and needs no
// schema change. Promote to a worlds column when the trial graduates.
export interface LevelNames { container: string; leaf: string }
const DEFAULTS: LevelNames = { container: "Book", leaf: "Chapter" };
const key = (worldId: string) => `k.levels.${worldId}`;

export function getLevelNames(worldId: string): LevelNames {
  try {
    const raw = localStorage.getItem(key(worldId));
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw);
    return {
      container: (v.container ?? "").trim() || DEFAULTS.container,
      leaf: (v.leaf ?? "").trim() || DEFAULTS.leaf,
    };
  } catch { return DEFAULTS; }
}

export function setLevelNames(worldId: string, next: LevelNames) {
  const clean: LevelNames = {
    container: next.container.trim() || DEFAULTS.container,
    leaf: next.leaf.trim() || DEFAULTS.leaf,
  };
  try { localStorage.setItem(key(worldId), JSON.stringify(clean)); } catch { /* ignore */ }
  return clean;
}
