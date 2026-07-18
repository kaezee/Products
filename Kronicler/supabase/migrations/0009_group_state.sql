-- Kronicler — groups as first-class relationships.
--
-- The model (relationships + relationship_participants + the stream view) has
-- always allowed N participants; only the write path was hardwired to two. This
-- adds append_group_state: the same find-or-create-then-append, but over an
-- arbitrary SET of participants — a faction, a party, "the three who survived"
-- as ONE relationship with one shared, evolving history. append_pairwise_state
-- stays as the 2-party convenience (and for its per-side direction roles).
create or replace function append_group_state(
  p_world_id       uuid,
  p_entity_ids     uuid[],
  p_type_id        uuid,
  p_manuscript_ref uuid default null,
  p_note           text default null,
  p_concealed_from uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ids      uuid[];
  v_rel_id   uuid;
  v_story    integer;
  v_state_id uuid;
  v_known_by jsonb;
begin
  -- normalize: distinct + sorted, so participant order never matters
  select array_agg(distinct x order by x) into v_ids from unnest(p_entity_ids) x;
  if v_ids is null or array_length(v_ids, 1) < 2 then
    raise exception 'a relationship needs at least two distinct participants';
  end if;

  -- find the relationship whose participants are exactly this set
  select r.id into v_rel_id
  from relationships r
  where r.world_id = p_world_id
    and r.deleted_at is null
    and (
      select array_agg(rp.entity_id order by rp.entity_id)
      from relationship_participants rp
      where rp.relationship_id = r.id
    ) = v_ids
  limit 1;

  -- create it if absent (origin type = the state's type)
  if v_rel_id is null then
    insert into relationships (world_id, type_id) values (p_world_id, p_type_id)
      returning id into v_rel_id;
    insert into relationship_participants (relationship_id, entity_id)
      select v_rel_id, x from unnest(v_ids) x;
  end if;

  if p_manuscript_ref is not null then
    select story_time_ref into v_story from chapters where id = p_manuscript_ref;
  end if;

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
