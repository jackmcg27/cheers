# Progress

What's built, what's not, and what's known to be missing or rough. This is the source of truth
for project status — check it before assuming a feature doesn't exist, and **update it** when
you finish (or start) something.

> **If you're an AI coding agent working in this repo**: update this file as part of any task
> that adds, removes, or changes a feature. Move items between sections, don't just append.
> Leave the "Known gaps / tech debt" section honest — it's more useful than a checklist that
> only ever says "done."

Last updated: 2026-07-14.

## Phase 1 — Core loop ✅ done

- [x] Auth (Supabase email/password + magic link)
- [x] Compass screen: live GPS + device heading, rotating beer-bottle pointer
      (`components/BottleCompass.tsx`, replaces the earlier plain triangle arrow) points at
      target bar, with a warm amber/gold pub palette on the primary buttons and dial
- [x] Reveal Mode toggle ("Surprise Me" vs. show name/address/photo)
- [x] Nearest-bar search via Google Places API (New)
- [x] Manual "I'm here" arrival confirm (+ auto-hint when close)
- [x] Drink counter per stop
- [x] Trip saved to Supabase (stops with arrival/departure timestamps, drink logs)
- [x] Trip History tab (past trips: stops, drinks, duration, distance)

## Phase 2 — Social ✅ done

- [x] Post a finished trip to the feed (caption + stats)
- [x] Follow / unfollow (one-directional, no request/accept step)
- [x] Feed screen: posts from you + people you follow, realtime new-post updates
- [x] Likes (toggle) and comments on posts
- [x] Find-people search (by display name) with follow button inline
- [x] Display name collected at sign-up (required) and editable afterward from the History tab
      (fixes an earlier gap where it was never set and everyone showed as "Someone")

## Phase 3 — Crawl routes ✅ done

- [x] Publish a completed trip's stop order as a named, shareable crawl
- [x] Dedicated crawl builder: search bars by text, add in order, reorder, save
- [x] Browse public crawls + your own (Crawls tab)
- [x] Crawl detail screen: ordered stop list, "Open in Maps" per stop
- [x] "Start This Crawl" — compass follows the fixed route stop-by-stop instead of
      always picking the nearest bar (freeform mode still available too)

## Developer experience ✅ done

- [x] Mock-location dev mode (`EXPO_PUBLIC_MOCK_LOCATION=true`) — develop and test the whole
      compass loop in a laptop browser, no phone/emulator/magnetometer needed. See
      `docs/local-dev-without-a-phone.md`.
- [x] CI (`.github/workflows/ci.yml`): typecheck, lint, tests + coverage (gated by a threshold,
      reported in the job summary + as an artifact), and a bundle sanity check — runs on every
      push to `main` and every PR.

## Phase 4 — Polish 🚧 partial

- [x] Drink type / name on a logged drink — optional text field next to "+ Drink"
      (`drink_logs.drink_name`, not surfaced elsewhere yet — see Known gaps)
- [x] Edit (name/description/public) / delete a crawl — creator-only, from the crawl detail screen
      (delete needed a follow-up migration, `0004`, since `trips.crawl_id` had no `ON DELETE`
      behavior and blocked deleting any crawl someone had actually started — now `SET NULL`)
- [x] Profile / stats screen — folded into the History tab rather than a new tab (total crawls,
      bars visited, drinks, distance walked, crawls published)
- [ ] Trip photos
- [ ] Real map widget (route/pins) — currently "Open in Maps" links only, see
      [`docs/architecture.md`](docs/architecture.md) for why
- [ ] "Drink responsibly" pace nudge

## Testing 🚧 partial

- [x] Unit tests for `lib/` (bearing math, formatting, errors, Places API, Supabase- and
      Supabase-mock-backed crawl/feed/stats logic) — see `docs/architecture.md`'s Testing section
- [ ] Tests for `lib/trip-context.tsx` (the compass state machine)
- [ ] Any screen/component tests (needs `@testing-library/react-native` + native-module mocks,
      not set up yet)

## Deployment 🚧 partial

- [x] Tunnel testing (`npx expo start --tunnel`, `@expo/ngrok` installed) — verified working
      end to end on a real phone off Wi-Fi. See `docs/quickstart.md` for the fast path,
      `docs/deployment.md` for all options.
- [ ] No standalone installed build yet (EAS Build APK/TestFlight) — still running live off a
      dev machine via Expo Go for every session, per `docs/deployment.md` Path 1.

## Known gaps / tech debt

- Drink names/types are captured (`drink_logs.drink_name`) but not shown anywhere yet — History
  and Feed still only show a total drink count, not a per-drink breakdown.
- Editing a crawl only covers name/description/visibility, not the stop list itself (no
  reorder/add/remove after publishing — would need to reuse the builder UI from `create.tsx`).
- No way to remove a follow relationship from the UI other than the Feed tab's search result
  row (works, just not discoverable from a profile view — there is no profile view yet).
- `crawls` has no `updated_at`/edit history; publishing twice from the same trip creates two
  separate crawls.
- Feed pagination doesn't exist — `fetchFeed` pulls everything visible in one query. Fine at
  current scale, will need a `.range()`/cursor before this matters.
- No push notifications — realtime feed updates only fire while the Feed tab is open and
  mounted.
- No offline handling — the app assumes a live network connection throughout; a dropped
  connection mid-crawl doesn't queue writes.
