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

-- 1. Known starter kinds — set by label across every world (confirmed mapping).
--    Directed, with a natural converse:
update relationship_types set directed = true, converse = 'child of'   where label = 'mother of' and converse is null;
update relationship_types set directed = true, converse = 'child of'   where label = 'father of' and converse is null;
update relationship_types set directed = true, converse = 'student of' where label = 'mentor of' and converse is null;
update relationship_types set directed = true, converse = 'has member' where label = 'member of' and converse is null;
update relationship_types set directed = true, converse = 'is owed by' where label = 'owes'      and converse is null;
--    Directed, no natural converse:
update relationship_types set directed = true where label in ('lives in', 'located in', 'works in');
--    Both ways (symmetric) — explicit, though false is already the default:
update relationship_types set directed = false, converse = null
  where label in ('family', 'rival', 'allied with', 'enemy of', 'knows about', 'ally');

-- 2. User-created kinds: derive direction from existing records. A kind whose
--    records carry a reverse word on the OBJECT side (a participant role that
--    isn't the kind's own label) is directed; lift the most common such word
--    into converse. Never touches the record rows themselves.
with obj_roles as (
  select rt.id as type_id, rp.role as word, count(*) as n
  from relationship_types rt
  join relationships r on r.type_id = rt.id
  join relationship_participants rp on rp.relationship_id = r.id
  where rp.role is not null
    and rp.role <> ''
    and lower(rp.role) <> lower(rt.label)
    and rt.directed = false
    and rt.converse is null
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
