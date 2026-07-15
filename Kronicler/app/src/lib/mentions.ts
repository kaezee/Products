import type { Entity } from "./types";

// Live mention scan (§7.4): which entities does this prose mention, by title or
// alias? Substring match for now — case-insensitive, aliases included (the
// whole reason aliases are a schema field). Word-boundary refinement and inline
// highlighting come with the design pass; this powers the live cast panel.
export function detectMentions(body: string, entities: Entity[]): Entity[] {
  if (!body.trim()) return [];
  const hay = body.toLowerCase();
  return entities.filter((e) =>
    [e.title, ...e.aliases]
      .filter(Boolean)
      .some((name) => hay.includes(name.toLowerCase())),
  );
}
