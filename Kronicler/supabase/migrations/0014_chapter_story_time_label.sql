-- Kronicler — a human-readable in-world date LABEL on chapters ("1150 AE",
-- "Third Age 3019", "Spring, Year 2"). story_time_ref stays the sortable integer
-- key (parsed from the label's number when there is one, or set by hand); the
-- label is display-only and never used for ordering. Additive + nullable, so
-- existing chapters are untouched.
alter table chapters add column if not exists story_time_label text;
