// A person's short display name: their given name, with a leading honorific
// ("Dr", "Mrs", "Professor"…) stripped so a title never stands in for the name.
// UX audit Finding 11: "Dr John Watson" was showing as "Dr" in the point-of-view
// filter (and elsewhere) because the short name was just the first word.
const HONORIFICS = new Set([
  "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss", "mx", "mx.",
  "prof", "prof.", "professor", "sir", "dame", "lady", "lord", "madam", "madame",
  "rev", "rev.", "reverend", "fr", "fr.", "father", "capt", "capt.", "captain",
  "col", "col.", "colonel", "maj", "major", "sgt", "sergeant", "lt", "lt.",
  "lieutenant", "gen", "general", "det", "detective", "insp", "inspector",
]);

// The word people would call this entity: given name for a person, or just the
// name for anything else. Leading honorifics are dropped; if only the honorific
// remains (e.g. a title with no name), fall back to the first word.
export function shortName(title: string): string {
  const parts = (title || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return title;
  if (parts.length > 1 && HONORIFICS.has(parts[0].toLowerCase())) return parts[1];
  return parts[0];
}
