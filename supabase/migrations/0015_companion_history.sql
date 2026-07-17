-- Companions should see trips they were tagged on in their own History, not just trips they
-- host — and since a companion's `trip_companions` row can't be hard-deleted to "remove" a trip
-- (drink_logs.companion_id cascades on delete per 0007, which would destroy their drink data for
-- everyone else on the crawl too), removal from a companion's own History has to be a soft unlink
-- instead: a `hidden_at` timestamp on their own row, filtered out client-side when building their
-- History list. The host's and other companions' view of the trip (and this companion's drink
-- attribution within it) is completely unaffected.
--
-- No new RLS policy is needed for the write: 0011's "invitee can respond to their own invite"
-- policy already covers `user_id = auth.uid()` on trip_companions with no column restriction at
-- the row-policy level — only the column-level grant needs extending.
--
-- Reading a companion's own `trips` row was already possible before this migration (0011's
-- "trips are readable by their companions" policy has no status filter), so no `trips` SELECT
-- policy change is needed either — this migration is grants + one column.

alter table public.trip_companions
  add column if not exists hidden_at timestamptz;

grant update (hidden_at) on public.trip_companions to authenticated;

-- Unrelated fix bundled in here since it's the same "column grant" shape and was only just
-- discovered: 0013's `revoke update on public.trips` narrowed the update-able column list but
-- missed `photo_url` (added by 0009, before that revoke existed), silently breaking
-- uploadTripPhoto/removeTripPhoto for every trip owner on any project with 0013 applied.
grant update (photo_url) on public.trips to authenticated;
