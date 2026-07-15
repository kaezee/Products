-- Kronicler — Phase 0 schema
-- Implements PRD v2 §5 (core data model) + §10 (soft-delete/undo trust requirement).
-- Ownership is per-world, not per-user (§5.1), so collaboration later is a
-- world_collaborators join table, never a migration.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── worlds ──────────────────────────────────────────────────────────────

create table worlds (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger worlds_set_updated_at
  before update on worlds
  for each row execute function set_updated_at();

create index worlds_owner_id_idx on worlds(owner_id) where deleted_at is null;

-- ── entities ────────────────────────────────────────────────────────────
-- aliases[] is load-bearing (§5.1 v2 change): the quick switcher and the
-- mention scan match on it, not just title. Never treat it as cosmetic.

create table entities (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references worlds(id),
  type       text not null,
  title      text not null,
  aliases    text[] not null default '{}',
  body       text not null default '',
  tags       text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger entities_set_updated_at
  before update on entities
  for each row execute function set_updated_at();

create index entities_world_id_idx on entities(world_id) where deleted_at is null;
create index entities_world_type_idx on entities(world_id, type) where deleted_at is null;
create index entities_aliases_idx on entities using gin(aliases);

-- ── chapters (now carry the manuscript, §5.5) ──────────────────────────
-- Chapters are manuscript structure, never graph nodes: they intentionally
-- never join the relationships table. Their only link to the engine is
-- indirect, via relationship_states.manuscript_ref below.

create table chapters (
  id               uuid primary key default gen_random_uuid(),
  world_id         uuid not null references worlds(id),
  title            text not null,
  manuscript_order integer not null,
  story_time_ref   integer,
  body             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create trigger chapters_set_updated_at
  before update on chapters
  for each row execute function set_updated_at();

create index chapters_world_id_idx on chapters(world_id) where deleted_at is null;
create index chapters_world_manuscript_order_idx on chapters(world_id, manuscript_order) where deleted_at is null;

-- chapter_versions is non-negotiable in phase 1 (§5.5): writers forgive a
-- lost tag, never a lost paragraph. No soft-delete here — versions are
-- immutable history, not a mutable resource.

create table chapter_versions (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id),
  body       text not null,
  created_at timestamptz not null default now()
);

create index chapter_versions_chapter_id_idx on chapter_versions(chapter_id, created_at desc);

-- chapter_entities rows are largely derived by the mention scan (§7.4) and
-- confirmed by the writer, not hand-entered — but the schema doesn't care
-- how a row got here.

create table chapter_entities (
  chapter_id uuid not null references chapters(id),
  entity_id  uuid not null references entities(id),
  role       text not null check (role in ('pov', 'mentioned', 'present')),
  primary key (chapter_id, entity_id)
);

create index chapter_entities_entity_id_idx on chapter_entities(entity_id);

-- ── relationship_types ─────────────────────────────────────────────────
-- Writer-extensible vocabulary (§5.2). Structural annotations (valence,
-- color, is_ambient) are engine-owned and never inferred from the label —
-- the label itself carries no meaning the engine reads.

create table relationship_types (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references worlds(id),
  label      text not null,
  valence    text not null default 'neutral'
             check (valence in ('positive', 'neutral', 'negative')),
  color      text,
  is_ambient boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (world_id, label)
);

create index relationship_types_world_id_idx on relationship_types(world_id) where deleted_at is null;

-- Starter vocabulary seeding (§5.2, build order item 2): every new world
-- gets ~10 neutral, genre-agnostic types. Seed rows carry no special status —
-- fully renameable/deletable, identical to writer-minted types (§3).
create or replace function seed_starter_relationship_types()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into relationship_types (world_id, label, valence, is_ambient) values
    (new.id, 'ally',         'positive', false),
    (new.id, 'rival',        'negative', false),
    (new.id, 'family',       'neutral',  false),
    (new.id, 'member of',    'neutral',  true),
    (new.id, 'located in',   'neutral',  true),
    (new.id, 'knows about',  'neutral',  false),
    (new.id, 'owes',         'negative', false),
    (new.id, 'mentor of',    'positive', false),
    (new.id, 'enemy of',     'negative', false),
    (new.id, 'allied with',  'positive', false);
  return new;
end;
$$;

create trigger worlds_seed_starter_vocabulary
  after insert on worlds
  for each row execute function seed_starter_relationship_types();

-- ── relationships (multi-party from day one, §5.3) ────────────────────
-- Schema stays multi-party even though phase 1 UI only renders pairwise —
-- retrofitting pairwise to multi-party later is expensive; doing it now isn't.

create table relationships (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references worlds(id),
  type_id    uuid not null references relationship_types(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index relationships_world_id_idx on relationships(world_id) where deleted_at is null;
create index relationships_type_id_idx on relationships(type_id);

create table relationship_participants (
  relationship_id uuid not null references relationships(id),
  entity_id       uuid not null references entities(id),
  role            text,
  primary key (relationship_id, entity_id)
);

create index relationship_participants_entity_id_idx on relationship_participants(entity_id);

-- ── relationship_states (the append-only timeline core, §5.4) ─────────
-- A relationship's history is a sequence of states, never a mutated row —
-- this is what makes "every betrayal ordered by chapter" a plain query.
--
-- known_by semantics (locked, v2): everyone in scope knows a state by
-- default, at zero input cost. This column is EXCEPTION-ONLY — null means
-- "default: everyone knows"; a non-null value records who is concealed
-- from it. Never treat null here as "unknown" — it means "known," which is
-- why ~90% of rows should never touch this column.

create table relationship_states (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references relationships(id),
  type_id          uuid not null references relationship_types(id),
  story_time_ref   integer,
  manuscript_ref   uuid references chapters(id),
  is_correction    boolean not null default false,
  known_by         jsonb,
  note             text,
  created_at       timestamptz not null default now()
);

create index relationship_states_relationship_id_idx on relationship_states(relationship_id, created_at);
create index relationship_states_manuscript_ref_idx on relationship_states(manuscript_ref);
create index relationship_states_story_time_ref_idx on relationship_states(story_time_ref);

-- ── Row-level security ─────────────────────────────────────────────────
-- Ownership is per-world (§5.1). Every child table is scoped through its
-- world_id (directly, or via its parent) so a collaborators table later
-- only ever needs to widen these policies, never restructure them.

alter table worlds enable row level security;
alter table entities enable row level security;
alter table chapters enable row level security;
alter table chapter_versions enable row level security;
alter table chapter_entities enable row level security;
alter table relationship_types enable row level security;
alter table relationships enable row level security;
alter table relationship_participants enable row level security;
alter table relationship_states enable row level security;

create policy "owner full access" on worlds
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner full access" on entities
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

create policy "owner full access" on chapters
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

create policy "owner full access" on chapter_versions
  for all using (chapter_id in (
    select id from chapters where world_id in (select id from worlds where owner_id = auth.uid())
  ))
  with check (chapter_id in (
    select id from chapters where world_id in (select id from worlds where owner_id = auth.uid())
  ));

create policy "owner full access" on chapter_entities
  for all using (chapter_id in (
    select id from chapters where world_id in (select id from worlds where owner_id = auth.uid())
  ))
  with check (chapter_id in (
    select id from chapters where world_id in (select id from worlds where owner_id = auth.uid())
  ));

create policy "owner full access" on relationship_types
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

create policy "owner full access" on relationships
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

create policy "owner full access" on relationship_participants
  for all using (relationship_id in (
    select id from relationships where world_id in (select id from worlds where owner_id = auth.uid())
  ))
  with check (relationship_id in (
    select id from relationships where world_id in (select id from worlds where owner_id = auth.uid())
  ));

create policy "owner full access" on relationship_states
  for all using (relationship_id in (
    select id from relationships where world_id in (select id from worlds where owner_id = auth.uid())
  ))
  with check (relationship_id in (
    select id from relationships where world_id in (select id from worlds where owner_id = auth.uid())
  ));
