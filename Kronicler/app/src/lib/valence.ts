import type { Valence } from "./types";

// Colour derives from valence (PRD §5.2), unless a type sets its own override.
export const VALENCE_COLOR: Record<Valence, string> = {
  bond: "var(--bond)",
  hostile: "var(--hostile)",
  obligation: "var(--obligation)",
  neutral: "var(--neutral)",
};
