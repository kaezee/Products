-- Kronicler — Phase 3 write-path functions.
-- Both are SECURITY INVOKER (the default): they run with the caller's rights,
-- so per-world RLS still applies — a user can only touch their own worlds.
-- search_path pinned per the security advisor.

-- ── append_pairwise_state ───────────────────────────────────────────────
-- The in-prose composer's commit action. Phase 1 UI is pairwise (§5.3), so
-- this finds-or-creates the single relationship whose participant set is
-- exactly {a, b}, then appends a state. Atomic: one round-trip, no client-side
-- race between "does a relationship exist?" and "insert it".
--
-- story_time_ref is DERIVED from the chapter (§8: it inherits, never hand-set).
-- known_by is exception-only (§5.4): null unless someone is concealed from it.
create or replace function append_pairwise_state(
  p_world_id       uuid,
  p_entity_a       uuid,
  p_entity_b       uuid,
  p_type_id        uuid,
  p_manuscript_ref uuid,
  p_note           text,
  p_concealed_from uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rel_id   uuid;
  v_story    integer;
  v_state_id uuid;
  v_known_by jsonb;
begin
  -- find the relationship whose participants are exactly {a, b}
  select r.id into v_rel_id
  from relationships r
  where r.world_id = p_world_id
    and r.deleted_at is null
    and (
      select array_agg(rp.entity_id order by rp.entity_id)
      from relationship_participants rp
      where rp.relationship_id = r.id
    ) = (select array_agg(x order by x) from unnest(array[p_entity_a, p_entity_b]) x)
  limit 1;

  -- create it if absent (origin type = the state's type)
  if v_rel_id is null then
    insert into relationships (world_id, type_id) values (p_world_id, p_type_id)
      returning id into v_rel_id;
    insert into relationship_participants (relationship_id, entity_id) values
      (v_rel_id, p_entity_a), (v_rel_id, p_entity_b);
  end if;

  select story_time_ref into v_story from chapters where id = p_manuscript_ref;

  if p_concealed_from is not null and array_length(p_concealed_from, 1) > 0 then
    v_known_by := jsonb_build_object('concealed_from', to_jsonb(p_concealed_from));
  else
    v_known_by := null;
  end if;

  insert into relationship_states
    (relationship_id, type_id, story_time_ref, manuscript_ref, known_by, note)
  values
    (v_rel_id, p_type_id, v_story, p_manuscript_ref, v_known_by, p_note)
  returning id into v_state_id;

  return v_state_id;
end;
$$;

-- ── save_chapter_body ───────────────────────────────────────────────────
-- Trustworthy autosave (§7.2). Updates the live body every call, and keeps a
-- bounded version trail (§5.5 — writers never forgive a lost paragraph):
--   * the very first save snapshots the PRE-EDIT body as a baseline, so you can
--     always get back to what a chapter was before Kronicler touched it;
--   * thereafter a new snapshot is written at most once every 90 seconds of
--     activity, so a long session leaves a trail without exploding the table.
create or replace function save_chapter_body(
  p_chapter_id uuid,
  p_body       text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old_body   text;
  v_have_any   boolean;
  v_last_at    timestamptz;
begin
  select body into v_old_body from chapters where id = p_chapter_id;
  if not found then
    raise exception 'chapter % not found or not accessible', p_chapter_id;
  end if;

  select exists(select 1 from chapter_versions where chapter_id = p_chapter_id)
    into v_have_any;

  -- baseline snapshot of the pre-edit body, once
  if not v_have_any then
    insert into chapter_versions (chapter_id, body) values (p_chapter_id, v_old_body);
  end if;

  update chapters set body = p_body where id = p_chapter_id;

  -- throttled snapshot of the new body
  select max(created_at) into v_last_at from chapter_versions where chapter_id = p_chapter_id;
  if v_last_at is null or v_last_at < now() - interval '90 seconds' then
    insert into chapter_versions (chapter_id, body) values (p_chapter_id, p_body);
  end if;
end;
$$;
