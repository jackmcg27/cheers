-- Phase 2/3: crawl routes, social feed, follows.

-- Feed posts, follow search, and crawl creator names all need to resolve display
-- names for users who aren't the viewer, so relax profiles visibility.
drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by any authenticated user" on public.profiles
  for select using (auth.role() = 'authenticated');

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table if not exists public.crawls (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crawl_stops (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls (id) on delete cascade,
  bar_id uuid not null references public.bars (id),
  stop_order integer not null,
  unique (crawl_id, stop_order)
);

alter table public.trips add column if not exists crawl_id uuid references public.crawls (id);

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists follows_followee_id_idx on public.follows (followee_id);
create index if not exists crawls_creator_id_idx on public.crawls (creator_id);
create index if not exists crawl_stops_crawl_id_idx on public.crawl_stops (crawl_id);
create index if not exists feed_posts_user_id_idx on public.feed_posts (user_id);
create index if not exists feed_posts_created_at_idx on public.feed_posts (created_at desc);
create index if not exists post_likes_post_id_idx on public.post_likes (post_id);
create index if not exists post_comments_post_id_idx on public.post_comments (post_id);

alter table public.follows enable row level security;
alter table public.crawls enable row level security;
alter table public.crawl_stops enable row level security;
alter table public.feed_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

create policy "follows are readable by any authenticated user" on public.follows
  for select using (auth.role() = 'authenticated');
create policy "users create their own follows" on public.follows
  for insert with check (auth.uid() = follower_id);
create policy "users remove their own follows" on public.follows
  for delete using (auth.uid() = follower_id);

create policy "public crawls readable by anyone, private by creator" on public.crawls
  for select using (is_public or creator_id = auth.uid());
create policy "creator inserts own crawls" on public.crawls
  for insert with check (creator_id = auth.uid());
create policy "creator updates own crawls" on public.crawls
  for update using (creator_id = auth.uid());
create policy "creator deletes own crawls" on public.crawls
  for delete using (creator_id = auth.uid());

create policy "crawl stops readable if parent crawl readable" on public.crawl_stops
  for select using (
    exists (
      select 1 from public.crawls c
      where c.id = crawl_id and (c.is_public or c.creator_id = auth.uid())
    )
  );
create policy "creator inserts own crawl stops" on public.crawl_stops
  for insert with check (
    exists (select 1 from public.crawls c where c.id = crawl_id and c.creator_id = auth.uid())
  );
create policy "creator updates own crawl stops" on public.crawl_stops
  for update using (
    exists (select 1 from public.crawls c where c.id = crawl_id and c.creator_id = auth.uid())
  );
create policy "creator deletes own crawl stops" on public.crawl_stops
  for delete using (
    exists (select 1 from public.crawls c where c.id = crawl_id and c.creator_id = auth.uid())
  );

create policy "feed posts readable by author or followers" on public.feed_posts
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = user_id
    )
  );
create policy "users post their own trips" on public.feed_posts
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );
create policy "users delete their own posts" on public.feed_posts
  for delete using (user_id = auth.uid());

create policy "likes readable if post readable" on public.post_likes
  for select using (
    exists (
      select 1 from public.feed_posts p
      where p.id = post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followee_id = p.user_id
          )
        )
    )
  );
create policy "users like posts they can see" on public.post_likes
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.feed_posts p
      where p.id = post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followee_id = p.user_id
          )
        )
    )
  );
create policy "users unlike their own like" on public.post_likes
  for delete using (user_id = auth.uid());

create policy "comments readable if post readable" on public.post_comments
  for select using (
    exists (
      select 1 from public.feed_posts p
      where p.id = post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followee_id = p.user_id
          )
        )
    )
  );
create policy "users comment on posts they can see" on public.post_comments
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.feed_posts p
      where p.id = post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followee_id = p.user_id
          )
        )
    )
  );
create policy "users delete their own comments" on public.post_comments
  for delete using (user_id = auth.uid());

-- Push new feed posts live to followers' feeds.
alter publication supabase_realtime add table public.feed_posts;
