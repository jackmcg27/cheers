# Cheers

"Strava for bar crawls" — a compass points you to a bar (revealed or kept a surprise), you log
drinks and move to the next stop, and the finished route becomes a trip you can share. Follow
friends, browse crawls other people have published, or build and publish your own so others can
follow it stop-by-stop.

**New to this repo? Start here → [`docs/setup.md`](docs/setup.md)** — a full step-by-step walkthrough
from a fresh clone to a running app on your phone, including Supabase and Google Cloud setup and
a troubleshooting section for the issues we actually hit while building this.

**Want to understand how the code is organized? → [`docs/architecture.md`](docs/architecture.md)**
— what each directory is for, where to look to change something, and a list of non-obvious
gotchas worth knowing before you touch the code.

## Stack

- Expo (React Native, TypeScript) + expo-router (SDK 54)
- Supabase — auth, Postgres, Row Level Security, realtime
- Google Places API (New) — bar search, photos, addresses
- `expo-location` — GPS position and device compass heading

## Quick start

Full detail in [`docs/setup.md`](docs/setup.md). The short version, once you have a Supabase
project (with migrations run) and a Google Cloud Places API key:

```bash
npm install
cp .env.example .env   # fill in your Supabase + Google Places keys
npx expo start
```

Scan the QR with **Expo Go** on a physical phone — GPS and compass heading don't work in a
simulator or on web.

## Tests

```bash
npm run test:ci
```

Unit tests cover the `lib/` data/logic layer (bearing math, formatting, error handling, Google
Places calls, Supabase-backed crawl/feed logic). See the **Testing** section in
[`docs/architecture.md`](docs/architecture.md) for what's covered and how to add more.

## Project layout

```
app/                   Screens (file-based routing via expo-router)
  (auth)/                 Sign in / sign up
  (tabs)/                 Main app: Compass, Crawls, Feed, History
lib/                    All Supabase/Google Places calls + shared logic — no UI
components/             Presentational UI components
hooks/                  useLocation / useHeading (GPS + compass), theme hooks
supabase/migrations/    Database schema, numbered — run in order against your project
docs/                   Setup guide + architecture reference
```

See [`docs/architecture.md`](docs/architecture.md) for the full breakdown of every file and a
guide to where to make common changes.

## Current status

Core loop, crawl routes, and social feed are built and working end to end: compass-guided
freeform or fixed-route crawling, drink logging, trip history, publishing a trip as a
shareable crawl or feed post, following people, and a live-updating feed with likes and
comments. Not yet built: trip photos, in-app maps (currently "open in Maps" links instead),
and a dedicated profile/stats screen.
