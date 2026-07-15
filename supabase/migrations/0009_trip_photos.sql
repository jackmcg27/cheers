-- Trip photos: one optional photo per trip, stored in a public "trip-photos" Storage bucket
-- under `${user_id}/${trip_id}.jpg`, with `trips.photo_url` pointing at the public URL.
-- Public read (visible on Feed cards to anyone who can already see the post, and simplest to
-- serve directly with no signed-URL refresh logic) but owner-only write, enforced by checking
-- the first path segment against auth.uid() -- same "path is namespaced by owner" convention
-- Supabase's own docs use for per-user storage.

alter table public.trips add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', true)
on conflict (id) do nothing;

create policy "trip photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'trip-photos');

create policy "trip photos are insertable by their owner"
  on storage.objects for insert
  with check (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "trip photos are updatable by their owner"
  on storage.objects for update
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "trip photos are deletable by their owner"
  on storage.objects for delete
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);
