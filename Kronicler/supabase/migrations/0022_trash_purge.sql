-- Kronicler — permanent trash purge (§10 addendum).
-- Soft-delete keeps everything recoverable; this adds the other end of the
-- lifecycle: an irreversible hard-delete, both on demand (purge_trash_item) and
-- automatically 30 days after deletion (purge_expired_trash, run by pg_cron).
--
-- FKs across the schema are plain (no ON DELETE CASCADE), so every hard-delete
-- must remove children before parents. The _k_purge_* helpers encode that order.

-- ── helpers (invoker; only ever called by the SECURITY DEFINER entry points) ──

-- Deep-purge whole worlds and everything within them.
create or replace function _k_purge_worlds(p_ids uuid[])
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;

  delete from relationship_states s using relationships r
    where s.relationship_id = r.id and r.world_id = any(p_ids);
  delete from relationship_participants rp using relationships r
    where rp.relationship_id = r.id and r.world_id = any(p_ids);
  delete from relationships where world_id = any(p_ids);

  delete from chapter_entities ce using chapters c
    where ce.chapter_id = c.id and c.world_id = any(p_ids);
  delete from chapter_entities ce using entities e
    where ce.entity_id = e.id and e.world_id = any(p_ids);
  delete from chapter_versions cv using chapters c
    where cv.chapter_id = c.id and c.world_id = any(p_ids);

  delete from notes where world_id = any(p_ids);
  delete from timeline_markers where world_id = any(p_ids);

  delete from chapters where world_id = any(p_ids);        -- frees segment/band refs
  delete from entities where world_id = any(p_ids);
  delete from relationship_types where world_id = any(p_ids);

  update segments set parent_id = null where world_id = any(p_ids); -- self-FK
  delete from segments where world_id = any(p_ids);
  delete from bands where world_id = any(p_ids);
  delete from entity_types where world_id = any(p_ids);
  delete from segment_kinds where world_id = any(p_ids);

  delete from worlds where id = any(p_ids);
end $$;

-- Purge individual entities: drop their join rows, then any relationship left
-- dangling (fewer than two participants), then the entities themselves.
create or replace function _k_purge_entities(p_ids uuid[])
returns void language plpgsql set search_path = public, pg_temp as $$
declare affected uuid[]; dead uuid[];
begin
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;

  select array_agg(distinct relationship_id) into affected
    from relationship_participants where entity_id = any(p_ids);

  delete from chapter_entities where entity_id = any(p_ids);
  delete from relationship_participants where entity_id = any(p_ids);

  if affected is not null then
    select array_agg(r.id) into dead
      from relationships r
      where r.id = any(affected)
        and (select count(*) from relationship_participants rp where rp.relationship_id = r.id) < 2;
    if dead is not null then
      delete from relationship_states where relationship_id = any(dead);
      delete from relationship_participants where relationship_id = any(dead);
      delete from relationships where id = any(dead);
    end if;
  end if;

  delete from entities where id = any(p_ids);
end $$;

-- Purge individual chapters: drop versions + join rows, unhook any states that
-- were anchored to them (keep the state, lose the anchor), then the chapters.
create or replace function _k_purge_chapters(p_ids uuid[])
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;
  delete from chapter_versions where chapter_id = any(p_ids);
  delete from chapter_entities where chapter_id = any(p_ids);
  update relationship_states set manuscript_ref = null where manuscript_ref = any(p_ids);
  delete from chapters where id = any(p_ids);
end $$;

revoke all on function _k_purge_worlds(uuid[]) from public;
revoke all on function _k_purge_entities(uuid[]) from public;
revoke all on function _k_purge_chapters(uuid[]) from public;

-- ── on-demand permanent delete (called from the Trash UI) ────────────────────
-- SECURITY DEFINER bypasses RLS, so ownership is checked explicitly. Only items
-- already in the trash (deleted_at set) can be purged.
create or replace function purge_trash_item(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if p_kind = 'world' then
    if not exists (select 1 from worlds w
                   where w.id = p_id and w.owner_id = uid and w.deleted_at is not null) then
      raise exception 'world not found in trash';
    end if;
    perform _k_purge_worlds(array[p_id]);

  elsif p_kind = 'entity' then
    if not exists (select 1 from entities e join worlds w on w.id = e.world_id
                   where e.id = p_id and w.owner_id = uid and e.deleted_at is not null) then
      raise exception 'entity not found in trash';
    end if;
    perform _k_purge_entities(array[p_id]);

  elsif p_kind = 'chapter' then
    if not exists (select 1 from chapters c join worlds w on w.id = c.world_id
                   where c.id = p_id and w.owner_id = uid and c.deleted_at is not null) then
      raise exception 'chapter not found in trash';
    end if;
    perform _k_purge_chapters(array[p_id]);

  else
    raise exception 'unknown kind %', p_kind;
  end if;
end $$;

revoke all on function purge_trash_item(text, uuid) from public;
grant execute on function purge_trash_item(text, uuid) to authenticated;

-- ── scheduled auto-purge — anything soft-deleted more than 30 days ago ───────
create or replace function purge_expired_trash(older_than interval default interval '30 days')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cutoff timestamptz := now() - older_than;
  w_ids uuid[]; e_ids uuid[]; c_ids uuid[];
  n_notes int := 0; n_rels int := 0; n_types int := 0;
  n_bands int := 0; n_segs int := 0; n_marks int := 0;
begin
  select array_agg(id) into w_ids from worlds   where deleted_at is not null and deleted_at < cutoff;
  perform _k_purge_worlds(w_ids);

  select array_agg(id) into e_ids from entities where deleted_at is not null and deleted_at < cutoff;
  perform _k_purge_entities(e_ids);

  select array_agg(id) into c_ids from chapters where deleted_at is not null and deleted_at < cutoff;
  perform _k_purge_chapters(c_ids);

  delete from notes where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_notes = row_count;

  delete from relationship_states s
    using relationships r
    where s.relationship_id = r.id and r.deleted_at is not null and r.deleted_at < cutoff;
  delete from relationship_participants rp
    using relationships r
    where rp.relationship_id = r.id and r.deleted_at is not null and r.deleted_at < cutoff;
  delete from relationships where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_rels = row_count;

  delete from relationship_types t
    where t.deleted_at is not null and t.deleted_at < cutoff
      and not exists (select 1 from relationships r where r.type_id = t.id)
      and not exists (select 1 from relationship_states s where s.type_id = t.id);
  get diagnostics n_types = row_count;

  delete from timeline_markers where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_marks = row_count;

  update chapters set band_id = null
    where band_id in (select id from bands where deleted_at is not null and deleted_at < cutoff);
  update notes set band_id = null
    where band_id in (select id from bands where deleted_at is not null and deleted_at < cutoff);
  delete from bands where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_bands = row_count;

  update chapters set segment_id = null
    where segment_id in (select id from segments where deleted_at is not null and deleted_at < cutoff);
  update segments set parent_id = null
    where parent_id in (select id from segments where deleted_at is not null and deleted_at < cutoff);
  delete from segments where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n_segs = row_count;

  return jsonb_build_object(
    'ran_at', now(),
    'worlds',        coalesce(array_length(w_ids, 1), 0),
    'entities',      coalesce(array_length(e_ids, 1), 0),
    'chapters',      coalesce(array_length(c_ids, 1), 0),
    'notes',         n_notes,
    'relationships', n_rels,
    'types',         n_types,
    'bands',         n_bands,
    'segments',      n_segs,
    'markers',       n_marks
  );
end $$;

revoke all on function purge_expired_trash(interval) from public;

-- ── schedule: daily at 04:12 UTC (idempotent re-schedule) ────────────────────
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('kronicler-purge-expired-trash');
exception when others then
  null; -- not scheduled yet
end $$;

select cron.schedule('kronicler-purge-expired-trash', '12 4 * * *',
  $$select purge_expired_trash()$$);
