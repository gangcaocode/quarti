# Quarti — notes for Claude

Shift scheduling for small Montréal restaurants. Solo founder; the pilot is French-first, bilingual.

## Ground rules

- `docs/rules.md` is the spec. When behaviour is unclear, it decides; if it's silent, ask before inventing a rule.
- Check its "Build status" section before starting: it says what exists and what's spec only. When a pull request builds part of the spec, move that item in the same pull request, and add any new decision to "Decisions while building".
- Work on a branch and open a pull request. Nothing lands on `main` without the owner's review.
- Propose before changing anything the owner didn't ask for (review-type changes: say what and why first).
- Supabase keys live in `apps/mobile/.env` (gitignored) or CI secrets — never in code, never the service key in the app.

## Architecture

- **The server enforces every rule.** Writes go through `security definer` functions in `supabase/migrations/*_scheduling.sql`; direct table writes are revoked. Row-level security decides what each person can read. Workers never see pay rates of others or anyone's email (`crew_shifts()`, `coworkers()` functions).
- Helper checks (`is_manager`, `is_staff`, `my_staff_id`, `shop_today`) and internal functions (`need_manager`, `tell`, …) live in the `private` schema, which the API doesn't expose. Don't add views or helpers to `public`; Supabase's security check (`get_advisors`) should stay clean apart from the app's own RPC functions.
- Functions fail with a short code (`raise exception 'double_booked'`). `packages/rules` lists the codes (`ERROR_CODES`), the app maps them to `errors.<code>` in `src/i18n`.
- Times: shifts store `day` + `start_min`/`end_min` (end may pass 1440 for overnight); a trigger fills `starts_at`/`ends_at` in the shop's timezone. "Today" is always the shop's local day (`private.shop_today()`), and `app_now()` can be pinned in tests.
- `packages/rules` holds pure logic shared by screens (overlaps, who can take a slot, labels). Keep it free of React and Supabase, and keep server and client rules in step.
- Update bodies written by the server (`private.tell()`) are English for now; the app translates titles by `kind`.

## App (apps/mobile)

- Expo SDK 58, Expo Router (`src/app`), React 19, TypeScript. See `apps/mobile/AGENTS.md` for Expo specifics; check versioned docs rather than memory.
- `src/lib/session.tsx`: signed-in session, the person's shops, the current shop and mode (manager / worker). `shops` and `shop` must change together (screens treat "shops loaded, no shop" as "go to Welcome").
- `src/lib/api.ts`: one wrapper per database function. `src/lib/data.ts`: reads.
- `src/ui/kit.tsx`: the small component kit (colors from the prototype in `theme.ts`).
- Every string goes in `src/i18n/en.ts` and `fr.ts` (TypeScript makes them match). Plurals use `_one` / `_other`.
- In this cloud sandbox `npx expo install` can't reach Expo's API: take versions from `node_modules/expo/bundledNativeModules.json` and install with npm.

## Commands

```bash
npm run typecheck
npm run test:rules
npm run test:db     # Postgres at DATABASE_URL, default postgresql://postgres@127.0.0.1:54329/postgres
npm run test:e2e    # browser run of the whole loop (e2e/README.md); SKIP_BUILD=1 to reuse the web build
```

Add a database test for every new rule or function (`supabase/tests`, one rolled-back transaction per test; `t.as(user)` to act as someone, `t.at(iso)` to set the clock). Extend `e2e/flow.mjs` when a new screen or flow lands.
