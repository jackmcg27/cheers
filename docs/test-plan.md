# Manual test plan

A walkthrough to confirm the app actually works end to end, on a real device. This isn't a
substitute for `npm run test:coverage` (that covers `lib/` logic) — it's for the screens, native
APIs, and Supabase wiring that the Jest suite deliberately doesn't touch (see
[`docs/architecture.md`](architecture.md)'s "Not covered" note).

Check items off as you go. If something fails, note the step and what happened instead of the
expected result — that's usually enough detail to hand back to whoever's fixing it.

## Before you start

- [ ] `npx expo start --tunnel` (or `--port 8081` on the same Wi-Fi) is running, no red error
      screen on launch.
- [ ] You have **two test accounts** — most of Phase 2 (follow/feed) needs a second person. Two
      real emails you can check (or two aliases of the same inbox, e.g. `you+a@gmail.com` /
      `you+b@gmail.com`) both work.
- [ ] Migration `0007_trip_companions.sql` has been run against the Supabase project (Dashboard →
      SQL Editor), or the companions steps below will fail with a missing-table error.
- [ ] Supabase Dashboard → Authentication → URL Configuration → Redirect URLs includes this
      project's redirect URL (`exp://**` for Expo Go/tunnel, `cheers://**` for a standalone
      build) — see the Gotchas entry in `docs/architecture.md` if magic link / password reset
      below bounce you back to sign-in instead of signing you in.

---

## 1. Auth

Use **Account A** for this whole section.

- [ ] **Sign up**: enter a display name, email, password → Sign Up. Lands on the Compass screen
      (or shows a "check your email" style status if your Supabase project requires email
      confirmation).
- [ ] **Sign out** (History tab → "Sign out") → back on the sign-in screen.
- [ ] **Sign in** with the same email/password → lands on Compass.
- [ ] **Magic link**: sign out, leave email blank, confirm the link under the buttons reads
      *"Enter your email above to send a magic link"* and is greyed out / not tappable. Type an
      email → label changes to *"Or send me a magic link instead"* and turns tappable. Tap it →
      status says to check email.
- [ ] Open the magic-link email on the **same phone the dev server is running for**, tap the
      link → app opens and you're signed in (not bounced back to a blank sign-in form).
- [ ] **Forgot password**: sign out. Same disabled/enabled visual treatment as magic link when
      email is blank/filled. Tap "Forgot password?" with an email filled in → status says to
      check email.
- [ ] Open the reset email, tap the link → app opens directly on the **"Set a new password"**
      screen (not Compass, not sign-in).
- [ ] Enter two different passwords in the new-password/confirm fields → submitting shows
      *"Passwords don't match."* and does not proceed.
- [ ] Enter matching passwords (6+ chars) → submitting lands you on Compass, signed in.
- [ ] Sign out, sign back in with the **new** password → works. Old password should now fail.

## 2. Compass / crawl loop

Physical device required for GPS/heading — see `docs/local-dev-without-a-phone.md` if testing
from a laptop with `EXPO_PUBLIC_MOCK_LOCATION=true` instead (skip the "walk toward it" steps and
use the mock controls to simulate arrival).

- [ ] Compass screen loads, finds a nearby bar, bottle graphic points toward it.
- [ ] Toggle **Reveal Mode** off → bar name/address/photo hidden ("Surprise Me"). Toggle back on
      → details reappear.
- [ ] Walk toward the bar (or fake it via mock location) → "I'm here" hint appears automatically
      when close; manual "I'm here" button also works from further away.
- [ ] Confirm arrival → screen transitions to the arrived/drink-logging view, scrolls properly if
      content overflows (no clipped buttons at the bottom).
- [ ] **Log a drink** for yourself, optionally typing a drink name → counter increments.
- [ ] **Add a companion**: search for Account B by display name → add them. Also add a
      **guest** by typing a free-text name with no matching account.
- [ ] Each companion gets their own drink counter, separate from yours. Log a couple of drinks
      for each (with names on at least one each).
- [ ] **Remove a companion** → their counter disappears; drinks already logged for them don't
      carry over to your own count.
- [ ] Log drinks quickly until your own trip-wide pace exceeds ~2/hr with at least 3 logged →
      the amber "drink responsibly" banner appears. Dismiss it → it disappears (until the next
      drink re-triggers it).
- [ ] Move to a second stop (or end the trip) → confirm the next stop's compass/search still
      works, and companions/drink counts from the previous stop aren't lost.
- [ ] End the trip.

## 3. History

- [ ] The just-finished trip appears at the top of History, with correct stop count, 🍻 total,
      duration, and distance.
- [ ] If the trip had companions: the card shows a **per-person breakdown** ("You: ...",
      "Sam: ...", the guest's name: ...) instead of one flat drink line. A solo trip (no
      companions) still shows the old single-line summary.
- [ ] Stats card at the top (crawls / bars visited / drinks / walked / published) reflects the
      new trip.
- [ ] **Edit display name** → change it, save, confirm it updates immediately in the profile row
      (and later, on new Feed posts).
- [ ] **Post to Feed** on a trip, with a caption → succeeds, no error.
- [ ] **Publish as Crawl** on a different trip → give it a name → succeeds; the card's action now
      reads "View Crawl" instead of "Publish as Crawl". Confirm you can't publish the *same*
      trip twice (the button stays "View Crawl", doesn't offer Publish again).
- [ ] **Delete a trip** (one you haven't posted/published) → confirm prompt → removed from the
      list, stats update.
- [ ] Delete a trip you **did** post to Feed → also disappears from Feed (see section 5).
- [ ] Scroll through History with 20+ trips (or don't worry about this if you don't have that
      many yet — no pagination here yet, see `PROGRESS.md`'s Known gaps).

## 4. Crawls

- [ ] **Crawls tab** shows public crawls + your own.
- [ ] **Create a crawl**: search bars by text, add a few in order, reorder them, save → appears
      in "your crawls".
- [ ] Open a crawl's **detail screen** → ordered stop list, "Open in Maps" per stop opens the
      right place in your map app.
- [ ] **Start This Crawl** → Compass now follows the fixed route stop-by-stop (not just nearest
      bar) — confirm it points at stop 1, then advances to stop 2 after arrival, in order.
- [ ] **Edit a crawl** you created (name/description/public toggle) → saves.
- [ ] **Delete a crawl** you created → confirm prompt → gone from your list. If a trip had
      started that crawl, confirm deleting doesn't error (this was a real bug, `0004`).

## 5. Feed

Do this section with **both** accounts — sign in as Account B on a second device/simulator, or
just sign out/in between steps on one device.

- [ ] As Account A: **follow** Account B via the search box (type part of their display name,
      tap Follow). Button flips to "Following".
- [ ] As Account B: post a trip to the Feed (see section 3).
- [ ] As Account A: the new post from B shows up in the Feed (realtime — shouldn't need a manual
      refresh if the Feed tab is already open and mounted).
- [ ] **Like** the post, confirm the count increments and the heart fills; tap again to unlike.
- [ ] **Comment** on the post, confirm it appears in the thread and the comment count updates.
- [ ] **Unfollow** B directly from their post card ("Following ✕" badge) → button state updates;
      confirm their *future* posts stop appearing (past ones may still show depending on RLS —
      not a bug, just how the feature's scoped).
- [ ] As Account B: **delete** your own post from its card → confirm prompt → gone from A's feed
      too.
- [ ] **Pagination**: with 20+ posts visible to an account (may need to seed some test posts),
      scroll to the bottom of the Feed → a spinner appears briefly and more posts load. Confirm
      no duplicate posts and it stops loading once you've reached the end.
- [ ] Pull-to-refresh at the top of the Feed → reloads from the first page.

## 6. Cross-cutting

- [ ] Force-quit and relaunch the app while signed in → lands back on Compass (or wherever),
      not sign-in — session persists.
- [ ] Turn off Wi-Fi/data mid-action (e.g. mid-drink-log) → app doesn't crash; it may show an
      error, which is expected (no offline queueing yet, see `PROGRESS.md`).
- [ ] Rotate/resize (if testing on a tablet or split-screen) — not officially supported, just
      confirm nothing renders completely broken.

---

## Known-gap reminders (not bugs, don't file them)

These are called out in `PROGRESS.md`'s "Known gaps" section — expected to not work yet:

- No trip photos.
- No real map widget (only "Open in Maps" deep links).
- No push notifications — Feed realtime only fires while the tab is mounted.
- No offline write queueing.
- History has no pagination yet (Feed does).
- Crawl editing only covers name/description/visibility, not the stop list.
