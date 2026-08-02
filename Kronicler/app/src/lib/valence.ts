import type { Valence } from "./types";

// Colour derives from valence (PRD §5.2), unless a type sets its own override.
// A felt spectrum, allied → hostile, kept distinct from the blue UI accent so
// relationship meaning reads on its own axis.
export const VALENCE_COLOR: Record<Valence, string> = {
  bond: "var(--allied)",
  obligation: "var(--obligation)",
  neutral: "var(--neutral)",
  hostile: "var(--hostile)",
};

// The valences in spectrum order (positive → negative), for legends and mint
// pickers — so the choice reads as a scale, not an arbitrary set.
export const VALENCE_ORDER: Valence[] = ["bond", "obligation", "neutral", "hostile"];

// The single source of truth for the writer-facing labels of the four standings
// ("standing" = the writer's word for valence — how two people stand with each
// other). Capitalized display form, used everywhere: chip bar, dictionary,
// graph legend, List headers. Do not add a second, local copy of this map.
export const VALENCE_LABEL: Record<Valence, string> = {
  bond: "Allied",
  obligation: "Duty",
  neutral: "Neutral",
  hostile: "Hostile",
};
