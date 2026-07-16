-- Kronicler — standing connections (declare-on-character).
-- The composer records relationship states that emerge from a scene, always
-- tied to a chapter. But a worldbuilder also knows standing facts up front —
-- "Maren is Toma's wife", "Eda is Maren's daughter" — that aren't a change in
-- any single scene. Those are relationships with no manuscript anchor.
--
-- The data model already allows it: relationship_states.manuscript_ref and
-- .story_time_ref are both nullable, and relationship_state_stream LEFT JOINs
-- chapters, so a chapter-less state flows through the stream (with null chapter
-- context) exactly like any other. This migration only relaxes the write
-- function so p_manuscript_ref may be omitted; story_time is then left null.
create or replace function append_pairwise_state(
  p_world_id       uuid,
  p_entity_a       uuid,
  p_entity_b       uuid,
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

  -- story time is derived from the chapter when there is one; a standing fact
  -- with no scene simply has no story-time anchor.
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
