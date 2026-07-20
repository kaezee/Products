-- Kronicler — a soft "story" label on an arc, e.g. "Against the Rot" or a
-- spin-off "Tales of the Guardians". Stories share the world's cast (no walls);
-- this is only a grouping so the vertical timeline can lay arcs out as lanes.
-- Nullable + additive: arcs without a story fall into the default lane.
alter table bands add column if not exists story text;
