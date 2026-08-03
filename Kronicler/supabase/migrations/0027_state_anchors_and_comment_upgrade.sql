-- Kronicler — Dependency pass: prose anchors for moments, and comments upgraded
-- to the same W3C Web Annotation model. ONE additive pass (no new tables, no
-- rename: `relationship_states` stays, the UI still says "moment").
--
-- Every column here is NULLABLE by design:
--   * corrections (is_correction) and states minted from the graph / an entity
--     page have no prose to anchor to;
--   * so the margin indicator renders only for anchored states, while the
--     per-chapter count counts everything with a manuscript_ref (anchored or not).
-- Nullable columns are invisible to the legacy build (it selects explicit
-- columns and never reads these), so model-a is unaffected.

-- ── moments (relationship_states) get an anchor ─────────────────────────────
alter table relationship_states
  add column if not exists anchor_quote  text,
  add column if not exists anchor_prefix text,
  add column if not exists anchor_suffix text,
  add column if not exists anchor_start  int,
  add column if not exists anchor_end    int,
  add column if not exists anchor_status text
    check (anchor_status is null or anchor_status in ('ok', 'stale'));

-- Fast lookup of a chapter's anchored states for the margin gutter.
create index if not exists relationship_states_anchor_idx
  on relationship_states(manuscript_ref)
  where anchor_start is not null;

-- ── comments: upgrade to the full model (they already carry offsets + quote) ──
-- prefix/suffix for disambiguation; anchor_status so a detached comment is
-- marked 'stale' and repairable, never silently dropped on reload (a real bug in
-- the current in-memory-only detach path).
alter table comments
  add column if not exists anchor_prefix text,
  add column if not exists anchor_suffix text,
  add column if not exists anchor_status text
    check (anchor_status is null or anchor_status in ('ok', 'stale'));
