-- 0030: additive `source` on notes (Foundations-before-auth handoff §4.4).
-- Records where a note was captured — 'app' (default), 'import', or 'mobile'
-- (the PWA capture path, later). This is the only way to later measure whether
-- mobile capture is actually used, so the column is added now while it's free.
--
-- Additive and legacy-safe: the legacy build inserts notes without `source`, so
-- those rows take the default 'app'; the CHECK only ever sees the three valid
-- values (default fills every omitted insert), so no legacy write can fail.

alter table notes
  add column if not exists source text not null default 'app';

alter table notes
  drop constraint if exists notes_source_check;

alter table notes
  add constraint notes_source_check
  check (source in ('app', 'import', 'mobile'));
