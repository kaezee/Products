-- Kronicler — inner beats: a moment inside one character, not only between two.
--
-- The model (relationships + participants + the stream view) has always allowed
-- N participants; append_group_state hardwired a floor of two. An INNER BEAT is
-- the degenerate case that was always structurally legal: a relationship whose
-- sole participant is the character themselves — their emotional through-line.
-- All of a character's inner beats collapse into ONE self-relationship (the find
-- matches purely on the participant set), so they read as a single evolving arc.
--
-- Purely additive: a new function + a discriminator column. Nothing the legacy
-- build reads is renamed or dropped.

-- Keep inner "kinds" (feeling words like "hopeful", "hollow") out of the
-- connection kind-picker, and connection kinds out of the inner picker. Defaults
-- false, so every existing type stays a connection kind exactly as before.
alter table relationship_types
  add column if not exists is_inner boolean not null default false;

-- append_self_state: find-or-create the character's self-relationship, then
-- append a felt state. Mirrors append_group_state (security invoker → RLS still
-- governs every write), with the prose anchor carried through so the same RPC
-- serves both the page composer and a future in-prose mark.
create or replace function append_self_state(
  p_world_id       uuid,
  p_entity_id      uuid,
  p_type_id        uuid,
  p_manuscript_ref uuid default null,
  p_note           text default null,
  p_anchor_quote   text default null,
  p_anchor_prefix  text default null,
  p_anchor_suffix  text default null
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
begin
  -- the self-relationship: exactly one participant, and it is this entity
  select r.id into v_rel_id
  from relationships r
  where r.world_id = p_world_id
    and r.deleted_at is null
    and (
      select array_agg(rp.entity_id order by rp.entity_id)
      from relationship_participants rp
      where rp.relationship_id = r.id
    ) = array[p_entity_id]
  limit 1;

  if v_rel_id is null then
    insert into relationships (world_id, type_id) values (p_world_id, p_type_id)
      returning id into v_rel_id;
    insert into relationship_participants (relationship_id, entity_id)
      values (v_rel_id, p_entity_id);
  end if;

  if p_manuscript_ref is not null then
    select story_time_ref into v_story from chapters where id = p_manuscript_ref;
  end if;

  insert into relationship_states
    (relationship_id, type_id, story_time_ref, manuscript_ref, note,
     anchor_quote, anchor_prefix, anchor_suffix)
  values
    (v_rel_id, p_type_id, v_story, p_manuscript_ref, p_note,
     p_anchor_quote, p_anchor_prefix, p_anchor_suffix)
  returning id into v_state_id;

  return v_state_id;
end;
$$;

grant execute on function append_self_state(uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;
