-- Kronicler — Phase 1: the signature query (PRD v2 §9.2 Relationships/Stream,
-- build order item 3).
--
-- "The answer to why Kronicler over a spreadsheet": a denormalized stream of
-- relationship_states that any consumer can filter (by type, participant,
-- valence, known-by exception) and order by EITHER axis (manuscript order or
-- story time). The engine supports both axes unconditionally; the UI decides
-- when to expose the story-time toggle (§9.4 progressive disclosure) — that's a
-- presentation choice, not an engine one.
--
-- Key modelling facts this view encodes:
--   * The type label comes from the STATE's type_id, not the relationship's.
--     A relationship's type changes over time (ally → rival → enemy); each
--     state carries the type as-of that moment. This is what makes tracking a
--     transition a plain ordered read.
--   * Participants are multi-party (§5.3), aggregated into a json array here.
--   * Soft-deleted relationships / entities / chapters are excluded (§10).
--   * is_correction is surfaced, not hidden — the canonical "timeline of record"
--     read filters `is_correction = false`, but the column is exposed so a
--     history/audit view can include corrections when it wants them (§5.4).
--
-- security_invoker = true is REQUIRED: without it the view runs with the
-- definer's rights and silently bypasses the per-world RLS on the base tables.
-- With it, every read through the view is still scoped to the caller's worlds.

create view relationship_state_stream
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
  ) as participants
from relationship_states rs
join relationships r        on r.id = rs.relationship_id and r.deleted_at is null
join relationship_types rt  on rt.id = rs.type_id
left join chapters c        on c.id = rs.manuscript_ref and c.deleted_at is null;

comment on view relationship_state_stream is
  'PRD v2 §9.2 signature query. Denormalized relationship_states for the '
  'Relationships/Stream. Filter with WHERE, order by manuscript_order or '
  'story_time_ref. Canonical timeline-of-record read adds is_correction = false.';
