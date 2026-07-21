-- Kronicler — the World Timeline's backbone: a RECURSIVE tree of segments.
-- A segment is one span-line on the world clock (Series / Book / Season / Volume
-- / anything). parent_id lets them nest to any depth, writer's choice — the app
-- doesn't impose the levels. A segment's drawn span (start_ref/end_ref) is a
-- fallback; its effective span auto-grows AND shrinks to hug its dated chapters
-- and child segments (computed in the app). Chapters attach via segment_id and
-- sit at their own in-world date.
create table if not exists segments (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references worlds(id),
  parent_id   uuid references segments(id),
  kind        text not null default 'segment',
  name        text not null default 'New segment',
  color       text,
  seg_order   integer not null default 0,
  start_ref   integer,
  end_ref     integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  legacy_band_id uuid
);
create index segments_world_idx on segments(world_id) where deleted_at is null;
create index segments_parent_idx on segments(parent_id);
create trigger segments_set_updated_at before update on segments for each row execute function set_updated_at();
alter table segments enable row level security;
create policy "owner full access" on segments
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

alter table chapters add column if not exists segment_id uuid references segments(id);

-- One-time seed from existing arcs (bands) so the timeline isn't empty:
insert into segments (world_id, kind, name)
select distinct world_id, 'series', trim(story)
from bands where story is not null and trim(story) <> '' and deleted_at is null;

insert into segments (world_id, parent_id, kind, name, color, seg_order, start_ref, end_ref, legacy_band_id)
select b.world_id,
  (select s.id from segments s where s.world_id = b.world_id and s.kind = 'series' and s.name = trim(b.story) limit 1),
  'volume', b.name, b.color, b.band_order, b.start_ref, b.end_ref, b.id
from bands b where b.deleted_at is null;

update chapters c set segment_id = s.id
from segments s where s.legacy_band_id = c.band_id and c.band_id is not null;
