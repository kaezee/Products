-- Kronicler — the Timeline's bands. A world's chapters run past → future along
-- one axis, grouped into named stretches: "Novel 1", "Season 4", "the Spin-off",
-- an era like "2000–2100". Same world, same cast, one continuous line — the
-- backbone that lets a character's arc be followed across multiple works.
create table bands (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references worlds(id),
  name        text not null default 'New band',
  band_order  integer not null default 0,   -- left → right on the timeline
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index bands_world_idx on bands(world_id) where deleted_at is null;

create trigger bands_set_updated_at
  before update on bands
  for each row execute function set_updated_at();

alter table bands enable row level security;

create policy "owner full access" on bands
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

-- A chapter (a written scene) and a note (a planned/future beat) can each live in
-- a band. Null = unsorted / not yet placed on the timeline.
alter table chapters add column if not exists band_id uuid references bands(id);
alter table notes    add column if not exists band_id uuid references bands(id);
