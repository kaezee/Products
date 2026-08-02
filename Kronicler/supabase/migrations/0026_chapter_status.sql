-- Chapter status: replace the binary `planned` flag with a small named set.
-- Planned · Draft · Review · Ready · On Hold.
--
-- Additive and back-compatible: `planned` stays as a column so the legacy build
-- keeps working, and a trigger keeps the two in sync in both directions —
-- writing `status` derives `planned`, and writing `planned` (old path) derives
-- `status`. `planned` is true exactly when status is 'planned'.

alter table chapters add column if not exists status text not null default 'draft';

-- backfill from the existing flag
update chapters set status = case when planned then 'planned' else 'draft' end;

alter table chapters drop constraint if exists chapters_status_check;
alter table chapters add constraint chapters_status_check
  check (status in ('planned','draft','review','ready','on_hold'));

create or replace function chapters_status_sync()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- a seeded/imported row may set planned directly; let it win, else derive
    if new.planned then new.status := 'planned';
    else new.planned := (new.status = 'planned');
    end if;
  else
    if new.status is distinct from old.status then
      new.planned := (new.status = 'planned');
    elsif new.planned is distinct from old.planned then
      if new.planned then new.status := 'planned';
      elsif old.status = 'planned' then new.status := 'draft';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_chapters_status_sync on chapters;
create trigger trg_chapters_status_sync
  before insert or update on chapters
  for each row execute function chapters_status_sync();
