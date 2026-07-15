-- Kronicler — schema refinement 0003, driven by the ratified interaction
-- prototype (Kronicler/prototype/interaction-prototype-v2.jsx).
--
-- Two engine-level changes the prototype surfaced, plus one clarification:
--
--   1. Valence gains an 'obligation' family. The prototype colors the debt
--      economy (indebted → repaid) as its own family, distinct from
--      friendly/hostile. The old 3-value enum (positive/neutral/negative)
--      forced debts into 'negative' — modelling an oath as enmity. Given the
--      debt economy is central to this world (PRD §9.3 typed sub-networks),
--      obligation earns first-class status. Names align to the prototype's
--      own families so the UI maps 1:1: bond / hostile / obligation / neutral.
--      is_ambient stays a SEPARATE boolean axis (it's about change-expectation
--      / dormancy per §5.2, not colour) — the prototype conflated the two; we
--      keep them orthogonal so e.g. an ambient bond is expressible.
--
--   2. relationship_types gains is_terminal. A "closing" type — debt repaid,
--      item lost — concludes a thread and must be excluded from dormant-thread
--      detection (§9.2). The prototype did this by hardcoding the type NAMES
--      'repaid'/'lost', which §5.2 explicitly forbids ("no hardcoded type-name
--      lists — there are none"). is_terminal is the structural flag that
--      replaces the name check, mirroring how is_ambient already works.
--
--   3. known_by shape is locked (see comment) so every surface agrees.

-- 1a. Migrate any existing valence data to the new vocabulary. No-op on a
--     world-less database; correct for already-seeded worlds and local tests.
update relationship_types set valence = 'bond'    where valence = 'positive';
update relationship_types set valence = 'hostile' where valence = 'negative';
-- reassign the seeded 'owes' type into the new family (best-effort by label)
update relationship_types set valence = 'obligation' where label = 'owes' and valence = 'neutral';

-- 1b. Swap the check constraint to the new family set.
alter table relationship_types drop constraint relationship_types_valence_check;
alter table relationship_types
  add constraint relationship_types_valence_check
  check (valence in ('bond', 'hostile', 'obligation', 'neutral'));

-- 2. The structural "this type closes a thread" flag.
alter table relationship_types
  add column is_terminal boolean not null default false;

comment on column relationship_types.is_terminal is
  'True for types that conclude a thread (e.g. debt repaid, item lost). '
  'Excluded from dormant-thread detection (§9.2) — replaces any hardcoded '
  'type-name list, which the doctrine forbids.';

-- 3. Lock the known_by shape. EXCEPTION-ONLY (§5.4): null = everyone in scope
--    knows; otherwise the object names who is concealed from the state.
comment on column relationship_states.known_by is
  'EXCEPTION-ONLY concealment (§5.4). null means everyone involved + the '
  'reader know this state (the ~90% case). When present, the shape is '
  '{"concealed_from": [entity_id, ...]}. Never treat null as "unknown".';

-- 4. Reseed function: new valence names, owes → obligation, and a paired
--    terminal "debt repaid" so the obligation family can be opened AND closed
--    out of the box. Everything remains renameable/deletable seed data (§3).
create or replace function seed_starter_relationship_types()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into relationship_types (world_id, label, valence, is_ambient, is_terminal) values
    (new.id, 'ally',        'bond',       false, false),
    (new.id, 'rival',       'hostile',    false, false),
    (new.id, 'family',      'neutral',    false, false),
    (new.id, 'member of',   'neutral',    true,  false),
    (new.id, 'located in',  'neutral',    true,  false),
    (new.id, 'knows about', 'neutral',    false, false),
    (new.id, 'owes',        'obligation', false, false),
    (new.id, 'debt repaid', 'obligation', false, true),
    (new.id, 'mentor of',   'bond',       false, false),
    (new.id, 'enemy of',    'hostile',    false, false),
    (new.id, 'allied with', 'bond',       false, false);
  return new;
end;
$$;
