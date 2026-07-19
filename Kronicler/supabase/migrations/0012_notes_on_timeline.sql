-- Kronicler — a note can live on the Timeline canvas (draggable, optionally
-- pinned to a chapter/band with a connector) OR stay a loose thought on the
-- Notes board. This flag decides which home it shows in; x/y is its free
-- position on whichever canvas it's on.
alter table notes add column if not exists on_timeline boolean not null default false;

-- Notes that already carry a timeline anchor belong on the timeline.
update notes set on_timeline = true
where deleted_at is null
  and (plan_ref is not null or band_id is not null or (chapter_ids is not null and array_length(chapter_ids, 1) > 0));
