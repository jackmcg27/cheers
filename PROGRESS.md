# Progress

What's built, what's not, and what's known to be missing or rough. This is the source of truth
for project status — check it before assuming a feature doesn't exist, and **update it** when
you finish (or start) something.

> **If you're an AI coding agent working in this repo**: update this file as part of any task
> that adds, removes, or changes a feature. Move items between sections, don't just append.
> Leave the "Known gaps / tech debt" section honest — it's more useful than a checklist that
> only ever says "done."

Last updated: 2026-07-14 (drink-name breakdown, pace-nudge banner, duplicate-crawl-publish
guard, Feed-card unfollow, places.ts test coverage, delete-trip/delete-post, a fix for a
pre-existing `feed_posts` RLS infinite-recursion bug (`0006`), per-trip companions /
drink-tracking-for-others (`0007`), working magic-link/signup-confirmation deep links, a
forgot/reset-password flow, per-companion drink breakdown on History cards, Feed pagination,
tappable History/Feed cards opening a full trip detail view with a companion breakdown (`0008`),
a followers list with a "Follow back" button, and 100% line/function test coverage across `lib/`
all added in this session; migrations `0007`/`0008` have been applied to the Supabase project).

## Phase 1 — Core loop ✅ done

- [x] Auth (Supabase email/password + magic link + forgot/reset password) — the
      magic-link/signup-confirmation email redirect actually completes sign-in on native now
      (`lib/deep-link.ts` + `lib/auth-context.tsx`'s `Linking` listener; the magic-link button on
      `sign-in.tsx` also used to look clickable while disabled with no email typed in — it's now
      visibly grayed out and says so). "Forgot password?" on `sign-in.tsx` calls
      `resetPasswordForEmail`; the same deep-link listener picks up the recovery link, but tags
      it via `parseAuthTokensFromUrl`'s `type` field so `auth-context.tsx`'s `passwordRecovery`
      flag routes to the new `app/(auth)/reset-password.tsx` instead of straight into the tabs
      (see the Gotchas entry in `docs/architecture.md`). **Needs a one-time dashboard setting**:
      add the app's redirect URL(s) to Supabase's Authentication → URL Configuration → Redirect
      URLs allow-list, or the emails will link back to the default Site URL instead of the app —
      same setting covers magic links, signup confirmation, and password reset; see the Gotchas
      entry in `docs/architecture.md` for exactly what to add for Expo Go/tunnel vs. a standalone
      build
- [x] Compass screen: live GPS + device heading, rotating beer-bottle pointer
      (`components/BottleCompass.tsx`, replaces the earlier plain triangle arrow) points at
      target bar, with a warm amber/gold pub palette on the primary buttons and dial
- [x] Reveal Mode toggle ("Surprise Me" vs. show name/address/photo)
- [x] Nearest-bar search via Google Places API (New)
- [x] Manual "I'm here" arrival confirm (+ auto-hint when close)
- [x] Drink counter per stop
- [x] Trip saved to Supabase (stops with arrival/departure timestamps, drink logs)
- [x] Trip History tab (past trips: stops, drinks, duration, distance)
- [x] Delete a trip from History (confirm prompt) — needed a new RLS policy, `0005`, since
      `trips` had select/insert/update but no delete policy. Cascades to `trip_stops`,
      `drink_logs`, and any `feed_posts` built from that trip for free (already `ON DELETE
      CASCADE` from `0001`/`0002`) — cascade deletes aren't subject to RLS on the child tables,
      so no extra policy was needed there
- [x] Companions + drink tracking for other people, per trip (`0007_trip_companions.sql`,
      `lib/trip-context.tsx`'s `companions`/`companionDrinkCounts`/`addCompanion`/
      `removeCompanion`, `components/CompanionsPanel.tsx`) — add anyone once you've arrived at
      a stop, either an existing app user (free tagging, no follow/consent step — search by
      display name) or a free-text guest name for a friend who isn't on the app. Each companion
      gets their own per-stop `DrinkCounter`; companion drinks are tracked in `drink_logs` via a
      new `companion_id` column but deliberately excluded from the trip owner's own
      `paceWarning` calculation (that nudge is about personal responsibility, not policing
      friends). Companions and their drink counts don't persist across trips — same per-trip
      scope as everything else in `drink_logs` today. The History tab now shows a per-person
      drink breakdown for any trip that had companions (`lib/format.ts`'s
      `summarizeDrinksByCompanion`), falling back to the old single-line summary for solo trips
- [x] Tappable History/Feed cards open a full trip detail screen (stop-by-stop bar list with
      arrival windows and per-stop drinks, plus a "who was there" section) instead of just the
      flattened summary line on the card. `app/(tabs)/history.tsx` and `app/(tabs)/feed.tsx` are
      now nested-stack folders (`history/index.tsx` + `history/[id].tsx`,
      `feed/index.tsx` + `feed/[id].tsx`, each with its own `_layout.tsx`), sharing
      `lib/trip-detail.ts`'s `fetchTripDetail` and `components/TripDetailView.tsx` for the
      detail rendering. Companions are visible in both places (a deliberate product decision —
      companions are tagged with no consent step, so this was checked with the user rather than
      assumed): `0008_trip_companions_feed_visibility.sql` extends `trip_companions` with the
      same follower-visibility policy `0003`/`0006` already gave `trips`/`trip_stops`/
      `drink_logs`, reusing the `trip_visible_via_feed_post` helper. `lib/feed.ts`'s `FeedPost`
      now also carries `tripId` so the Feed card can navigate to `/feed/[id]` by trip id

## Phase 2 — Social ✅ done

- [x] Post a finished trip to the feed (caption + stats)
- [x] Follow / unfollow (one-directional, no request/accept step)
- [x] Feed screen: posts from you + people you follow, realtime new-post updates
- [x] Likes (toggle) and comments on posts
- [x] Find-people search (by display name) with follow button inline
- [x] Unfollow directly from a Feed post card ("Following ✕" badge next to the author name),
      not just from the search-result row
- [x] Feed pagination — `lib/feed.ts`'s `fetchFeed` takes `{ offset, limit }` and pages via
      `.range()` (`FEED_PAGE_SIZE` = 20); `feed/index.tsx` loads the next page on `onEndReached` with a
      footer spinner, stopping once a page comes back shorter than `FEED_PAGE_SIZE`
- [x] Display name collected at sign-up (required) and editable afterward from the History tab
      (fixes an earlier gap where it was never set and everyone showed as "Someone")
- [x] Delete your own feed post directly from its card (confirm prompt, `lib/feed.ts`'s
      `deletePost`) — also fires if the underlying trip is deleted from History (see Phase 1)
- [x] Followers list with a "Follow back" button (`app/(tabs)/feed/followers.tsx`, reached via
      "See your followers" on the Feed tab) — `lib/feed.ts`'s `fetchFollowers` reads `follows`
      where you're the `followee_id`, joining `profiles!follower_id(display_name)` (the explicit
      FK alias matters: `follows` has two FKs to `profiles`, so a bare `profiles(...)` embed is
      ambiguous). Reuses the same `follow`/`unfollow`/`fetchFollowingIds` as the existing
      search-and-follow flow, so state stays consistent between the two screens

## Phase 3 — Crawl routes ✅ done

- [x] Publish a completed trip's stop order as a named, shareable crawl
- [x] Dedicated crawl builder: search bars by text, add in order, reorder, save
- [x] Browse public crawls + your own (Crawls tab)
- [x] Crawl detail screen: ordered stop list, "Open in Maps" per stop
- [x] "Start This Crawl" — compass follows the fixed route stop-by-stop instead of
      always picking the nearest bar (freeform mode still available too)
- [x] Publishing a trip that's already been published as a crawl is blocked
      (`lib/crawls.ts`'s `publishTripAsCrawl` checks `trips.crawl_id` first) — the History
      tab's "Publish as Crawl" action becomes "View Crawl" once a trip has one

## Developer experience ✅ done

- [x] Mock-location dev mode (`EXPO_PUBLIC_MOCK_LOCATION=true`) — develop and test the whole
      compass loop in a laptop browser, no phone/emulator/magnetometer needed. See
      `docs/local-dev-without-a-phone.md`.
- [x] CI (`.github/workflows/ci.yml`): typecheck, lint, tests + coverage (gated by a threshold,
      reported in the job summary + as an artifact), and a bundle sanity check — runs on every
      push to `main` and every PR.

## Phase 4 — Polish 🚧 partial

- [x] Drink type / name on a logged drink — optional text field next to "+ Drink"
      (`drink_logs.drink_name`), now surfaced as a per-drink breakdown (e.g. "IPA ×2, Stout")
      on the History and Feed tabs via `lib/format.ts`'s `summarizeDrinkNames`
- [x] Edit (name/description/public) / delete a crawl — creator-only, from the crawl detail screen
      (delete needed a follow-up migration, `0004`, since `trips.crawl_id` had no `ON DELETE`
      behavior and blocked deleting any crawl someone had actually started — now `SET NULL`)
- [x] Profile / stats screen — folded into the History tab rather than a new tab (total crawls,
      bars visited, drinks, distance walked, crawls published)
- [x] "Drink responsibly" pace nudge — a dismissible amber banner on the Compass screen
      (`lib/trip-context.tsx`'s `paceWarning`/`dismissPaceWarning`) that appears once a trip's
      running drink pace (across all stops, not just the current one) exceeds 2/hr with at
      least 3 drinks logged, so it can't fire off the first round. Recomputed each time a
      drink is logged; dismissing it just clears the current banner, the next drink can
      re-trigger it.
- [ ] Trip photos
- [ ] Real map widget (route/pins) — currently "Open in Maps" links only, see
      [`docs/architecture.md`](docs/architecture.md) for why

## Testing 🚧 partial

- [x] Unit tests for `lib/` (bearing math, formatting, errors, Places API, Supabase- and
      Supabase-mock-backed crawl/feed/stats logic) — see `docs/architecture.md`'s Testing section
- [x] Tests for `lib/trip-context.tsx` (the compass state machine) — drives the real
      `TripProvider`/`useTrip()` via `react-test-renderer`'s `act()` + a capturing harness
      component (no `@testing-library/react-native` needed for a hooks-only test like this),
      same Supabase query-builder mock pattern as `crawls.test.ts`; covers `addCompanion`
      (guest and app-user paths), `removeCompanion`, and companion-scoped `addDrink` too
- [x] `format.test.ts` covers `summarizeDrinksByCompanion` (History's per-person breakdown); `deep-link.test.ts`
      covers the `type` field (`recovery` vs. `magiclink`/absent) used by the password-reset flow;
      `feed.test.ts` covers `fetchFeed`'s pagination (`.range()` defaults + custom offset/limit)
      and now `tripId` mapping; `trip-detail.test.ts` covers `fetchTripDetail`'s stop sorting,
      per-stop/per-companion drink summaries (including a companion with zero drinks still
      appearing), and preferring an app-user's display name over a guest name
- [x] 100% line and function coverage on every file in `lib/` — closed the remaining gaps in
      `trip-context.test.tsx` (`startCrawlWithRoute`'s insert failure, `addDrink`'s insert-error
      path, `nextBar`'s freeform catch-on-throw, `endCrawl`'s multi-stop distance loop, which the
      original single-stop test never exercised) and added `mock-location.test.ts` coverage for
      the `useMockLocation`/`subscribe` hook via `react-test-renderer` (had to import it via a
      plain static `import`, not the file's `jest.resetModules()`-based `load()` helper, or the
      hook gets a mismatched second copy of `react` and throws "Invalid hook call"). Branch
      coverage (~81%) is intentionally short of 100% — the remaining gaps are error-object-shape
      permutations that'd need near-duplicate test cases for no real safety gain
- [ ] Any screen/component tests (needs `@testing-library/react-native` + native-module mocks,
      not set up yet)

## Deployment 🚧 partial

- [x] Tunnel testing (`npx expo start --tunnel`, `@expo/ngrok` installed) — verified working
      end to end on a real phone off Wi-Fi. See `docs/quickstart.md` for the fast path,
      `docs/deployment.md` for all options.
- [ ] No standalone installed build yet (EAS Build APK/TestFlight) — still running live off a
      dev machine via Expo Go for every session, per `docs/deployment.md` Path 1.

## Known gaps / tech debt

- Editing a crawl only covers name/description/visibility, not the stop list itself (no
  reorder/add/remove after publishing — would need to reuse the builder UI from `create.tsx`).
- `crawls` has no `updated_at`/edit history.
- No push notifications — realtime feed updates only fire while the Feed tab is open and
  mounted.
- History has no pagination — like Feed used to, `loadTrips` (in `history/index.tsx`) pulls every
  completed trip in one query. Same fix would apply (`.range()` + `onEndReached`) once it matters
  at scale.
- No offline handling — the app assumes a live network connection throughout; a dropped
  connection mid-crawl doesn't queue writes.
