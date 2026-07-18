-- Kronicler — Notes that bring value: tie a card to the story, and let it grow.
--
-- Three additions to `notes`:
--   chapter_ids — real chapters this note relates to (chips, like entity_ids)
--   plan_ref    — a free-text "when" for a beat NOT yet written ("Season 3",
--                 "the finale"), so a note can point at the future, not only at
--                 chapters that already exist
--   w, h        — per-card size, so cards can be resized on the canvas
alter table notes
  add column if not exists chapter_ids uuid[] not null default '{}',
  add column if not exists plan_ref    text,
  add column if not exists w           real,
  add column if not exists h           real;
