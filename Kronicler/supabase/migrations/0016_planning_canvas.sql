-- Kronicler — the Timeline becomes a planning canvas.
--
-- (1) A chapter can be PLANNED: a placeholder beat you've dated/placed but not
--     written yet. It shows on the timeline (and manuscript, badged) and simply
--     stops being "planned" once you write it — a placeholder that becomes real.
alter table chapters add column if not exists planned boolean not null default false;

-- (2) Timeline markers: things that live ONLY on the timeline, never in the
--     manuscript — a labelled date line ("1150 AE"), an era/event ("The Great
--     War"), or an explicit time-skip divider. Each can sit in a story lane.
create table if not exists timeline_markers (
  id                uuid primary key default gen_random_uuid(),
  world_id          uuid not null references worlds(id),
  kind              text not null default 'event',   -- 'date' | 'event' | 'timeskip'
  label             text,
  story_time_ref    integer,                          -- sortable key (see lib/time)
  story_time_label  text,                             -- display date ("1150 AE")
  story             text,                             -- lane; null = spans / main
  color             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index timeline_markers_world_idx on timeline_markers(world_id) where deleted_at is null;

create trigger timeline_markers_set_updated_at
  before update on timeline_markers
  for each row execute function set_updated_at();

alter table timeline_markers enable row level security;

create policy "owner full access" on timeline_markers
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));
