-- Kronicler — re-seed the example project's moments with real prose anchors, so
-- the margin indicator (dependency pass §6.3) actually shows them. Each sample
-- state is anchored to the first mention of one of its participants in the
-- chapter's prose; states whose participants aren't named in the prose stay
-- unanchored (still counted, just no margin mark — an honest gap, not a fake).

create or replace function _anchor_sample_states(p_world uuid) returns void
language sql security definer set search_path to 'public', 'pg_temp' as $$
  update relationship_states rs
  set anchor_quote  = a.title,
      anchor_start  = a.pos - 1,
      anchor_end    = a.pos - 1 + length(a.title),
      anchor_prefix = substr(a.body, greatest(1, a.pos - 30), a.pos - greatest(1, a.pos - 30)),
      anchor_suffix = substr(a.body, a.pos + length(a.title), 30),
      anchor_status = 'ok'
  from (
    select rs2.id as sid, p.title, p.pos, c.body
    from relationship_states rs2
    join chapters c on c.id = rs2.manuscript_ref
    cross join lateral (
      select e.title, position(e.title in c.body) as pos
      from relationship_participants rp
      join entities e on e.id = rp.entity_id
      where rp.relationship_id = rs2.relationship_id
        and c.body is not null and c.body <> ''
        and position(e.title in c.body) > 0
      order by position(e.title in c.body) asc
      limit 1
    ) p
    where c.world_id = p_world
      and rs2.is_correction = false
      and rs2.anchor_start is null
  ) a
  where rs.id = a.sid;
$$;

-- Future guest seeds anchor automatically — prose exists by this point.
create or replace function seed_sample_world() returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare uid uuid := auth.uid(); w uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  w := _seed_sample_world(uid);
  perform _apply_sample_prose(w);
  perform _anchor_sample_states(w);
  return w;
end $$;

-- Backfill every existing sample world.
do $$ declare r record; begin
  for r in select id from worlds where is_sample loop
    perform _anchor_sample_states(r.id);
  end loop;
end $$;
