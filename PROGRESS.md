# Progress

What's built, what's not, and what's known to be missing or rough. This is the source of truth
for project status — check it before assuming a feature doesn't exist, and **update it** when
you finish (or start) something.

> **If you're an AI coding agent working in this repo**: update this file as part of any task
> that adds, removes, or changes a feature. Move items between sections, don't just append.
> Leave the "Known gaps / tech debt" section honest — it's more useful than a checklist that
> only ever says "done."

Last updated: 2026-07-16 (two more bugs found manually testing companion joining, both fixed: (1)
a viewer's own drink tally on the trip detail screen (`TripDetailView.tsx`'s "You" row) always
showed "No drinks logged", even when they'd logged drinks with no name typed in — `fetchTripDetail`
only ever exposed `ownDrinkSummary` (`null` whenever nothing was *named*, per `summarizeDrinkNames`,
even though the drinks were still counted), with no count to fall back to. Every other person's row
already had this fallback (`TripDetailCompanion.drinkCount`), just not the viewer's own. Added
`TripDetail.ownDrinkCount` alongside `ownDrinkSummary` and used the same `drinkSummary ?? (count > 0
? "N drinks" : "No drinks logged")` pattern for the "You" row. (2) Accepting a companion invite
dropped straight into the "arrived" screen instead of "traveling to bar" — traced this to the
Phase 3 design itself, not a bug: a companion's device mirrors the host's live `phase` exactly
(see the 2026-07-16 Phase 3 entry below), and `CompanionsPanel` (where invites get sent) only ever
renders once `phase === 'arrived'`, so an invite can only be sent — and therefore only ever
accepted — while the host is already "arrived." Confirmed with the user this shared-phase
behavior is intentional (you add someone once you're actually together at the bar) and left as-is;
see the "Known gaps" entry below. Did find and fix one real bug along the way: `revealMode`
("Surprise Me") was local per-device state never reset by `resetTrip()` or `attachToTrip()`, so a
stale `true` from a previous crawl could leak into a new one or into a companion's freshly-attached
session. Both `resetTrip()` and `attachToTrip()` now reset it to `false`.)

Previously (2026-07-16): companion trips now show up in a companion's own History tab, not just
the host's — previously `history/index.tsx` queried `trips` filtered to `user_id = me`, so a trip
you were only tagged on never appeared anywhere in your own History even after `0013` made you a
full participant on it live. New `lib/history.ts#fetchHistoryPage` unions owned trips with trips
you're an *accepted* companion on (two round trips — PostgREST has no server-side subquery join —
first the companion `trip_id`s, then `trips` filtered to `user_id.eq.<me>,id.in.(<ids>)` via
`.or()`, falling back to a plain owner-only `.eq` when there are no companion trips to avoid
malformed `id.in.()` syntax). "Delete" was owner-only destructive `trips.delete()` — a companion
can't get that (RLS wouldn't allow it) and shouldn't: hard-deleting their `trip_companions` row
would cascade-delete their own `drink_logs` (`0007`'s `on delete cascade`), destroying their drink
data for the host and everyone else too. Added a soft-unlink instead: `0015_companion_history.sql`
adds `trip_companions.hidden_at`, settable only by the invitee on their own row (reuses `0011`'s
existing "invitee can respond to their own invite" policy shape, just a new column grant — no new
policy needed); `hideCompanionTrip()` sets it, `fetchHistoryPage` filters hidden rows out before
they're even queried. A non-owner's History card now shows "Remove from my history" (with a
confirm explaining it only affects their own view) instead of "Delete", and "Post to Feed"/
"Publish as Crawl" are hidden for non-owners too — deliberately kept to view + unlink for a
companion's own scope rather than shipping an unreviewed sharing feature; "View Crawl" still
shows if the trip already has one.

Also fixed the same "You" mislabeling bug (previously fixed once for the live trip view via
`followingCompanionId`, see the entry below) in the two places that become reachable the moment a
companion can view a trip they didn't own: `lib/trip-detail.ts`'s `fetchTripDetail` now takes a
`viewerId` and attributes `ownDrinkSummary`/"You" to whoever's actually looking — the owner's own
drinks if they own the trip, a companion's own drinks if they're that companion, or nobody's if
the viewer wasn't on the trip at all (e.g. a Feed follower who never logged a drink there — that
was *also* silently mislabeled "You" before this fix, an unrelated pre-existing bug caught as a
byproduct). Added `TripDetail.viewerInvolved` so `TripDetailView.tsx` only renders the "You" row
when the viewer actually has a stake in the trip; a non-owner viewer's `companions` list gets a
synthesized `{ id: 'owner', label: <host name> }` entry so the host's drinks don't just disappear.
Same fix shape in `lib/format.ts`'s `summarizeDrinksByCompanion`, extended with an optional
`viewerKey` param (defaults to `null` = owner, fully backward compatible) for History's card-level
per-person breakdown. `history/[id].tsx`'s `TripPhotoEditor` render is now gated on
`session.user.id === detail.ownerId` (mirroring `feed/[id].tsx`'s existing pattern) since it was
only ever safe unconditionally while History was owner-only.

Bundled into the same migration: a regression discovered while testing this — `0013`'s
`revoke update on public.trips from authenticated` narrowed the updatable-column list but missed
`photo_url` (added by `0009`, before that revoke existed), silently breaking
`uploadTripPhoto`/`removeTripPhoto` for every trip owner, not just companions, on any project with
`0013` applied. `0015` adds the missing `grant update (photo_url) ...` alongside the `hidden_at`
work.)

Previously (2026-07-16): two bugs found manually testing Phase 3 against a real Supabase project,
both fixed: (1) invites and accept-attach only appeared after switching tabs away and back —
`useFocusEffect`-driven polling doesn't fire for anything happening while already sitting on the
Compass tab. Added `subscribeToInviteChanges()` (`lib/companion-invites.ts`), a realtime
subscription on `trip_companions` filtered to `user_id=eq.<uid>`, kept alive for the life of the
session (not scoped to a trip, since it has to cover the pre-attachment pending-invite state too)
and wired to re-run `loadFocusData` on any change; `respond()` in `app/(tabs)/index.tsx` also now
calls `checkActiveHostTrip()` directly after a successful accept instead of relying solely on the
realtime round-trip. (2) The top "+drink" counter always showed the host's own count/label "You"
regardless of who was looking at it, and pressing it from a companion's device would've logged the
drink under the host's tally (`addDrink(name)` with no `companionId`) instead of the companion's
own. Exposed `followingCompanionId` from `TripContextValue` (already tracked internally, just not
surfaced) so the UI can tell host from companion and pick the right count/write target; the top
counter now reads `companionDrinkCounts[followingCompanionId]` on a companion's device. Since
`companions` never includes the host (it only tracks people tagged onto the trip), a companion's
device now synthesizes a `{ id: 'host', name: hostName }` row into the list passed to
`CompanionsPanel` so the host's count is visible and still incrementable below. While touching
`CompanionsPanel`, also gated the "Add a friend" controls and each companion's "Remove" button
behind a new `isHost` prop — both were already silently rejected by RLS for a non-host viewer
(`addCompanion`/`removeCompanion` stay host-only), so showing them was misleading UI, not a
functioning feature.)

Previously (2026-07-16): Phase 3 of companion consent: an accepted companion now gets the same
control options as the host on the host's live trip, not just a dead-end "you're locked out"
banner. The two real gaps that made this more than a read-only view: (1) in freeform (nearest-bar)
mode the target bar only ever lived in the host's local React state, nothing was persisted until
arrival — fixed by persisting `target_bar_id`/`phase`/`route_index` onto `trips` the moment a
target is chosen, not just at arrival (`0013_companion_trip_parity.sql`); (2) once both host and
companion can write trip progress, per-device optimistic state can't be trusted alone — added a
realtime subscription (`0014_trip_realtime.sql`, `trips`/`trip_stops`/`drink_logs`/
`trip_companions`) that re-derives phase/target/drink-counts/companions from the DB via a new
`lib/trip-sync.ts#fetchLiveTrip` and applies them through the same setters local optimistic
updates use, so both parties' screens converge regardless of who made the change. New RLS: a
`SECURITY DEFINER` `is_active_trip_participant()` helper (mirrors `0011`'s `is_trip_companion`)
gates new write policies on `trips` UPDATE, `trip_stops` INSERT/UPDATE, `drink_logs` INSERT, plus
read policies on `crawls`/`crawl_stops` (via `is_active_trip_crawl()`) so a companion following a
*private* saved crawl can actually read its stops, and a `trip_companions` SELECT policy so an
accepted companion sees the full roster, not just their own invite row.
`active_host_trip()` (`0012`) now also returns `trip_id`, so `lib/trip-context.tsx`'s old
"blocking banner with a Leave button" is gone — the moment `phase === 'idle'` and there's an
active host trip, the companion's device attaches directly (`checkActiveHostTrip`/`attachToTrip`)
and moves straight into `traveling`/`arrived`. Companions still can't add/remove other companions
(`addCompanion`/`removeCompanion` stay host-only — deliberately, kept out of scope). `addCompanion`/
`removeCompanion` stay host-only — managing the roster is more sensitive than progressing an
already-agreed-upon crawl. `totalDrinkCount` (feeds `paceWarning`) is deliberately not
reconciled from the DB, stays local/optimistic only — a companion attaching mid-trip only sees
pace based on drinks logged after they attached; accepted as a minor known limitation rather than
adding query complexity to sum all-time company-wide drinks.

Previously (2026-07-16): three bugs found while testing Phase 2 of companion consent, all fixed:
(1) Signing out left the tab bar and its screens mounted — nothing redirected back to sign-in, so
`history/index.tsx`'s "Sign out" button (never gated on `session` to begin with) just stayed on
screen after the rest of that screen's session-gated content disappeared. `app/(tabs)/_layout.tsx`
now redirects to `/(auth)/sign-in` once `session` goes null. (2) That redirect then surfaced a
second, previously-latent bug: unmounting the Compass screen runs `hooks/useLocation.ts`'s cleanup,
which calls `subscription.remove()` — on web, expo-location's `LegacyEventEmitter` returns the raw
native module instead of a real emitter wrapper, which has no `removeSubscription`, so the call
always throws on web (nothing had ever unmounted that screen before). Wrapped the cleanup in
try/catch. (3) `0011_trip_companion_consent.sql`'s new `trips` policy did a raw correlated
subquery on `trip_companions`, whose own `0007` policy subqueries `trips` right back — the same
`feed_posts`/`trips` recursion cycle `0006` already fixed once, reintroduced on a different edge.
Fixed by adding a `SECURITY DEFINER` helper (`is_trip_companion`), same trick as `0006`, editing
`0011` in place since it hadn't been committed yet. Separately, noticed the host's companion list
had no way to reflect an invitee's accept/decline at all — `companions` state in
`lib/trip-context.tsx` only ever grew via local `addCompanion` pushes, nothing re-read from the
DB. Added `fetchTripCompanions()` (`lib/companion-invites.ts`) and `refreshCompanions()` (trip
context), polled on every focus of the Compass tab alongside the existing invite/active-host-trip
polling — not realtime, so the host has to switch tabs away and back to see a status change.)

Previously (2026-07-16): Phase 2 of companion consent: once you've *accepted* an invite onto
someone else's still-active crawl, `startCrawl`/`startCrawlWithRoute` now block you from starting
a separate one of your own — a soft lock, enforced client-side rather than by a DB trigger.
`0012_active_companion_lock.sql` adds a `SECURITY DEFINER` function, `active_host_trip()`, that
(scoped internally to `auth.uid()`, no parameter a caller could probe another user's status with)
returns whichever of your own `trip_companions` rows is `status = 'accepted'` on a trip with
`ended_at is null`, plus the host's display name; `lib/companion-invites.ts` gained
`fetchActiveHostTrip()` to call it. The Compass screen now shows a persistent banner ("You're on
X's crawl...") with a Leave button whenever that's the case — "leave" is just declining the
invite you already accepted (`respondToInvite`, which the invitee can call regardless of the
row's current status). Also fixed a latent bug in Phase 1's `fetchPendingInvites`: its
`trips!inner(profiles!user_id(display_name))` embed had no RLS path to the host's `trips` row
at all (owner-only/feed-visible-only from `0001`/`0006`), so an invite from someone you don't
follow would've been silently filtered out of the results entirely, not just missing a name —
added a `trips` select policy for a trip's own companions to `0011` to fix this before it shipped.
Being locked into the host's *session itself* (route/stops/pace) shipped as Phase 3 — see the
2026-07-16 entry above.)

Previously (2026-07-16): Phase 1 of companion consent: tagging a linked app-user companion now
creates a pending invite instead of an instant add — `0011_trip_companion_consent.sql` adds a
`status` column (`pending`/`accepted`/`declined`, default `accepted` so guest-name companions,
who have no account to ask, keep the old instant-add behavior) plus RLS/grants so the *invitee*
can see and respond to their own invite (column-level `grant update (status)` only, so responding
can't be used to rewrite `trip_id`/`user_id`/`guest_name`). New `lib/companion-invites.ts`
(`fetchPendingInvites`, `respondToInvite`); Compass screen shows an Accept/Decline banner for
pending invites addressed to you; `CompanionsPanel.tsx` shows invite status and only renders a
`DrinkCounter` for an `accepted` companion.

Previously (2026-07-16): fixed white, unreadable `TextInput` text in light mode — every text
field in the app hardcoded `color: '#fff'` with no explicit background, so it was only readable
against the dark-mode background. Added `components/ThemedTextInput.tsx`, following the existing
`ThemedText`/`ThemedView` pattern, and swapped it in for every `TextInput` across the app:
`sign-in.tsx`, `reset-password.tsx`, `history/index.tsx`, `feed/index.tsx`, `crawls/create.tsx`,
`crawls/[id].tsx`, `CompanionsPanel.tsx`, `DrinkCounter.tsx`. Button text left as hardcoded white —
those sit on solid-colored backgrounds that don't change with theme, so they were never actually
broken.

Previously (2026-07-15): added profile pictures end to end — Storage bucket/column, upload/
remove, and an `Avatar` shown everywhere a name already appears; also fixed the Followers tab
appearing permanently blank, and made author/comment/search-result names tappable throughout
Feed, linking to a new public profile screen. Tried and reverted a custom in-app circular
cropper — crashed on-device; back to the native square crop. Fixed the compass screen's
"arrived" view getting cut off at the bottom once enough companions are added, then swept every
screen for the same class of bug and fixed three more that were missing the tab-bar-clearance
bottom padding entirely: crawls/create, crawls/[id], feed/followers. Raised `lib/` line coverage
to a genuine, enforced 100%: scoped jest's `collectCoverageFrom` to `lib/**/*.{ts,tsx}` explicitly
(previously the two files no test imported — `auth-context.tsx`, `supabase.ts` — were silently
excluded from the coverage denominator instead of counting as untested), added
`auth-context.test.tsx` and `supabase.test.ts` to actually cover them, and raised
`coverageThreshold.global.lines` from 90 to 100 so it's mechanically enforced going forward; see
the Testing section of `docs/architecture.md` and the new rule in `AGENTS.md`).

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
      a stop, either an existing app user (search by display name) or a free-text guest name for
      a friend who isn't on the app. Tagging an app user now creates a pending invite rather than
      an instant add — see the 2026-07-16 entry above (`0011_trip_companion_consent.sql`,
      `lib/companion-invites.ts`) — while a guest name is still instant, since there's no account
      to ask. Each companion gets their own per-stop `DrinkCounter` once accepted; companion
      drinks are tracked in `drink_logs` via a new `companion_id` column but deliberately excluded
      from the trip owner's own `paceWarning` calculation (that nudge is about personal
      responsibility, not policing friends). Companions and their drink counts don't persist
      across trips — same per-trip scope as everything else in `drink_logs` today. The History
      tab now shows a per-person drink breakdown for any trip that had companions (`lib/format.ts`'s
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
- [x] View another user's public profile (`app/(tabs)/feed/user/[id].tsx`, `lib/profile.ts`) —
      display name, follower/following counts, a Follow/Following button, their public crawls,
      and their feed posts. Deliberately doesn't show History's full stats card (total drinks/
      distance/etc.) since RLS only exposes *all* of a user's trips to themself
      (`trip_visible_via_feed_post`: visible to others only if posted-to-feed and followed) — a
      "total" for someone else would silently under-count, so posted trips/public crawls are
      shown as lists instead, where a partial view is expected. Reached by tapping a name: a
      Feed card's author, a comment's author, a follow-search result, a Feed post's detail-screen
      title, or a row on the Followers list
- [x] Comment author id (`lib/feed.ts`'s `PostComment.authorId`, from `fetchComments`) — needed
      so comment authors' names can link to the profile screen above, not tracked before
- [x] Fixed the Followers tab appearing permanently blank (no spinner, no rows, no "No followers
      yet." fallback) — `followers.tsx`'s `FlatList` passed `refreshing={loading}` without
      `onRefresh`, which means React Native never mounts the `RefreshControl` at all, so a hung
      load looked identical to "nothing to show." Fixed by extracting the fetch into a memoized
      `load` and wiring it to both `useFocusEffect` and `onRefresh`

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
- [x] Edit a crawl's stop list after publishing (reorder/add/remove) — creator-only, "Edit Stops"
      on the crawl detail screen, reusing `create.tsx`'s add/reorder/remove-and-search UI pattern
      against a local draft. `lib/crawls.ts`'s `replaceCrawlStops` does delete-then-reinsert
      (extracted `upsertBarsAndGetIds` out of `createCrawl` so both share the bar-upsert step);
      no new migration needed, same owner-only RLS `crawl_stops` already had
- [x] Profile / stats screen — folded into the History tab rather than a new tab (total crawls,
      bars visited, drinks, distance walked, crawls published)
- [x] "Drink responsibly" pace nudge — a dismissible amber banner on the Compass screen
      (`lib/trip-context.tsx`'s `paceWarning`/`dismissPaceWarning`) that appears once a trip's
      running drink pace (across all stops, not just the current one) exceeds 2/hr with at
      least 3 drinks logged, so it can't fire off the first round. Recomputed each time a
      drink is logged; dismissing it just clears the current banner, the next drink can
      re-trigger it.
- [x] History pagination — mirrors Feed's `.range()` + `onEndReached` pattern (`HISTORY_PAGE_SIZE`
      = 20, `loadTrips`/`loadMoreTrips` in `history/index.tsx`, backed by `lib/history.ts#fetchHistoryPage`
      now that the query merges owned + companion trips — see the 2026-07-16 entry above)
- [x] Trip photos — one optional photo per trip, owner-only, uploaded via `expo-image-picker`
      from `components/TripPhotoEditor.tsx` (shared by History's own detail screen and, when
      you're the owner, Feed's detail screen too). `lib/trip-photos.ts`'s
      `uploadTripPhoto`/`removeTripPhoto` write to a public `trip-photos` Storage bucket under
      `${userId}/${tripId}.<ext>` and set/clear `trips.photo_url`; `0009_trip_photos.sql` adds the
      column, bucket, and owner-only write / public-read `storage.objects` policies. The upload's
      extension/content-type are sniffed from the actual decoded bytes rather than trusted from
      the picker's `mimeType` field, which can disagree with the real (often re-encoded-on-crop)
      format — see the Gotchas entry in `docs/architecture.md`. `TripDetailView` renders the
      photo when set, so it shows on both History's and Feed's detail screens
- [x] Delete your own post from the Feed detail screen, not just its list card — same
      `lib/feed.ts` `deletePost`, gated on `session.user.id === detail.ownerId` and a `postId`
      route param now passed through from `feed/index.tsx`'s `openPost`
- [x] Profile pictures — one optional avatar per user, uploaded via `expo-image-picker` from
      `components/AvatarEditor.tsx` (shown on History's own profile header, the only place you
      can change your own). `lib/avatar.ts`'s `uploadAvatar`/`removeAvatar` write to a public
      `avatars` Storage bucket under `${userId}/avatar.<ext>` and set/clear
      `profiles.avatar_url`; `0010_avatars.sql` adds the column, bucket, and owner-only write /
      public-read `storage.objects` policies, mirroring `0009_trip_photos.sql`'s structure. The
      byte-sniffing (`sniffImageFormat`) and local-file-read (`readLocalImageBytes`) logic used
      to be private to `lib/trip-photos.ts`; both are now extracted to shared `lib/image-upload.ts`
      and reused by both `trip-photos.ts` and `avatar.ts`, same cache-busting-URL and
      RLS-path-namespacing reasoning as trip photos (see the Gotchas entry in
      `docs/architecture.md`). `components/Avatar.tsx` (a circular image with an initials
      fallback when there's no `avatarUrl`) is wired in everywhere a name already shows: Feed
      card author, comment author, search-result row, Feed detail title, the Followers list, and
      the public profile screen — each of `FeedPost`/`PostComment`/`ProfileMatch`/`Follower`/
      `TripDetail`/`UserProfile` picked up an avatar URL field alongside its existing name field.
      Cropping uses `expo-image-picker`'s native `allowsEditing`/`aspect: [1, 1]` — square, not
      circular (the OS crop UI has no circular-mask option on either platform). A custom in-app
      circular cropper was built and tried but crashed on-device, so it was reverted — see the
      Gotchas entry in `docs/architecture.md` before re-attempting this
- [ ] Real map widget (route/pins) — currently "Open in Maps" links only, see
      [`docs/architecture.md`](docs/architecture.md) for why

## Testing 🚧 partial

- [x] Unit tests for `lib/` (bearing math, formatting, errors, Places API, Supabase- and
      Supabase-mock-backed crawl/feed/stats logic) — see `docs/architecture.md`'s Testing section
- [x] Tests for `lib/trip-context.tsx` (the compass state machine) — drives the real
      `TripProvider`/`useTrip()` via `react-test-renderer`'s `act()` + a capturing harness
      component (no `@testing-library/react-native` needed for a hooks-only test like this),
      same Supabase query-builder mock pattern as `crawls.test.ts`; covers `addCompanion`
      (guest and app-user paths), `removeCompanion`, and companion-scoped `addDrink` too. Also
      covers the Phase 3 realtime sync: a `fakeChannel()` stub captures each
      `.on('postgres_changes', { table }, cb)` registration by table name so a test can invoke a
      table's callback directly to simulate a live event, exercising `reconcileTrip`'s three
      paths (normal reconcile, host-ended-trip auto-reset, fetch failure), the
      `trip_companions` handler, and `checkActiveHostTrip`/`attachToTrip`/`leaveHostTrip`'s
      branches
- [x] `lib/__tests__/trip-sync.test.ts` covers `fetchLiveTrip`'s row mapping (open-stop
      detection, target-bar mapping, per-companion drink counts, error propagation)
- [x] `format.test.ts` covers `summarizeDrinksByCompanion`, including the `viewerKey` param that
      attributes "You" to a companion instead of the owner; `deep-link.test.ts` covers the `type`
      field (`recovery` vs. `magiclink`/absent) used by the password-reset flow; `feed.test.ts`
      covers `fetchFeed`'s pagination (`.range()` defaults + custom offset/limit) and now `tripId`
      mapping; `trip-detail.test.ts` covers `fetchTripDetail`'s stop sorting, per-stop/per-companion
      drink summaries (including a companion with zero drinks still appearing), preferring an
      app-user's display name over a guest name, and the viewer-identity branches (owner, attached
      companion, and an uninvolved viewer with no "You" row); `history.test.ts` covers
      `fetchHistoryPage`'s owner-only vs. `.or()`-unioned query shapes, its row mapping (owner vs.
      companion viewer, the synthesized `{ id: 'owner', ... }` entry, excluding the viewer's own
      companion entry), `hasMore`, and `hideCompanionTrip`
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

- A companion's device always mirrors the host's shared `phase` exactly (see Phase 3 above), so
  accepting an invite drops you straight into whatever phase the host is currently in — almost
  always `arrived`, since `CompanionsPanel` (where invites are sent from) only renders once the
  host has already arrived at a stop. Confirmed with the user (2026-07-16) this is intentional,
  not a bug: you add a companion once you're actually together at the bar. A "true" fix (tracking
  each companion's own arrival separately from the host's) would be a materially larger feature,
  not a small correction, and was explicitly deferred.
- Companions still can't manage the roster (`addCompanion`/`removeCompanion` stay host-only, and
  the UI now hides those controls entirely on a companion's device) — deliberate scope cut in
  Phase 3, not a gap to close casually: letting an attached companion add or remove other
  companions is a materially more sensitive action than progressing an already-agreed-upon crawl.
- `paceWarning`'s underlying `totalDrinkCount` is local/optimistic only, not reconciled from the
  DB on realtime events — a companion who attaches mid-trip only sees pace based on drinks logged
  after they attached, not the host's full running total. Would need summing all-time
  company-wide drinks server-side to fix; not worth the query complexity for a nudge banner.
- Realtime `drink_logs` events aren't filtered server-side to the current trip (the table has no
  `trip_id` column, only `trip_stop_id`) — every client subscribed to any trip gets every
  `drink_logs` change and does a full `reconcileTrip` re-fetch to figure out if it mattered.
  Harmless (RLS still scopes what `fetchLiveTrip` can actually read back) but slightly wasteful
  at scale.
- `crawls` has no `updated_at`/edit history.
- No push notifications — realtime feed updates only fire while the Feed tab is open and
  mounted.
- No offline handling — the app assumes a live network connection throughout; a dropped
  connection mid-crawl doesn't queue writes.
