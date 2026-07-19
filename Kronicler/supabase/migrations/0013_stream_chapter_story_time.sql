-- Kronicler — the stream's story_time_ref should reflect a chapter's CURRENT
-- in-world time, not the value frozen onto the state when it was recorded. The
-- append functions copy story_time_ref at write time; if the writer later edits
-- a chapter's in-world date, those copies go stale. Reading it from the joined
-- chapter (c) instead keeps chronological ordering exact and lets the Brief and
-- Timeline place a flashback where it truly happens. Standing states (no
-- manuscript_ref) have no chapter and so no chronological position — null, as
-- before. Same columns, same order, same types → create or replace is safe.
create or replace view relationship_state_stream
with (security_invoker = true) as
select
  rs.id              as state_id,
  rs.relationship_id,
  r.world_id,
  rs.type_id,
  rt.label           as type_label,
  rt.valence,
  rt.is_ambient,
  c.story_time_ref   as story_time_ref,
  rs.manuscript_ref,
  c.title            as chapter_title,
  c.manuscript_order,
  rs.is_correction,
  rs.known_by,
  rs.note,
  rs.created_at,
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('entity_id', e.id, 'title', e.title, 'role', rp.role)
        order by e.title
      ),
      '[]'::jsonb
    )
    from relationship_participants rp
    join entities e on e.id = rp.entity_id and e.deleted_at is null
    where rp.relationship_id = rs.relationship_id
  ) as participants
from relationship_states rs
join relationships r        on r.id = rs.relationship_id and r.deleted_at is null
join relationship_types rt  on rt.id = rs.type_id
left join chapters c        on c.id = rs.manuscript_ref and c.deleted_at is null;
