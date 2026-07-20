-- Kronicler — the World Timeline. A band becomes a VOLUME: a span with an
-- in-world year range (start_ref → end_ref) so it can be drawn as a bar on the
-- world's time ruler. Its SERIES is the existing bands.story label (volumes that
-- share a story stack in one lane). Chapters ride inside a volume (band_id) at
-- their own in-world date. Nullable + additive; a band with no range falls back
-- to the span of the chapters it holds.
alter table bands add column if not exists start_ref integer;
alter table bands add column if not exists end_ref integer;
