# Architecture

How the codebase is organized, and where to look when you need to change something.

## Mental model

- **`app/`** is the UI — file-based routing via [expo-router](https://docs.expo.dev/router/introduction/). Every file here is a screen (or a layout wrapping screens).
- **`lib/`** is everything else — all Supabase queries, Google Places calls, and shared business logic live here. Screens should call into `lib/`, not build ad-hoc Supabase queries inline (a few simple list-fetches in `history/index.tsx`/`feed/index.tsx` are the exception — see below).
- **`components/`** is presentational only — no data fetching, just props in, JSX out.
- **`supabase/migrations/`** is the database schema, as a numbered sequence of SQL files. Run in order, once, against your Supabase project.

## `app/` — screens

```
app/
  index.tsx            Entry point: redirects to (auth) or (tabs) based on session
  _layout.tsx           Root layout: SafeAreaProvider, AuthProvider, theme, root Stack
  (auth)/
    sign-in.tsx          Email/password + magic-link sign in/up, "Forgot password?"
    reset-password.tsx   New-password form, reached only via a recovery deep link
  (tabs)/
    _layout.tsx          Tab bar (Compass / Crawls / Feed / History), mounts TripProvider
    index.tsx            Compass screen — the core loop
    history/
      _layout.tsx          Nested Stack (native header, back button)
      index.tsx            Past trips list, "Post to Feed" / "Publish as Crawl" actions
      [id].tsx             Trip detail: stop-by-stop breakdown + who was there
    feed/
      _layout.tsx          Nested Stack (native header, back button)
      index.tsx            Social feed: posts, likes, comments, follow search, realtime
      [id].tsx             Trip detail (same shared view as History's), by trip id
      followers.tsx        Who follows you, with a "Follow back" button per person
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
| `auth-context.tsx` | `AuthProvider` / `useAuth()` — wraps Supabase auth session state. Also listens for the app being opened via a `cheers://` deep link (magic-link/signup-confirmation/password-recovery emails) and turns the tokens in that URL into a session — see `deep-link.ts` and the Gotchas entry below. Also exposes `passwordRecovery`/`clearPasswordRecovery()`: set when the incoming deep link's `type` is `recovery`, so `app/index.tsx` can route to `reset-password.tsx` instead of the tabs even though a session now exists. |
| `deep-link.ts` | `parseAuthTokensFromUrl` — pulls `access_token`/`refresh_token`/`type` out of a magic-link/signup/recovery redirect URL, from either the query string or the `#fragment` (Supabase's implicit flow puts them in the fragment). `type` is `'recovery'` for a password-reset link, `null`/`'magiclink'`/etc. otherwise. Pure string parsing, no RN/native APIs, so it's fully unit tested. |
| `trip-context.tsx` | `TripProvider` / `useTrip()` — the compass state machine (`idle → loading → traveling → arrived`). Shared across screens: the Crawls detail screen calls `startCrawlWithRoute()` from here, then the Compass screen picks up and drives the rest. Also tracks a trip-wide drink count (separate from the per-stop `drinkCount`) and derives `paceWarning` from it — see the pace-nudge gotcha below. Also owns per-trip companions: `companions`/`companionDrinkCounts`/`addCompanion`/`removeCompanion`, and `addDrink(name?, companionId?)` branches on `companionId` to update a companion's count instead of the trip owner's (companion drinks are deliberately excluded from `paceWarning`). This is the most important file to understand before touching crawl/trip logic. |
| `bearing.ts` | Pure math, no I/O: `distanceMeters`, `bearingDegrees`, `angleDiff`, `formatDistance`. |
| `places.ts` | Google Places API (New) wrapper — `findNearbyBars`/`findNearestBar` (nearest-bar mode), `searchBarsByText` (crawl builder search), `placePhotoUrl`. |
| `crawls.ts` | Crawl CRUD: `fetchCrawls`, `fetchCrawlDetail`, `createCrawl`, `publishTripAsCrawl`. |
| `feed.ts` | Feed posts (including `deletePost`), likes, comments, follow/unfollow, profile search, and `fetchFollowers`/`fetchFollowingIds` (who follows you / who you follow — `feed/followers.tsx`'s "Follow back" screen combines both). `fetchFeed` is paginated — `FEED_PAGE_SIZE` (20) + `.range()`, called again with `{ offset }` for the next page; `feed/index.tsx` treats a page shorter than `FEED_PAGE_SIZE` as "no more." Each `FeedPost` also carries `tripId` (from `feed_posts.trip_id`) so the card can navigate to the shared trip-detail screen by trip id. |
| `format.ts` | `formatDistance` (re-exported from `bearing.ts`) + `formatDuration` + `summarizeDrinkNames` (collapses a trip's `drink_logs.drink_name` rows into "IPA ×2, Stout" for History/Feed cards) + `summarizeDrinksByCompanion` (same, but split per person for `history/index.tsx`'s compact card breakdown — groups by `companion_id`, `null` is the trip owner and shows first as "You", and drops anyone with nothing named). |
| `trip-detail.ts` | `fetchTripDetail(tripId)` — the full breakdown behind History's and Feed's detail screens: ordered stops (bar, arrival window, per-stop drink summary) plus every tagged companion (unlike `format.ts`'s `summarizeDrinksByCompanion`, a companion with zero named drinks still appears here with `drinkCount: 0` — "who was there" shouldn't disappear just because nobody typed a drink name in). RLS decides who's allowed to see it: the trip owner always, or anyone who can see a feed post built from it (`0003`/`0006`/`0008`). |
| `errors.ts` | `errorMessage(e, fallback)` — **always use this in catch blocks.** See gotchas below. |
| `mock-location.ts` | Dev-only fake GPS/heading store, gated behind `EXPO_PUBLIC_MOCK_LOCATION`. Swapped in by `hooks/useLocation.ts`/`hooks/useHeading.ts` at module level. See `docs/local-dev-without-a-phone.md`. |

## `components/`

- `TripDetailView.tsx` — presentational, takes a `TripDetail` (from `lib/trip-detail.ts`) and
  renders the full stop-by-stop breakdown plus a "who was there" section. Shared by
  `history/[id].tsx` and `feed/[id].tsx` — each screen owns its own fetch/loading/error state
  and just passes the result down.
- `BottleCompass.tsx`, `BarRevealCard.tsx`, `DrinkCounter.tsx`, `CompanionsPanel.tsx` —
  Compass-screen specific. `BottleCompass.tsx` is a hand-drawn rotating beer bottle (plain
  `View`s, no SVG/native deps) pointing at the target bar — same rotation math the old triangle
  arrow used. `DrinkCounter.tsx` takes an optional `label` prop so the same component renders
  both "You" (the trip owner) and each companion's counter. `CompanionsPanel.tsx` is purely
  presentational — the guest-name input, the app-user search input/results, and search
  debouncing all live in `app/(tabs)/index.tsx` (same split as `feed/index.tsx`'s people-search),
  and it's passed `companions`/`drinkCounts`/search state/callbacks as props.
- `MockLocationControls.tsx` — dev-only widget, only rendered when `EXPO_PUBLIC_MOCK_LOCATION` is on. See `docs/local-dev-without-a-phone.md`.
- `ThemedText.tsx`, `ThemedView.tsx`, `ui/IconSymbol.tsx`, `HapticTab.tsx`, `ui/TabBarBackground.tsx` — theme-aware primitives from the original Expo template, reused everywhere.

## `supabase/migrations/`

Run these **in order** against a fresh project (Supabase dashboard → SQL Editor → paste → run):

1. `0001_phase1_schema.sql` — `profiles`, `bars`, `trips`, `trip_stops`, `drink_logs` + RLS (owner-only).
2. `0002_phase2_3_schema.sql` — `follows`, `crawls`, `crawl_stops`, `feed_posts`, `post_likes`, `post_comments`, adds `trips.crawl_id`, relaxes `profiles` to be readable by any authenticated user, enables realtime on `feed_posts`.
3. `0003_feed_trip_visibility.sql` — extends `trips`/`trip_stops`/`drink_logs` read access so a *follower* can see the stop/drink detail behind someone else's feed post, not just the post owner.
4. `0004_trips_crawl_id_on_delete_set_null.sql` — `trips.crawl_id` had no `ON DELETE` behavior,
   so deleting a crawl someone had started failed with a foreign key violation. Now `SET NULL`.
5. `0005_trips_delete_policy.sql` — `trips` had select/insert/update RLS policies but no delete
   policy, so an owner could never delete their own trip. Adds "trips are deletable by their
   owner". Deleting a trip cascades to `trip_stops`, `drink_logs`, and any `feed_posts` built
   from it for free — no extra policy needed on those tables, see the Gotchas entry below.
6. `0006_fix_feed_posts_infinite_recursion.sql` — `0003`'s trips/trip_stops/drink_logs policies
   each subqueried `feed_posts` directly, which cycles back into `feed_posts`' own INSERT policy
   (subqueries `trips`) — Postgres rejects this with "infinite recursion detected in policy for
   relation feed_posts" (broke both posting to the feed and browsing it, since `fetchFeed`
   embeds `trips(trip_stops(drink_logs))`). Fixed by moving the feed_posts lookup into a
   `SECURITY DEFINER` function that bypasses RLS instead of a plain correlated subquery. See the
   Gotchas entry below.
7. `0007_trip_companions.sql` — adds `trip_companions` (either a linked app user via `user_id`,
   free tagging with no follow/consent step, or a free-text `guest_name` for someone who isn't
   on the app — `check (user_id is not null or guest_name is not null)`), and a `companion_id`
   column on `drink_logs` (`on delete cascade`, so removing a companion also removes their
   logged drinks). RLS is owner-only, same `exists (select 1 from trips where ...)` pattern as
   `0001`'s other trip-scoped tables. Per-trip only — nothing here persists across trips.
8. `0008_trip_companions_feed_visibility.sql` — extends `trip_companions` with the same
   follower-visibility read access `0003`/`0006` gave `trips`/`trip_stops`/`drink_logs`, reusing
   the `trip_visible_via_feed_post` `SECURITY DEFINER` helper from `0006` rather than a fresh
   correlated subquery. This is a deliberate product decision, not just a consistency fix:
   companions are tagged by the trip owner with no consent step, and whether that should be
   visible to the poster's followers (via Feed post detail) or stay private to the trip owner's
   own History was checked with the user before writing this migration — "show everywhere" won.

RLS policies are **additive** — Postgres OR's together every permissive policy on the same table/action. `0003` doesn't replace the owner-only policies from `0001`, it adds a second path.

## "I want to change X" — where to look

| Task | Files |
|---|---|
| Compass arrival radius / behavior | `app/(tabs)/index.tsx`, `lib/trip-context.tsx` |
| Add a field to drink logging (type, price...) | new migration column, `lib/trip-context.tsx` `addDrink()`, `components/DrinkCounter.tsx` |
| Companions / who's-with-you tracking | `supabase/migrations/0007_trip_companions.sql`, `lib/trip-context.tsx` (`companions`, `addCompanion`, `removeCompanion`), `components/CompanionsPanel.tsx` |
| Nearby-bar search radius/ranking | `lib/places.ts` `findNearbyBars` |
| New feed interaction (reshare, etc.) | `lib/feed.ts`, `app/(tabs)/feed/index.tsx`, new migration + RLS |
| New screen | new file under `app/(tabs)/`, register it in `app/(tabs)/_layout.tsx` (or make a `crawls/`-style nested stack for a multi-screen flow) |
| DB schema change | new numbered file in `supabase/migrations/`, then update the `Database` type in `lib/supabase.ts` to match |
| Auth flow | `lib/auth-context.tsx`, `app/(auth)/sign-in.tsx`, `app/(auth)/reset-password.tsx` |
| Feed page size / pagination | `lib/feed.ts` (`FEED_PAGE_SIZE`, `fetchFeed`'s `offset`/`limit`), `app/(tabs)/feed/index.tsx` (`loadMore`, `onEndReached`) |
| History page size / pagination | `app/(tabs)/history/index.tsx` (`HISTORY_PAGE_SIZE`, `loadTrips`/`loadMoreTrips`, `onEndReached`) — query is inline, no `lib/` file backs it |
| Trip detail view (stops/companions) | `lib/trip-detail.ts`, `components/TripDetailView.tsx`, `app/(tabs)/history/[id].tsx`, `app/(tabs)/feed/[id].tsx` |
| Crawl stop list (after publishing) | `lib/crawls.ts` (`replaceCrawlStops`, `upsertBarsAndGetIds`), `app/(tabs)/crawls/[id].tsx` ("Edit Stops" mode) |
| Trip photos | `lib/trip-photos.ts` (`uploadTripPhoto`, `removeTripPhoto`), `supabase/migrations/0009_trip_photos.sql` (bucket + RLS), `components/TripPhotoEditor.tsx` (upload/remove UI, used by both history and feed detail screens), `components/TripDetailView.tsx` (renders it) |
| Delete a feed post from its detail screen | `app/(tabs)/feed/[id].tsx` (`confirmDeletePost`, gated on `session.user.id === detail.ownerId` and the `postId` route param), `lib/feed.ts` (`deletePost`) |
| Another user's profile | `lib/profile.ts` (`fetchUserProfile`, `fetchUserPosts`, `fetchUserCrawls`), `app/(tabs)/feed/user/[id].tsx`, registered in `app/(tabs)/feed/_layout.tsx`. Reached from any tappable name — card author, comment author, search result, feed-detail title, followers row |
| Profile pictures / avatars | `lib/avatar.ts` (`uploadAvatar`, `removeAvatar`), `lib/image-upload.ts` (shared byte-sniffing/local-file-read, also used by `trip-photos.ts`), `supabase/migrations/0010_avatars.sql` (bucket + RLS), `components/AvatarEditor.tsx` (upload/remove UI, History's own profile header only, native square crop via `expo-image-picker`'s `allowsEditing`), `components/Avatar.tsx` (display, wired in wherever a name shows) |

## Testing

```bash
npm run test:ci         # run once and exit (CI, pre-push checks)
npm test                # watch mode
npm run test:coverage   # once, with a coverage report
```

Tests live next to what they test, in `lib/__tests__/`. Coverage is deliberately scoped to
what's cheap and high-value to test in isolation, not the whole app — see the "Not covered"
note below. `package.json`'s jest config sets `collectCoverageFrom: ["lib/**/*.{ts,tsx}"]`, so
the percentages below are `lib/` only; `app/` screens and `components/*.tsx` aren't measured at
all (see "Not covered"). Every `lib/` file is required to stay at **100% line coverage** — this
is a hard rule, not a target: `jest.coverageThreshold.global.lines` is set to `100` and fails
`npm run test:coverage`/CI if any line in `lib/` goes untested. (Function coverage is also
incidentally 100% today; statements ~95% and branches ~81% are left at their lower thresholds —
80%/70% — since the remaining gaps are early-return/error-object shapes that would need
near-duplicate test cases to close, not worth it for the marginal safety.) If you add or touch a
`lib/*.ts(x)` file, run `npm run test:coverage` before finishing and close any line gap it
reports — see [`AGENTS.md`](../AGENTS.md) for the exact rule.

- `bearing.test.ts`, `format.test.ts`, `errors.test.ts`, `deep-link.test.ts` — pure functions, no mocking.
- `places.test.ts` — mocks `global.fetch`; covers request shape, response mapping, missing-API-key
  and non-ok-response error paths for both `findNearbyBars` and `searchBarsByText`.
- `crawls.test.ts`, `feed.test.ts` — mock the `supabase` module with a small stub query builder
  (every chain method returns itself; the object is "thenable" and resolves to whatever
  `{ data, error }` you configure per table name). Covers the data-mapping and multi-step write
  logic in `lib/crawls.ts` / `lib/feed.ts` (e.g. that `createCrawl` preserves stop order even
  though Supabase doesn't guarantee upsert response order; that `deletePost` issues a plain
  `delete().eq('id', ...)` and surfaces the Supabase error on failure).
- `trip-context.test.tsx` — the compass state machine (`idle → loading → traveling → arrived`,
  freeform vs. crawl-route `nextBar` branching). This one exercises a real React context/hook
  (`TripProvider`/`useTrip()`), not a plain function, so it uses `react-test-renderer`'s `act()`
  plus a tiny capturing harness component instead of `@testing-library/react-native` — the
  latter still isn't set up (see below), but a hooks-only test doesn't actually need it.
  `supabase`, `useAuth`, and `findNearestBar` are all mocked the same way as the other Supabase
  tests above. Also covers `addCompanion` (guest and app-user paths, including the
  `guest_name` vs. `profiles.display_name` fallback), `removeCompanion` (clears both
  `companions` and `companionDrinkCounts`), and that a companion-scoped `addDrink` updates
  `companionDrinkCounts` without touching the trip owner's `drinkCount`/pace tracking.
- `format.test.ts` also covers `summarizeDrinksByCompanion` (grouping by `companion_id`, "You"
  first, omitting people with no named drinks).
- `feed.test.ts`'s `fetchFeed` describe block includes a pagination test asserting the default
  `.range(0, FEED_PAGE_SIZE - 1)` call and that a custom `{ offset, limit }` maps through, plus a
  `tripId` mapping assertion. Also covers `fetchFollowers`' row mapping and its failure path.
- `trip-detail.test.ts` covers `fetchTripDetail`: stop sorting by `stop_order`, per-stop and
  per-companion drink summaries, a companion appearing with `drinkCount: 0` when they logged
  nothing, preferring a linked app-user's `display_name` over a `guest_name`, and throwing when
  the trip isn't found or not visible under RLS.
- `trip-context.test.tsx` also covers the error/catch branches that a first pass tends to skip:
  `startCrawlWithRoute`'s insert failure, `addDrink`'s insert-error path (distinct from a thrown
  exception), `nextBar`'s freeform-mode catch when the request itself throws, and `endCrawl`'s
  distance-accumulation loop across more than one stop (the original test only had a single stop,
  so the loop body never ran).
- `mock-location.test.ts` covers `useMockLocation`/`subscribe` (the `useSyncExternalStore` hook)
  via `react-test-renderer`, in addition to the plain-function tests for the rest of the module.
  It imports the hook and setters via a normal static `import`, not the file's `load()` helper —
  `load()` calls `jest.resetModules()` for state isolation, which would hand the hook a second,
  freshly-required copy of the `react` module that doesn't match the one `react-test-renderer`
  already has cached, tripping an "Invalid hook call" error.
- `auth-context.test.tsx` covers `AuthProvider`/`useAuth()` the same
  `react-test-renderer`-harness way as `trip-context.test.tsx`: session bootstrap via
  `supabase.auth.getSession`, live updates via the `onAuthStateChange` callback (captured off the
  mock and invoked manually), and deep-link session recovery via both `Linking.getInitialURL`
  (initial cold-start URL) and `Linking.addEventListener('url', ...)` (a live link while the app
  is running) — including the `type === 'recovery'` branch that flips `passwordRecovery`.
- `supabase.test.ts` is the one test that intentionally does **not** mock `lib/supabase.ts`
  itself — it's the only way to cover the module's own top-level code (the missing-env-var throw,
  and the `createClient(...)` call), since every other test mocks `../supabase` away entirely and
  never actually executes it. It mocks `@react-native-async-storage/async-storage` with the
  package's own bundled `jest/async-storage-mock` (the real native module is `null` under Jest,
  otherwise `import AsyncStorage from '@react-native-async-storage/async-storage'` throws), then
  uses `jest.resetModules()` + `require('../supabase')` inside each test (not a static `import`)
  so it can flip `process.env.EXPO_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY` between the
  missing-env and present-env cases and get a fresh module evaluation each time.

**Not covered**, intentionally — these need real component-rendering infra
(`@testing-library/react-native` + native-module mocks for `expo-location`/`expo-router`) that
isn't set up yet, and the payoff is lower per hour spent than the `lib/` coverage above: the
screens under `app/` (rendering, user interaction, navigation).

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
- **The pace-nudge banner (`paceWarning`) is recomputed off `Date.now()` inside a `useEffect`
  keyed on the trip-wide drink count**, not a ticking clock — it only re-evaluates when a new
  drink is logged, not continuously while idle. Tests that exercise it need
  `jest.useFakeTimers().setSystemTime(...)` to get a deterministic elapsed time (see
  `trip-context.test.tsx`'s "pace warning" describe block).
- **RLS does not apply to rows removed by `ON DELETE CASCADE`.** Deleting a `trips` row cascades
  into `trip_stops`, `drink_logs`, and `feed_posts` (and from there `post_likes`/`post_comments`)
  even though those child tables have their own, unrelated RLS policies — the cascade is a
  referential-integrity side effect of the `trips` delete succeeding, not a separate DELETE
  statement Postgres re-checks child policies against. The only policy that actually gates
  "can this user delete this trip" is the one on `trips` itself (`0005`).
- **Cross-table RLS policies that reference each other cyclically raise "infinite recursion
  detected in policy for relation X."** This isn't about the query actually looping forever —
  Postgres just refuses as soon as the same relation reappears in the policy-expansion stack for
  one query (table A's policy subqueries table B, table B's policy subqueries table A again). Hit
  this with `trips`/`trip_stops`/`drink_logs` (0003, subquery `feed_posts`) vs. `feed_posts`'
  insert policy (0002, subqueries `trips`) — fixed in `0006` by moving the cross-table check into
  a `SECURITY DEFINER` function, which bypasses RLS on the table it queries and never re-enters
  the cycle. **This class of bug is invisible to the Jest suite** (Supabase is mocked, so RLS
  never actually runs) — if you add a policy that queries another RLS-protected table, test the
  actual query against a real Supabase project before trusting it.
- **Magic-link/signup-confirmation emails need three things wired up to actually sign you in on
  native, not just a `signInWithOtp`/`signUp` call.** (1) `options.emailRedirectTo` on the call,
  set to `Linking.createURL('/')` — without it, Supabase redirects to whatever "Site URL" is
  configured in the dashboard (usually `localhost`, meaningless on a phone) instead of back into
  the app. (2) Something to actually catch that redirect: `detectSessionInUrl` is browser-only,
  so on native `auth-context.tsx`'s `AuthProvider` has its own `Linking.getInitialURL()` +
  `Linking.addEventListener('url', ...)` listener that hands the URL to `deep-link.ts`'s
  `parseAuthTokensFromUrl` and calls `supabase.auth.setSession()` with what it finds — this
  project's client uses the default `flowType: 'implicit'`, so the tokens are in the URL
  **fragment** (`#access_token=...`), which `expo-linking`'s own `parse()` doesn't read (it only
  looks at the query string), hence the hand-rolled parser. (3) **The redirect URL has to be on
  Supabase's allow-list** (dashboard → Authentication → URL Configuration → Redirect URLs) or it
  silently falls back to the Site URL and step 2 never fires — this is a dashboard setting, not
  something a migration or code change can do. Add `cheers://**` for standalone/dev-client
  builds; for Expo Go over `--tunnel` (what this project's quickstart uses) the URL changes per
  session, so use a wildcard like `exp://**` (and `https://*.exp.direct/**` if tunnel URLs don't
  match that) rather than trying to pin an exact one.
- **A password-recovery deep link creates a real Supabase session before the user has actually
  set a new password.** `auth.setSession()` in `auth-context.tsx` doesn't distinguish a recovery
  link from a magic link — both just produce a session — so without extra state, `app/index.tsx`
  would happily redirect a recovery tap straight into the tabs with the *old* password still
  active. The fix is `parseAuthTokensFromUrl`'s `type` field: when it's `'recovery'`,
  `auth-context.tsx` sets a `passwordRecovery` flag that `app/index.tsx` checks *before* its
  normal `session ? tabs : sign-in` branch, routing to `reset-password.tsx` instead;
  `clearPasswordRecovery()` (called after a successful `updateUser({ password })`) is what lets
  the normal redirect take over again. Uses the same Redirect-URL allow-list dashboard setting as
  magic links — no separate config needed, since `resetPasswordForEmail`'s `redirectTo` hits the
  same `cheers://` scheme.
- **Expo Go only supports one SDK version at a time** (whatever's currently on the App/Play Store). If it says a project's SDK is "incompatible," check `package.json`'s `expo` version against what Expo Go on your phone actually reports, and align with `npx expo install expo@<version>` + `npx expo install --fix`.
- **Storage bucket RLS policies key off the first path segment, not a DB column.** `trip-photos`
  (`0009`) uses the same convention Supabase's own docs recommend for per-user storage: every
  object is uploaded to `${userId}/${tripId}.<ext>`, and the `storage.objects` insert/update/delete
  policies check `(storage.foldername(name))[1] = auth.uid()::text` — the path prefix *is* the
  ownership check, there's no foreign key back to `trips`. Get the upload path wrong (e.g. drop
  the `userId` prefix) and the policy silently denies with no useful error beyond "row-level
  security policy violation." Also note `supabase.storage.from(...).upload()` wants a
  `Blob`/`ArrayBuffer`, not a `file://` URI. **Don't use `fetch(localUri).then(r => r.blob())` to
  get it** — that's the obvious approach but silently produces a 0-byte blob for local `file://`
  URIs on some platforms (uploads "succeed," `photo_url` gets set, and the image is just broken
  forever). `lib/trip-photos.ts` instead reads the file as base64 via `expo-file-system`'s
  `new File(uri).base64()` (SDK 54's current File API — the older `readAsStringAsync` free
  function now lives at `expo-file-system/legacy`) and decodes it to an `ArrayBuffer` with
  `base64-arraybuffer`'s `decode()` before handing that to `.upload()`.
- **Don't trust `expo-image-picker`'s `mimeType` for the upload's extension/`Content-Type` —
  sniff the real bytes instead.** `pickPhoto` in `history/[id].tsx` uses `allowsEditing: true` to
  crop, and cropping commonly re-encodes the output (typically to JPEG) regardless of the source
  format; the returned asset's `mimeType` field isn't documented to track that re-encode and can
  still report the pre-crop format. Tagging the upload with that stale `mimeType` produced files
  that rendered fine in-app (RN's `Image` ignores the filename/`Content-Type` and just decodes
  whatever bytes come back) but showed as "corrupted / unsupported format" with no dashboard
  preview in Supabase Storage, which does trust them. `lib/trip-photos.ts`'s `sniffFormat` instead
  reads the magic bytes off the decoded `ArrayBuffer` (JPEG/PNG/GIF/WEBP/HEIC signatures) to pick
  the extension and `contentType`, so the label always matches what was actually uploaded.
- **A re-uploaded trip photo needs a cache-busting URL, or RN's `Image` shows the old one.**
  `${userId}/${tripId}.<ext>` is deterministic, so replacing a photo with another of the same
  format reuses the exact same Storage path and therefore the exact same public URL — RN's
  `Image` caches by URI, so without something forcing the URL to change it keeps rendering the
  previous photo's bytes even after `upsert: true` replaced the object server-side (symptom:
  delete a photo, add a new one, the *old* photo reappears). `uploadTripPhoto` appends `?v=` +
  a timestamp to the URL it stores on `trips.photo_url`; `removeTripPhoto`'s `pathFromPublicUrl`
  strips that query string back off before deriving the storage path to delete.
- **The byte-sniffing and local-file-read helpers above live in `lib/image-upload.ts`, not
  `lib/trip-photos.ts`.** `lib/avatar.ts` needed the exact same `sniffImageFormat`/
  `readLocalImageBytes` logic for the `avatars` bucket (`0010_avatars.sql`, same
  `${userId}/avatar.<ext>` path-namespacing and `?v=` cache-busting as trip photos), so both
  gotchas above apply there too. If a third upload flow needs this, extend the shared module
  rather than re-copying it a second time.
- **A custom in-app circular cropper (`react-native-gesture-handler` pinch/pan under a clipped
  circle + `expo-image-manipulator` crop) was tried for avatar cropping and reverted** — it
  crashed the app on-device. `expo-image-picker`'s native `allowsEditing` crop box is
  square/rectangular only (no circular mask on either platform), which is a real mismatch since
  avatars render as circles, but the custom replacement wasn't stable enough to ship. Don't
  re-attempt this without testing on a real device first (Metro/web-bundle success and `tsc`
  passing did not catch the crash). `AvatarEditor.tsx` is back to `allowsEditing: true,
  aspect: [1, 1]`.
- **`flex: 1` on a `ScrollView`'s `contentContainerStyle` pins its height to the viewport instead
  of letting it grow with content — anything past one screen just gets clipped, not scrolled.**
  Hit this on the compass screen's "arrived" phase (`app/(tabs)/index.tsx`, `arrivedCenter`
  style): it's centered with `justifyContent: 'center'` for the common case (few/no companions),
  but `flex: 1` combined with that meant adding enough companions to `CompanionsPanel` pushed
  "Next Bar"/"End Crawl" off the bottom with no way to scroll to them. Fix was `flexGrow: 1`
  instead of `flex: 1` — grows to fill the viewport when content is short (so centering still
  works) but keeps growing past it when content is tall (so it scrolls). Same trap applies to
  any other `ScrollView` in this app that centers short content with `contentContainerStyle`.
- **Every screen under the tab bar needs `useSafeAreaInsets().bottom` added to its bottom
  padding, or its own bottom content can end up hidden under the tab bar.** `app/(tabs)/_layout.tsx`
  sets `tabBarStyle: { position: 'absolute' }` on iOS (for the blur effect to show through), which
  means the tab bar overlays content instead of reserving space for it in layout — screens that
  don't compensate get their last button/row sitting under a translucent bar. The established
  fix, used by most screens, is `paddingBottom: insets.bottom + 76` on the scrollable's
  `contentContainerStyle` (76 ≈ tab bar height). `crawls/create.tsx`, `crawls/[id].tsx`, and
  `feed/followers.tsx` were missing this (found during an audit prompted by the `arrivedCenter`
  bug above) and have been fixed to match; if you add a new screen under `(tabs)`, copy this
  pattern rather than a bare fixed `paddingBottom`.
