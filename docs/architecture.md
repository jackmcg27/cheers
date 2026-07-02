# Architecture

How the codebase is organized, and where to look when you need to change something.

## Mental model

- **`app/`** is the UI — file-based routing via [expo-router](https://docs.expo.dev/router/introduction/). Every file here is a screen (or a layout wrapping screens).
- **`lib/`** is everything else — all Supabase queries, Google Places calls, and shared business logic live here. Screens should call into `lib/`, not build ad-hoc Supabase queries inline (a few simple list-fetches in `history.tsx`/`feed.tsx` are the exception — see below).
- **`components/`** is presentational only — no data fetching, just props in, JSX out.
- **`supabase/migrations/`** is the database schema, as a numbered sequence of SQL files. Run in order, once, against your Supabase project.

## `app/` — screens

```
app/
  index.tsx            Entry point: redirects to (auth) or (tabs) based on session
  _layout.tsx           Root layout: SafeAreaProvider, AuthProvider, theme, root Stack
  (auth)/
    sign-in.tsx          Email/password + magic-link sign in/up
  (tabs)/
    _layout.tsx          Tab bar (Compass / Crawls / Feed / History), mounts TripProvider
    index.tsx            Compass screen — the core loop
    history.tsx          Past trips list, "Post to Feed" / "Publish as Crawl" actions
    feed.tsx             Social feed: posts, likes, comments, follow search, realtime
    crawls/
      _layout.tsx          Nested Stack (native header, back button)
      index.tsx            Browse: your crawls + public crawls
      create.tsx           Builder: search bars, order stops, save
      [id].tsx             Detail: stop list, "Start This Crawl"
```

The Compass screen (`app/(tabs)/index.tsx`) is the one screen that reads live GPS/heading
(`hooks/useLocation.ts`, `hooks/useHeading.ts`) — no other screen needs them.

## `lib/` — data & logic

| File | What it does |
|---|---|
| `supabase.ts` | The Supabase client, plus a **hand-written** `Database` TypeScript type. There's no `supabase gen types` step — when you change the schema, you update this file to match by hand. |
| `auth-context.tsx` | `AuthProvider` / `useAuth()` — wraps Supabase auth session state. |
| `trip-context.tsx` | `TripProvider` / `useTrip()` — the compass state machine (`idle → loading → traveling → arrived`). Shared across screens: the Crawls detail screen calls `startCrawlWithRoute()` from here, then the Compass screen picks up and drives the rest. This is the most important file to understand before touching crawl/trip logic. |
| `bearing.ts` | Pure math, no I/O: `distanceMeters`, `bearingDegrees`, `angleDiff`, `formatDistance`. |
| `places.ts` | Google Places API (New) wrapper — `findNearbyBars`/`findNearestBar` (nearest-bar mode), `searchBarsByText` (crawl builder search), `placePhotoUrl`. |
| `crawls.ts` | Crawl CRUD: `fetchCrawls`, `fetchCrawlDetail`, `createCrawl`, `publishTripAsCrawl`. |
| `feed.ts` | Feed posts, likes, comments, follow/unfollow, profile search. |
| `format.ts` | `formatDistance` (re-exported from `bearing.ts`) + `formatDuration`, for display. |
| `errors.ts` | `errorMessage(e, fallback)` — **always use this in catch blocks.** See gotchas below. |
| `mock-location.ts` | Dev-only fake GPS/heading store, gated behind `EXPO_PUBLIC_MOCK_LOCATION`. Swapped in by `hooks/useLocation.ts`/`hooks/useHeading.ts` at module level. See `docs/local-dev-without-a-phone.md`. |

## `components/`

- `CompassArrow.tsx`, `BarRevealCard.tsx`, `DrinkCounter.tsx` — Compass-screen specific.
- `MockLocationControls.tsx` — dev-only widget, only rendered when `EXPO_PUBLIC_MOCK_LOCATION` is on. See `docs/local-dev-without-a-phone.md`.
- `ThemedText.tsx`, `ThemedView.tsx`, `ui/IconSymbol.tsx`, `HapticTab.tsx`, `ui/TabBarBackground.tsx` — theme-aware primitives from the original Expo template, reused everywhere.

## `supabase/migrations/`

Run these **in order** against a fresh project (Supabase dashboard → SQL Editor → paste → run):

1. `0001_phase1_schema.sql` — `profiles`, `bars`, `trips`, `trip_stops`, `drink_logs` + RLS (owner-only).
2. `0002_phase2_3_schema.sql` — `follows`, `crawls`, `crawl_stops`, `feed_posts`, `post_likes`, `post_comments`, adds `trips.crawl_id`, relaxes `profiles` to be readable by any authenticated user, enables realtime on `feed_posts`.
3. `0003_feed_trip_visibility.sql` — extends `trips`/`trip_stops`/`drink_logs` read access so a *follower* can see the stop/drink detail behind someone else's feed post, not just the post owner.
4. `0004_trips_crawl_id_on_delete_set_null.sql` — `trips.crawl_id` had no `ON DELETE` behavior,
   so deleting a crawl someone had started failed with a foreign key violation. Now `SET NULL`.

RLS policies are **additive** — Postgres OR's together every permissive policy on the same table/action. `0003` doesn't replace the owner-only policies from `0001`, it adds a second path.

## "I want to change X" — where to look

| Task | Files |
|---|---|
| Compass arrival radius / behavior | `app/(tabs)/index.tsx`, `lib/trip-context.tsx` |
| Add a field to drink logging (type, price...) | new migration column, `lib/trip-context.tsx` `addDrink()`, `components/DrinkCounter.tsx` |
| Nearby-bar search radius/ranking | `lib/places.ts` `findNearbyBars` |
| New feed interaction (reshare, etc.) | `lib/feed.ts`, `app/(tabs)/feed.tsx`, new migration + RLS |
| New screen | new file under `app/(tabs)/`, register it in `app/(tabs)/_layout.tsx` (or make a `crawls/`-style nested stack for a multi-screen flow) |
| DB schema change | new numbered file in `supabase/migrations/`, then update the `Database` type in `lib/supabase.ts` to match |
| Auth flow | `lib/auth-context.tsx`, `app/(auth)/sign-in.tsx` |

## Testing

```bash
npm run test:ci         # run once and exit (CI, pre-push checks)
npm test                # watch mode
npm run test:coverage   # once, with a coverage report
```

Tests live next to what they test, in `lib/__tests__/`. Coverage is deliberately scoped to
what's cheap and high-value to test in isolation, not the whole app — see the "Not covered"
note below. As of this writing that's ~89% statements / ~79% branches on the files it does
cover; `package.json`'s `jest.coverageThreshold` fails the build if it drops meaningfully below
that (80% statements / 70% branches / 85% functions / 90% lines).

- `bearing.test.ts`, `format.test.ts`, `errors.test.ts` — pure functions, no mocking.
- `places.test.ts` — mocks `global.fetch`; covers request shape, response mapping, missing-API-key
  and non-ok-response error paths.
- `crawls.test.ts`, `feed.test.ts` — mock the `supabase` module with a small stub query builder
  (every chain method returns itself; the object is "thenable" and resolves to whatever
  `{ data, error }` you configure per table name). Covers the data-mapping and multi-step write
  logic in `lib/crawls.ts` / `lib/feed.ts` (e.g. that `createCrawl` preserves stop order even
  though Supabase doesn't guarantee upsert response order).

**Not covered**, intentionally — these need real component-rendering infra
(`@testing-library/react-native` + native-module mocks for `expo-location`/`expo-router`) that
isn't set up yet, and the payoff is lower per hour spent than the `lib/` coverage above:
`lib/trip-context.tsx` (the compass state machine), and the screens under `app/`. If you add
that infra later, the trip-context state machine (`idle → loading → traveling → arrived`,
freeform vs. crawl-route `nextBar` branching) is the highest-value next target.

When you add a new `lib/*.ts` file with real logic (not just types), add a matching
`lib/__tests__/*.test.ts` following the patterns above — copy whichever existing test file is
closest to what you're testing rather than starting from scratch.

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR: typecheck, lint, tests
with coverage (gated by the threshold above, and uploaded as a downloadable artifact + printed
to the run's job summary), and an `expo export --platform ios` bundle check against placeholder
env values (catches Metro/native-dependency issues that `tsc`/`jest` alone can't — this project
has hit that class of bug more than once, see the Gotchas below).

## Gotchas hit while building this (read before you lose an hour to them)

- **Compass heading/GPS don't work in a simulator or on web.** Test on a physical device via Expo Go.
- **Supabase query errors are not `instanceof Error`.** They're plain objects (`PostgrestError`) with a `.message` field. Always catch with `errorMessage(e, 'fallback')` from `lib/errors.ts` — a bare `e instanceof Error ? e.message : 'fallback'` silently swallows the real error and shows a useless generic message. This one bit us for real.
- **"Could not embed because more than one relationship was found."** Happens embedding `profiles` (or any table reachable via more than one FK path) from another table. Fix: name the FK column explicitly, e.g. `profiles!user_id(display_name)` instead of bare `profiles(display_name)`.
- **Typed routes go stale** after adding a new file under `app/`. If `tsc` complains a route string "is not assignable," run `npx expo export --platform ios --output-dir .tmp && rm -rf .tmp` once to regenerate `.expo/types/router.d.ts`.
- **Dynamic route navigation needs the object form** for typed routes to accept it: `router.push({ pathname: '/(tabs)/crawls/[id]', params: { id } })`, not a template string like `` `/(tabs)/crawls/${id}` ``.
- **`app.json`'s `web.output` is `"single"`, not `"static"`.** Static output server-renders routes in Node at build time, and Supabase's AsyncStorage adapter touches `window`, which doesn't exist there — it crashes the *entire* dev server (iOS/Android included), not just the web build.
- **`react-native-reanimated` 4 needs the `react-native-worklets` peer dependency.** `npx expo-doctor` catches this if it's missing.
- **Expo Go only supports one SDK version at a time** (whatever's currently on the App/Play Store). If it says a project's SDK is "incompatible," check `package.json`'s `expo` version against what Expo Go on your phone actually reports, and align with `npx expo install expo@<version>` + `npx expo install --fix`.
