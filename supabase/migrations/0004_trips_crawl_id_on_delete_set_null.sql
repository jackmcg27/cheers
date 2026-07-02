-- trips.crawl_id (added in 0002) had no ON DELETE behavior, so Postgres defaulted to blocking
-- deletes: any crawl ever started via "Start This Crawl" could never be deleted, failing with
-- "violates foreign key constraint trips_crawl_id_fkey". A trip is personal history and
-- shouldn't be deleted (or block a delete) just because the crawl route it followed was later
-- removed — unlink it instead, per the original data model ("crawl_id nullable if freeform").

alter table public.trips drop constraint if exists trips_crawl_id_fkey;

alter table public.trips
  add constraint trips_crawl_id_fkey
  foreign key (crawl_id) references public.crawls (id) on delete set null;
