# What costs money, and how to spin it down

Everything below is either free at the scale of a handful of developers/testers, or free with a
credit card on file that only charges past a threshold. Prices change — this doc tells you
**where to check current numbers** and **what to turn off** when you're done for the
day/weekend, rather than quoting figures that will go stale.

## Supabase

- **Free tier** covers a dev project comfortably: a Postgres database, auth, and realtime, all
  under generous limits for a small team's testing. Check current limits at
  https://supabase.com/pricing.
- **Free-tier projects pause automatically after about a week of no API activity.** This is
  normal, not an error — if the app suddenly can't reach the database, check the Supabase
  dashboard for a "paused" banner and click **Restore project**. Your data is preserved, it's
  just not running.
- **To spin down when you're done testing for a while**: you don't have to do anything —
  inactivity auto-pauses it. If you want to reclaim the project name/free-tier slot entirely,
  delete the project from **Project Settings → General → Delete project**.

## Google Cloud (Places API)

- **Requires a billing account attached to the project**, even to use the free monthly usage
  allowance — Places API (New) will return 403s without one, this isn't optional.
- Cost is per-request beyond the free monthly allowance, and varies by which fields you request
  (see the "field mask" pattern used in `lib/places.ts` — we already request only the fields we
  need, which keeps cost down). Check current pricing and the free-tier allowance at
  https://mapsplatform.google.com/pricing/.
- **Set a budget alert** so nobody gets surprised: Google Cloud Console → **Billing → Budgets &
  alerts → Create budget**. Set it low (e.g. $5-10/month) for a dev project — a small team of
  testers over a weekend will not come close to that under normal use, so an alert firing means
  something is actually wrong (e.g. a bug causing runaway requests), not just normal usage.
- **To spin down**: the API key alone doesn't cost anything sitting unused — cost is purely
  per-request. If you want to fully stop the possibility of charges between testing sessions,
  either disable the "Places API (New)" service (**APIs & Services → Enabled APIs → Places API
  (New) → Disable**) or remove billing from the project entirely. Re-enable before your next
  session.

## Apple Developer Program — only if you deploy to real iOS devices outside Expo Go

- **$99/year** (current as of writing — verify at https://developer.apple.com/programs/).
  Required for: TestFlight, ad-hoc/internal distribution builds installable outside Expo Go, or
  App Store submission. **Not required** for developing/testing via Expo Go, which is what
  we've been doing all along.
- No way around this cost for real iOS device installs — Apple requires it regardless of
  distribution method (even internal team testing).

## Google Play Developer account — only if you publish to the Play Store

- **$25 one-time** (current as of writing — verify at https://play.google.com/console/signup).
  **Not required** for sideloading an APK directly to Android phones for testing — that's free,
  see `docs/deployment.md`. Only needed if you want the app listed on the Play Store itself.

## EAS (Expo Application Services) — only if you build with `eas build`

- Has a free tier with a limited number of builds per month, sufficient for occasional weekend
  testing builds. Paid plans exist for more/faster concurrent builds. Check current limits at
  https://expo.dev/pricing. Not needed at all for the Expo Go / tunnel testing path.

## Bottom line for "just testing this weekend"

If you follow the **Expo Go + tunnel** path in `docs/deployment.md`, the only cost exposure is
Google Places API usage (has a free allowance, set a budget alert) and Supabase (free tier,
auto-pauses when idle). No Apple or Google Play account needed, no EAS build minutes spent.
