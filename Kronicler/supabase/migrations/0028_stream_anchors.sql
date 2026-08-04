-- Kronicler — expose the moment prose anchor through the signature-query view so
-- the Continuity panel (repair path) and the margin indicator can read it. Purely
-- additive: new columns appended after the existing set, security_invoker kept, so
-- the legacy build's reads are unchanged.

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
  rs.story_time_ref,
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
  ) as participants,
  rs.anchor_quote,
  rs.anchor_prefix,
  rs.anchor_suffix,
  rs.anchor_start,
  rs.anchor_end,
  rs.anchor_status
from relationship_states rs
join relationships r        on r.id = rs.relationship_id and r.deleted_at is null
join relationship_types rt  on rt.id = rs.type_id
left join chapters c        on c.id = rs.manuscript_ref and c.deleted_at is null;
