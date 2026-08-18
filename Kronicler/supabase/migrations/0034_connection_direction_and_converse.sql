-- 0034 — Connection direction & converse (entity-connections handoff §2.1)
--
-- A relationship *kind* now carries how it reads, instead of each record:
--   directed  — false = reads the same both ways (rival, family); true = one way
--               (mother of, lives in).
--   converse  — optional reverse WORD for a directed kind (mother of → child of).
--               May stay null (lives in has no natural converse).
--
-- ADDITIVE ONLY: nullable / defaulted columns, no drops, no renames. The legacy
-- build never reads these, and the per-record participant `role` words are left
-- fully intact — this migration only lifts information UP onto the kind.

alter table relationship_types add column if not exists directed boolean not null default false;
alter table relationship_types add column if not exists converse text;

-- 1. Record-derived first: a kind whose connections carry a reverse word on the
--    OBJECT side (a participant role that isn't the kind's own label) is directed;
--    lift the most common such word into converse. Never touches the record rows.
with obj_roles as (
  select rt.id as type_id, rp.role as word, count(*) as n
  from relationship_types rt
  join relationships r on r.type_id = rt.id
  join relationship_participants rp on rp.relationship_id = r.id
  where rp.role is not null
    and rp.role <> ''
    and lower(rp.role) <> lower(rt.label)
  group by rt.id, rp.role
),
best as (
  select distinct on (type_id) type_id, word
  from obj_roles
  order by type_id, n desc
)
update relationship_types rt
  set directed = true, converse = best.word
  from best
  where best.type_id = rt.id;

-- 2. Known starter kinds override the derivation (case-insensitive; confirmed
--    mapping). Directed, with a natural converse:
update relationship_types set directed = true, converse = 'child of'   where lower(label) = 'mother of';
update relationship_types set directed = true, converse = 'child of'   where lower(label) = 'father of';
update relationship_types set directed = true, converse = 'student of' where lower(label) = 'mentor of';
update relationship_types set directed = true, converse = 'has member' where lower(label) = 'member of';
update relationship_types set directed = true, converse = 'is owed by' where lower(label) = 'owes';
--    Directed, converse left as whatever a record supplied (usually none):
update relationship_types set directed = true where lower(label) in ('lives in', 'located in', 'works in');

-- 3. Symmetric kinds are authoritative both-ways — run LAST so no derived junk
--    (e.g. a stray one-letter role) can leave them directed.
update relationship_types set directed = false, converse = null
  where lower(label) in ('family', 'rival', 'allied with', 'enemy of', 'knows about', 'ally');
