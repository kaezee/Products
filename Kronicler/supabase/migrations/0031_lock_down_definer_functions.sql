-- 0031: revoke client EXECUTE on privileged/internal SECURITY DEFINER functions
-- (security-hardening pass). These were reachable by `anon` and `authenticated`
-- — i.e. by any guest — even though none is meant to be called from the client.
--
-- Findings this closes:
--   * purge_expired_trash(interval): NO auth check and NO owner scoping — it
--     deletes expired trash for EVERY user. A guest could call it with a zero/
--     negative interval and permanently wipe all users' soft-deleted content
--     before the 30-day grace period. Its only legitimate caller is the daily
--     pg_cron job `kronicler-purge-expired-trash`, which runs as the job owner
--     (postgres), so this revoke does not touch the scheduled purge.
--   * _seed_sample_world(p_owner), _apply_sample_prose(p_world),
--     _anchor_sample_states(p_world): internal seed helpers that take an
--     arbitrary owner/world id and run SECURITY DEFINER (bypassing RLS). Exposed
--     to clients they are cross-tenant WRITE vectors — seed junk into another
--     user's account, or inject prose/states into a victim's world. They exist
--     only to be called by seed_sample_world(), which is itself SECURITY DEFINER
--     and so keeps calling them as the definer regardless of the caller's grant.
--
-- Left client-callable, by design:
--   * seed_sample_world()  — no args, seeds a world owned by auth.uid(); guests
--     need it for the example world on first run.
--   * purge_trash_item(kind, id) — already owner-scoped (checks auth.uid() and
--     owner_id before purging), so a guest can only purge their own trash.
--
-- Idempotent: REVOKE of a grant that is already absent is a no-op.

revoke execute on function public.purge_expired_trash(interval)  from anon, authenticated, public;
revoke execute on function public._seed_sample_world(uuid)       from anon, authenticated, public;
revoke execute on function public._apply_sample_prose(uuid)      from anon, authenticated, public;
revoke execute on function public._anchor_sample_states(uuid)    from anon, authenticated, public;
