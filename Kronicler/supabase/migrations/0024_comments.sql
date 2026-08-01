-- Kronicler — Comments (IA restructure §6): margin comments anchored to a range
-- of a chapter's prose. Additive only — a new table, nothing existing changes,
-- so the navigation trial stays fully revertable. The anchor is stored as plain-
-- text character offsets into the chapter body (same coordinate space the editor
-- already counts for the caret), plus the quoted text so a comment can re-find
-- its spot — or flag itself detached — if the prose around it is edited.
-- Per-world RLS like every other table; soft-deletable.
create table comments (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references worlds(id),
  chapter_id    uuid not null references chapters(id),
  body          text not null default '',
  anchor_start  int not null default 0,
  anchor_end    int not null default 0,
  quote         text not null default '',
  resolved      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index comments_chapter_id_idx on comments(chapter_id) where deleted_at is null;

create trigger comments_set_updated_at
  before update on comments
  for each row execute function set_updated_at();

alter table comments enable row level security;

create policy "owner full access" on comments
  for all using (world_id in (select id from worlds where owner_id = auth.uid()))
  with check (world_id in (select id from worlds where owner_id = auth.uid()));
