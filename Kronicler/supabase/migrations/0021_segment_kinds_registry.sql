-- Design doc 3 §4.3: segment kinds get the same registry treatment as entity
-- types. `kind` was free text with a 4-entry colour map; writer-minted kinds
-- fell back to one grey-violet. Now each world owns its kinds, each with a
-- curated swatch from the same 12-colour entity palette (theme-aware, no hex).
create table if not exists segment_kinds (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references worlds(id) on delete cascade,
  name       text not null,
  swatch     text not null check (swatch in
    ('azure','teal','green','moss','amber','ochre','rust','crimson','magenta','violet','plum','slate')),
  is_builtin boolean not null default false,
  sort_order int not null default 0,
  unique (world_id, name)
);
create index if not exists segment_kinds_world_idx on segment_kinds(world_id);
alter table segment_kinds enable row level security;
create policy "owner full access" on segment_kinds
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));

-- Seed the five built-ins for every world (§4.3).
insert into segment_kinds (world_id, name, swatch, is_builtin, sort_order)
select w.id, k.name, k.swatch, true, k.sort_order
from worlds w
cross join (values
  ('series', 'plum',  0),
  ('book',   'azure', 1),
  ('season', 'teal',  2),
  ('volume', 'moss',  3),
  ('arc',    'ochre', 4)
) as k(name, swatch, sort_order)
on conflict (world_id, name) do nothing;

-- The per-segment colour override must be one of the twelve swatches, not free
-- hex (§4.3). Existing overrides are all null, so this is safe.
update segments set color = null
  where color is not null and color not in
    ('azure','teal','green','moss','amber','ochre','rust','crimson','magenta','violet','plum','slate');
alter table segments drop constraint if exists segments_color_swatch_check;
alter table segments add constraint segments_color_swatch_check
  check (color is null or color in
    ('azure','teal','green','moss','amber','ochre','rust','crimson','magenta','violet','plum','slate'));
