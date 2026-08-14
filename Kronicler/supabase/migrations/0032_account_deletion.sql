-- Kronicler — account deletion (GDPR "delete my account") + the log behind it.
--
-- Two problems this solves:
--   1. Deleting a user in the Supabase dashboard failed with "Database error
--      deleting user". Every table is owner-scoped via worlds.owner_id →
--      auth.users(id), and those FKs are deliberately plain (no ON DELETE
--      CASCADE — hard-deletes route through the _k_purge_* helpers, see 0022).
--      So a user who owns any data can't be removed: the auth row is pinned.
--   2. The app had no way for a writer to ask for their account to be deleted,
--      and no record an operator could see and act on.
--
-- Rather than add ON DELETE CASCADE to ~20 constraints (which reverses the
-- plain-FK design and is easy to leave incomplete), we hook the delete: a
-- BEFORE DELETE trigger on auth.users purges everything the user owns first, so
-- by the time the auth row is removed nothing references it and the delete
-- succeeds. It reuses _k_purge_worlds — the same tested teardown the Trash uses.

-- ── 1. Fix _k_purge_worlds: it never deleted comments (added later, 0024) ─────
-- comments.world_id → worlds and comments.chapter_id → chapters are both plain,
-- so a world (or account) with comments could not be purged. Add them, before
-- chapters are removed.
create or replace function _k_purge_worlds(p_ids uuid[])
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;

  delete from relationship_states s using relationships r
    where s.relationship_id = r.id and r.world_id = any(p_ids);
  delete from relationship_participants rp using relationships r
    where rp.relationship_id = r.id and r.world_id = any(p_ids);
  delete from relationships where world_id = any(p_ids);

  delete from chapter_entities ce using chapters c
    where ce.chapter_id = c.id and c.world_id = any(p_ids);
  delete from chapter_entities ce using entities e
    where ce.entity_id = e.id and e.world_id = any(p_ids);
  delete from chapter_versions cv using chapters c
    where cv.chapter_id = c.id and c.world_id = any(p_ids);

  delete from comments where world_id = any(p_ids);  -- refs chapters + worlds
  delete from notes where world_id = any(p_ids);
  delete from timeline_markers where world_id = any(p_ids);

  delete from chapters where world_id = any(p_ids);        -- frees segment/band refs
  delete from entities where world_id = any(p_ids);
  delete from relationship_types where world_id = any(p_ids);

  update segments set parent_id = null where world_id = any(p_ids); -- self-FK
  delete from segments where world_id = any(p_ids);
  delete from bands where world_id = any(p_ids);
  delete from entity_types where world_id = any(p_ids);
  delete from segment_kinds where world_id = any(p_ids);

  delete from worlds where id = any(p_ids);
end $$;

-- ── 2. The deletion-request log (what an operator monitors) ───────────────────
-- user_id is a PLAIN uuid, not a FK — so the request row survives after the auth
-- user is deleted, leaving an audit trail. email is copied in for the same reason.
create table if not exists account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  email        text,
  reason       text,
  status       text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists account_deletion_requests_status_idx
  on account_deletion_requests(status, requested_at);

alter table account_deletion_requests enable row level security;

-- A signed-in user may file their own request and read it back. No update/delete
-- for ordinary users — an operator processes it from the dashboard (service role,
-- which bypasses RLS).
create policy "file own deletion request" on account_deletion_requests
  for insert with check (user_id = auth.uid());
create policy "read own deletion request" on account_deletion_requests
  for select using (user_id = auth.uid());

-- ── 3. Purge-on-delete: unpin the auth row so deletion (dashboard or API) works ─
create or replace function handle_auth_user_delete()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare w_ids uuid[];
begin
  select array_agg(id) into w_ids from worlds where owner_id = old.id;
  perform _k_purge_worlds(w_ids);
  -- Close out any pending request so the log reflects that it's been actioned.
  update account_deletion_requests
     set status = 'completed', processed_at = now()
   where user_id = old.id and status = 'pending';
  return old;
end $$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function handle_auth_user_delete();
