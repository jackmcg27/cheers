-- Track who was on a trip and log drinks per person, not just the trip owner. A companion is
-- either a linked app user (free "tag anyone" add, no follow/consent required — matches the
-- app's existing lightweight follow model) or a free-text guest name for a friend who isn't on
-- the app. Per-trip only: nothing persists across trips, same scope as drink_logs today.

create table if not exists public.trip_companions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  guest_name text,
  created_at timestamptz not null default now(),
  check (user_id is not null or guest_name is not null)
);

alter table public.drink_logs
  add column if not exists companion_id uuid references public.trip_companions (id) on delete cascade;

create index if not exists trip_companions_trip_id_idx on public.trip_companions (trip_id);
create index if not exists drink_logs_companion_id_idx on public.drink_logs (companion_id);

alter table public.trip_companions enable row level security;

create policy "trip companions are readable by the trip owner" on public.trip_companions
  for select using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );
create policy "trip companions are insertable by the trip owner" on public.trip_companions
  for insert with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );
create policy "trip companions are deletable by the trip owner" on public.trip_companions
  for delete using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );
