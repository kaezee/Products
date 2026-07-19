-- Kronicler — a band can carry an in-world time frame ("Year 2000–2100",
-- "Three winters", "The Long Night"). Free text, so it fits any calendar the
-- world uses. This is the first surfacing of the second clock (story time) on
-- the timeline, alongside narrative order.
alter table bands add column if not exists time_frame text;
