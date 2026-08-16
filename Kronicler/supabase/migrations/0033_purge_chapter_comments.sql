-- Kronicler — fix: purging an individual chapter must remove its comments first.
--
-- comments.chapter_id → chapters is a PLAIN foreign key (no ON DELETE CASCADE,
-- like the rest of the schema — hard-deletes route through the _k_purge_* order).
-- _k_purge_chapters (0022) predates comments (0024) and never deleted them, so
-- "Delete forever" on a trashed chapter that carries any comment fails with a FK
-- violation. World-level purge already handles comments (0032); this brings the
-- per-chapter path in line.

create or replace function _k_purge_chapters(p_ids uuid[])
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;
  delete from comments where chapter_id = any(p_ids);   -- plain FK → must go before chapters
  delete from chapter_versions where chapter_id = any(p_ids);
  delete from chapter_entities where chapter_id = any(p_ids);
  update relationship_states set manuscript_ref = null where manuscript_ref = any(p_ids);
  delete from chapters where id = any(p_ids);
end $$;
