-- Phase 1 schema: auth, bars cache, trips, stops, drink logs.
-- crawls / feed_posts / friends land in later phases.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.bars (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique,
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  photo_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_distance_m integer,
  total_duration_s integer,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  bar_id uuid not null references public.bars (id),
  stop_order integer not null,
  arrived_at timestamptz not null default now(),
  left_at timestamptz,
  unique (trip_id, stop_order)
);

create table if not exists public.drink_logs (
  id uuid primary key default gen_random_uuid(),
  trip_stop_id uuid not null references public.trip_stops (id) on delete cascade,
  drink_name text,
  logged_at timestamptz not null default now()
);

create index if not exists trip_stops_trip_id_idx on public.trip_stops (trip_id);
create index if not exists drink_logs_trip_stop_id_idx on public.drink_logs (trip_stop_id);
create index if not exists trips_user_id_idx on public.trips (user_id);

-- Row Level Security: every user only sees/writes their own trip data.
-- bars is a shared read-only cache of Google Places results.

alter table public.profiles enable row level security;
alter table public.bars enable row level security;
alter table public.trips enable row level security;
alter table public.trip_stops enable row level security;
alter table public.drink_logs enable row level security;

create policy "profiles are readable by their owner" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles are updatable by their owner" on public.profiles
  for update using (auth.uid() = id);

create policy "bars are readable by any authenticated user" on public.bars
  for select using (auth.role() = 'authenticated');
create policy "bars are insertable by any authenticated user" on public.bars
  for insert with check (auth.role() = 'authenticated');
create policy "bars are updatable by any authenticated user" on public.bars
  for update using (auth.role() = 'authenticated');

create policy "trips are readable by their owner" on public.trips
  for select using (auth.uid() = user_id);
create policy "trips are insertable by their owner" on public.trips
  for insert with check (auth.uid() = user_id);
create policy "trips are updatable by their owner" on public.trips
  for update using (auth.uid() = user_id);

create policy "trip stops are readable by the trip owner" on public.trip_stops
  for select using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );
create policy "trip stops are insertable by the trip owner" on public.trip_stops
  for insert with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );
create policy "trip stops are updatable by the trip owner" on public.trip_stops
  for update using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

create policy "drink logs are readable by the trip owner" on public.drink_logs
  for select using (
    exists (
      select 1 from public.trip_stops s
      join public.trips t on t.id = s.trip_id
      where s.id = trip_stop_id and t.user_id = auth.uid()
    )
  );
create policy "drink logs are insertable by the trip owner" on public.drink_logs
  for insert with check (
    exists (
      select 1 from public.trip_stops s
      join public.trips t on t.id = s.trip_id
      where s.id = trip_stop_id and t.user_id = auth.uid()
    )
  );
