# Setup guide

Everything you need to go from a fresh clone to a running app on your phone. Follow the
sections in order — each one depends on the last.

## 0. Prerequisites

- **Node.js** 18 or newer (`node -v` to check).
- **A physical iOS or Android phone** with the **Expo Go** app installed (App Store / Play
  Store). Compass heading and GPS do not work in a simulator or emulator, so you cannot fully
  test this app without a real device.
- Your phone and computer on the **same Wi-Fi network** (or your computer's Wi-Fi if it's
  wired in — see troubleshooting below if the phone can't connect).
- A free **Supabase** account (https://supabase.com).
- A **Google Cloud** account with billing enabled (https://console.cloud.google.com) — Places
  API requires billing to be attached even to stay within the free monthly credit.

## 1. Clone and install

```bash
git clone <repo-url>
cd cheers
npm install
```

## 2. Create your Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
2. Pick a name (e.g. `cheers-dev`), set a strong DB password (save it somewhere — you likely
   won't need it again, but you can't retrieve it later), pick a region close to you.
3. Wait for it to finish provisioning (~1-2 minutes).
4. Go to **Project Settings → API Keys**. You'll need two values from here in step 4:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - The **publishable** key (starts `sb_publishable_...`)

   ⚠️ **Do not use the "secret" key** (`sb_secret_...`) anywhere in this app. The secret key
   bypasses Row Level Security entirely and must never ship inside a client bundle. The
   publishable key is the correct one — it's safe to expose, RLS still applies.

## 3. Run the database migrations

Migrations live in `supabase/migrations/`, numbered in the order they must run. Open your
Supabase project's **SQL Editor** (left sidebar), and for **each** file, in order:

1. Open the migration file locally, copy its entire contents.
2. Paste into a new query in the SQL Editor.
3. Click **Run**.
4. Confirm it says "Success. No rows returned" (this is normal — these are schema-only
   statements, not `SELECT`s).

Run them in this exact order:

1. `0001_phase1_schema.sql` — core tables (profiles, bars, trips, drink logs).
2. `0002_phase2_3_schema.sql` — crawls, follows, feed.
3. `0003_feed_trip_visibility.sql` — fixes read access so followers can see trip detail on
   feed posts.

If a new migration file has been added since this doc was last updated, run it too — always
apply every file in `supabase/migrations/` that you haven't already run, in numeric order.

**Double-check realtime is on**: after running `0002`, go to **Database → Replication** in the
dashboard and confirm `feed_posts` is enabled. The migration turns this on automatically, but
it's worth a quick look — without it, new feed posts won't show up live for followers (they'll
still show up on manual refresh).

## 4. Create your Google Cloud project (Places API)

1. Go to https://console.cloud.google.com/ → create a new project (e.g. `cheers-dev`).
2. **APIs & Services → Library** → search **"Places API (New)"** → **Enable**.
   This is the newer `places.googleapis.com` API this app calls — it is a different product
   from the legacy "Places API," make sure you enable the one labeled "(New)".
3. **APIs & Services → Credentials** → **Create Credentials → API key**. Copy it.
4. Restrict the key (click into it under Credentials):
   - **API restrictions**: restrict to "Places API (New)" only.
   - **Application restrictions**: none needed for local dev with Expo Go. Once the app is
     built for real distribution (EAS build), restrict by Android package name / iOS bundle
     ID (`com.cheers.app`) for a production key instead of using this dev key.
5. **Enable billing** on the Google Cloud project (Billing in the left sidebar) if it isn't
   already. Nearby-search and text-search calls will fail with a 403 without it, even though
   usage will stay within the free monthly credit for normal dev testing.

## 5. Configure your local environment

```bash
cp .env.example .env
```

Open `.env` and fill in the three values you collected above:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=...
```

`EXPO_PUBLIC_SUPABASE_URL` is just the base project URL — **no** `/rest/v1` or other path
suffix on the end.

`.env` is gitignored — every teammate needs their own copy with their own Supabase/Google Cloud
project (or shared dev credentials, coordinate with the team on that).

## 6. Run the app

```bash
npx expo start
```

Wait for `Waiting on http://localhost:8081` and a `Bundled ... modules` line with no errors.

On your phone, open **Expo Go**:

- If a QR code appears in your terminal, scan it with your phone's camera (iOS) or the Expo Go
  app's scanner (Android).
- If no QR code appears (common when running through some terminals/CI-like environments), tap
  **"Enter URL manually"** in Expo Go and type `exp://<your-computer's-LAN-IP>:8081` — find your
  IP with `ipconfig` (Windows) or `ifconfig`/`ipconfig getifaddr en0` (Mac).

Grant location permission when prompted.

## 7. Verify it's working

Walk through this checklist on your phone:

- [ ] Sign up with an email/password (or magic link) on the sign-in screen.
- [ ] **Compass tab**: tap "Start Crawl" — the compass arrow should point toward a real nearby
      bar and show a live distance.
- [ ] Tap "I'm here" (or walk close enough that it auto-enables) — you should see the drink
      counter and Next Bar / End Crawl buttons.
- [ ] Add a drink, tap Next Bar, then End Crawl.
- [ ] **History tab**: the completed trip should appear with stop count, drinks, duration,
      distance.
- [ ] From History, tap **Post to Feed** on that trip — check the **Feed tab**, your post
      should appear with stats and the bars you visited.
- [ ] From History, tap **Publish as Crawl** — check the **Crawls tab**, it should appear under
      "Your Crawls" with the correct stop order.
- [ ] From Crawls, tap into that crawl's detail page and hit **Start This Crawl** — back on the
      Compass tab, it should now say "Stop 1 of N" and guide you through that fixed route
      instead of always picking the nearest bar.

If everything above works, you're fully set up.

## Troubleshooting

**"Project is incompatible... uses SDK X but installed Expo Go is SDK Y"**
Expo Go only supports one SDK version at a time (whatever's currently on the App/Play Store).
Check `package.json`'s `expo` version against what your Expo Go app actually is, and align:
```bash
npx expo install expo@<the version matching your Expo Go app>
npx expo install --fix
```
Then delete `node_modules` and `package-lock.json` and run `npm install` fresh if you hit peer
dependency conflicts (a big SDK jump usually needs this).

**Dev server starts but nothing shows up on the phone / "port 8081 is being used"**
Something is already holding port 8081. Find and kill it, then restart:
```bash
# find the process
netstat -ano | findstr :8081        # Windows
lsof -i :8081                        # Mac/Linux
# kill it, then
npx expo start
```

**Dev server crashes immediately with `window is not defined`**
This means `app.json`'s `web.output` got changed to `"static"`. It must be `"single"` — static
output server-renders in Node, where `window` doesn't exist, and Supabase's storage adapter
touches it on startup, crashing the whole server (not just the web build).

**A screen shows a generic "Failed to load X" with no detail**
Somewhere a catch block is using `e instanceof Error ? e.message : 'fallback'` instead of
`errorMessage(e, 'fallback')` from `lib/errors.ts`. Supabase's errors are plain objects, not
`Error` instances, so the instanceof check always fails silently. Fix the catch block to use
the helper and the real error will surface.

**"Could not embed because more than one relationship was found for 'X' and 'Y'"**
A Supabase `.select()` call is embedding a related table (commonly `profiles`) without
specifying which foreign key to use. Add the column name as a hint:
`profiles!user_id(display_name)` instead of `profiles(display_name)`.

**Compass heading never updates / stays at 0**
You're testing in a simulator, emulator, or the web browser. This only works on a real device.

**Google Places calls fail with a 403**
Billing isn't enabled on the Google Cloud project, or "Places API (New)" specifically isn't
enabled (the legacy "Places API" doesn't count).
