-- Design doc 3 §10: the world clock. Calendar + known time on worlds; authored
-- date + derived day-number on chapters and markers. Positioning/sorting/framing
-- all run on the day number; the {year,month,day} + precision is authored truth
-- and day_num is a recomputable cache (never the reverse).

alter table worlds
  add column if not exists calendar jsonb not null default
    '{"monthsPerYear":12,"monthLengths":[30,30,30,30,30,30,30,30,30,30,30,30]}'::jsonb,
  add column if not exists known_start_year int not null default 0,
  add column if not exists known_end_year   int not null default 1000;

alter table chapters
  add column if not exists time_year   int,
  add column if not exists time_month  int,
  add column if not exists time_day    int,
  add column if not exists time_precision text
    check (time_precision in ('year','month','day')),
  add column if not exists day_num_start bigint,
  add column if not exists day_num_end   bigint,
  add column if not exists anachronic boolean not null default false;
create index if not exists chapters_day_num_idx on chapters (world_id, day_num_start);

alter table timeline_markers
  add column if not exists time_year int,
  add column if not exists time_month int,
  add column if not exists time_day int,
  add column if not exists time_precision text
    check (time_precision in ('year','month','day')),
  add column if not exists day_num_start bigint,
  add column if not exists day_num_end bigint;

-- §10.1 Migrate story_time_ref → authored year-precision date. Honest: only the
-- year was ever known, so these render as year BANDS, not false Jan-1 points.
-- All existing worlds use the default 12×30 calendar (360 days/yr) set above.
update chapters set
  time_year      = story_time_ref,
  time_month     = 1,
  time_day       = 1,
  time_precision = 'year',
  day_num_start  = story_time_ref::bigint * 360,
  day_num_end    = story_time_ref::bigint * 360 + 359
where story_time_ref is not null and day_num_start is null;

update timeline_markers set
  time_year      = story_time_ref,
  time_month     = 1,
  time_day       = 1,
  time_precision = 'year',
  day_num_start  = story_time_ref::bigint * 360,
  day_num_end    = story_time_ref::bigint * 360 + 359
where story_time_ref is not null and day_num_start is null;
