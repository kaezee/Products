-- Kronicler — the world's ENTITY TYPE registry (design doc 2). Each world owns
-- its own list of types (Character, Place, … plus any custom ones the writer
-- mints). A type carries the source of a mention's colour: a curated `swatch`
-- (one of the 12 entity swatches — an enum, never a raw hex, so themes stay in
-- control), a 1–2 char `mark` letter, and an underline `line_style`. This is
-- what lets custom types be coloured at all, and what makes mention colour
-- theme-aware instead of six hardcoded light-theme hexes.
create table if not exists entity_types (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references worlds(id) on delete cascade,
  name        text not null,
  mark        text not null check (char_length(mark) >= 1 and char_length(mark) <= 2),
  swatch      text not null check (swatch in
    ('azure','teal','green','moss','amber','ochre','rust','crimson','magenta','violet','plum','slate')),
  line_style  text not null default 'solid' check (line_style in ('solid','dotted','dashed')),
  is_builtin  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (world_id, name)
);
create index entity_types_world_idx on entity_types(world_id);
alter table entity_types enable row level security;
create policy "owner full access" on entity_types
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

-- Seed the six built-ins for every existing world, with their default swatches
-- (design doc 1 §3.6). New worlds get seeded by the app on creation.
insert into entity_types (world_id, name, mark, swatch, is_builtin, sort_order)
select w.id, t.name, t.mark, t.swatch, true, t.sort_order
from worlds w
cross join (values
  ('Character', 'C', 'azure', 0),
  ('Place',     'P', 'green', 1),
  ('Faction',   'F', 'amber', 2),
  ('Item',      'I', 'slate', 3),
  ('Event',     'E', 'rust',  4),
  ('Creature',  'R', 'plum',  5)
) as t(name, mark, swatch, sort_order)
on conflict (world_id, name) do nothing;
