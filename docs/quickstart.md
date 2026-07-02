# Quickstart: get out the door

For when `.env` is already set up, everyone already has accounts, and you just want the app
running fast before a night out. If you haven't done first-time setup yet, see
[`docs/setup.md`](setup.md) instead.

## 1. Start the tunnel

```bash
npx expo start --tunnel
```

Wait for `Tunnel ready.` and a URL ending in `.exp.direct` to appear.

## 2. Everyone connects

Each person, in **Expo Go**:

1. Tap **"Enter URL manually"**
2. Type the `exp://...exp.direct` URL from step 1
3. Connect

This works over cellular, not just your home Wi-Fi — that's the point of `--tunnel`.

## 3. Leave the house

**Keep the host laptop on, plugged in, and connected to the internet for the whole night.**
This isn't an installed standalone app yet (see `docs/deployment.md` for that path) — Expo Go
runs the JS live off this machine through the tunnel. If it sleeps or loses internet, everyone's
app breaks until it's back up.

Windows: **Settings → System → Power & sleep** → set sleep to "Never" while plugged in, for
tonight.

## Before you go — 30 second checklist

- [ ] Everyone has Expo Go installed
- [ ] Everyone has an account with a display name set (required at sign-up; see the History tab
      if an existing account still needs one)
- [ ] Laptop won't sleep, is plugged in, has internet
- [ ] `npx expo start --tunnel` is running in a terminal you'll leave open

## If something breaks mid-crawl

- **App won't load / spins forever**: laptop asleep, lost Wi-Fi, or the terminal running the
  tunnel got closed. Fix the laptop, it should reconnect on its own.
- **A screen shows a red error banner**: see `docs/architecture.md`'s Gotchas section — most of
  the ones we've hit are documented there with the fix.
- **New person needs to join**: they need Expo Go + a display name at sign-up + the same
  `exp://...exp.direct` URL everyone else is using.
