# Quarti

Shift scheduling and staffing for small restaurants. Montréal pilot, French and English.

The manager plans the week from the shop's usual staffing, gives shifts to people, and sends them. Each worker confirms or declines on their phone. `docs/rules.md` is the full spec; `docs/prototype.html` is the clickable prototype it came from.

## What's in here

| Folder | What it is |
| --- | --- |
| `apps/mobile` | The app (Expo, React Native, TypeScript). One app: managers and workers see different tabs. |
| `packages/rules` | Shared, tested scheduling logic: times, overlaps, who can take a shift, labels. |
| `supabase/migrations` | The database: tables, row-level security, and every write as a database function. |
| `supabase/tests` | Database tests: access, scheduling rules, invites, plan limits. |
| `e2e` | A browser run of the whole manager ↔ worker loop against the real database. |

The server is the source of truth. Every change (assign, send, accept, set inactive…) is a database function that re-checks access and the rules, so a stale screen or a modified app can't break them.

## One-time setup

You need Node 22 (`nvm use` reads `.nvmrc`) and a Supabase project.

1. **Install:** `npm install`
2. **Database:** with the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), run `supabase link --project-ref <your-project-ref>` and then `supabase db push`. Without the CLI, paste each file in `supabase/migrations/` into the SQL editor, in name order.
3. **Email sending (do this first).** Supabase only lets you edit email templates once custom SMTP is on (Authentication → Emails → SMTP Settings). For testing, Gmail works: host `smtp.gmail.com`, port 465, your Gmail as username, and a Gmail [app password](https://myaccount.google.com/apppasswords). Before the pilot, switch to your own domain with a provider such as Resend or Postmark.
4. **Sign-in by email code.** In Authentication → Emails → Templates, put `{{ .Token }}` in both **Magic link or OTP** (returning people) and **Confirm sign up** (someone's very first sign-in); without it people get a link instead of a code. Set the code length to 6 in Authentication → Sign In / Providers → Email → Email OTP length (the app accepts 6 to 10 digits).
5. **Keys:** copy `.env.example` to `apps/mobile/.env` and fill in the project URL and the **publishable** (anon) key from Project Settings → API. Never put the secret/service key in the app. `.env` files are ignored by git.

## Run it

```bash
npm run start --workspace @quarti/mobile   # then scan the QR code with Expo Go
```

The first person to sign in creates a shop and becomes its manager. From Staff, add someone; the app shows an invite code to send them. They install the app, sign in with their email and enter the code.

## Check it

```bash
npm run typecheck   # TypeScript, all packages
npm run test:rules  # shared logic
npm run test:db     # database rules (needs Postgres, see below)
npm run test:e2e    # full browser run (needs Postgres; downloads PostgREST once)
```

The database and e2e tests need a plain Postgres 15+ they can create databases in, at `DATABASE_URL` (default `postgresql://postgres@127.0.0.1:54329/postgres`). For example:

```bash
docker run -d --name quarti-pg -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
```

CI runs all four on every pull request.

## Not in this first version

Shift offers and claims, leave requests, swaps, chat, copying schedules, sharing access with a co-manager or stand-in from the app, archiving positions and periods, the staffing features (referrals, window sign, student seasons, "I want more hours", shortage warning, covering a shift yourself), the tips calculator and clock in/out. The database already has room for the access and plan pieces; the rest comes in later pull requests, following `docs/rules.md`.
