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

**Wondering what's actually built? → [`PROGRESS.md`](PROGRESS.md)** — the living status tracker.
Check it before assuming a feature does or doesn't exist, and keep it updated as things change
(AI agents working in this repo are instructed to via `AGENTS.md`).

**Want to test on real devices, or deploy it? → [`docs/deployment.md`](docs/deployment.md)** —
including the fastest free path for a weekend test session. **→ [`docs/costs.md`](docs/costs.md)**
covers what actually costs money and what to spin down when you're done.

**Don't have a phone handy? → [`docs/local-dev-without-a-phone.md`](docs/local-dev-without-a-phone.md)**
— develop the whole compass loop in a laptop browser with a mock GPS/heading, no phone or
emulator required.

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
simulator or on web by default. No phone available? See
[`docs/local-dev-without-a-phone.md`](docs/local-dev-without-a-phone.md) for a mock-location dev
mode that works in a plain laptop browser.

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

See [`PROGRESS.md`](PROGRESS.md) for the up-to-date, maintained breakdown of what's done, what's
not, and known gaps — kept there instead of duplicated here so it doesn't go stale.
