# Instructions for AI coding agents

- **Check [`PROGRESS.md`](PROGRESS.md) before starting work**, and **update it** when you finish
  (or start) a task — move items between sections, add new known gaps, don't just append to a
  changelog. It's the source of truth for what's actually built vs. not.
- Read [`docs/architecture.md`](docs/architecture.md) before touching code you haven't seen —
  it explains where things live, the patterns already in use, and a list of real gotchas hit
  while building this (stale-error-message bugs, PostgREST embed ambiguity, typed-routes
  cache staleness, etc.) worth reading before you re-hit them.
- Schema changes go in a new numbered file under `supabase/migrations/`, then the hand-written
  `Database` type in `lib/supabase.ts` needs updating to match by hand — there's no
  `supabase gen types` step in this project.
- When you add a new `lib/*.ts` file with real logic, add a matching test in
  `lib/__tests__/` (see the Testing section of `docs/architecture.md` for the patterns used).
- **`lib/` must stay at 100% line coverage.** `npm run test:coverage` enforces this via
  `coverageThreshold.global.lines` in `package.json`'s jest config (`collectCoverageFrom` scopes
  the measurement to `lib/**/*.{ts,tsx}` only — `app/` screens and `components/*.tsx` have no
  tests and aren't part of this bar). If you add or change a `lib/*.ts(x)` file, run
  `npm run test:coverage` before finishing and add whatever test cases are needed to keep every
  line covered — including files that only get exercised by a real (unmocked) import, like a
  client/singleton module; see `lib/__tests__/supabase.test.ts` for that pattern
  (`jest.resetModules()` + `require()` inside the test, with `@react-native-async-storage/async-storage`
  swapped for its bundled jest mock).
- Expo/React Native APIs change quickly between SDK versions. Check `package.json`'s `expo`
  version and read the versioned docs for that exact version at
  `https://docs.expo.dev/versions/v<major>.0.0/` before assuming an API from training data is
  still current — don't hardcode a version number here, it will go stale.
