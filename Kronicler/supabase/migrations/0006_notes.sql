-- Kronicler — Notes: a freeform planning surface (its own section). Cards live
-- on a board at free x/y positions; each can be tagged to entities and flagged
-- a secret (the bridge to the knowledge lens — a place to hold reveals you
-- haven't written yet). Per-world RLS like everything else; soft-deletable.
create table notes (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references worlds(id),
  body        text not null default '',
  is_secret   boolean not null default false,
  entity_ids  uuid[] not null default '{}',
  x           real not null default 40,
  y           real not null default 40,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index notes_world_id_idx on notes(world_id) where deleted_at is null;

create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

alter table notes enable row level security;

create policy "owner full access" on notes
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));
