# End-to-end run

`npm run test:e2e` drives the web build of the app through the whole loop in a headless browser: a manager sets up a shop, adds people, plans and sends shifts; a worker joins with the invite code, accepts one shift and declines another; the manager sees the result; double-booking, the free-plan limit, setting someone inactive and switching to French are checked along the way.

It runs against the real migrations. The pieces:

- `setup-db.mjs` creates a fresh `quarti_e2e` database on the Postgres at `DATABASE_URL` and applies every migration.
- PostgREST (downloaded once into `e2e/.bin`) serves it, like Supabase's API does, so row-level security and the database functions apply exactly as in production.
- `gateway.mjs` stands in for Supabase's gateway: it forwards `/rest/v1` to PostgREST and fakes the email-code sign-in (`/auth/v1`). **Any email works and the code is always `123456`.** It exists only for this test.
- `flow.mjs` is the browser script (Playwright). Screenshots of each step go to `e2e/.shots/`; on a failure it prints what each person's screen showed.

`SKIP_BUILD=1 npm run test:e2e` reuses the last web build when only the database or the script changed.
