#!/usr/bin/env bash
# End-to-end run: real migrations in Postgres, PostgREST in front (like Supabase), the web build of the app, a browser.
# Needs Postgres reachable at $DATABASE_URL (default postgresql://postgres@127.0.0.1:54329/postgres). See e2e/README.md.
set -euo pipefail
cd "$(dirname "$0")"
PGRST_VERSION=12.2.3
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres@127.0.0.1:54329/postgres}"

if [ ! -x .bin/postgrest ]; then
  mkdir -p .bin
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/v${PGRST_VERSION}/postgrest-v${PGRST_VERSION}-linux-static-x64.tar.xz" | tar xJ -C .bin
fi

if [ "${SKIP_BUILD:-}" != 1 ]; then
  echo "building the web app…"
  (cd ../apps/mobile && EXPO_NO_TELEMETRY=1 CI=1 EXPO_PUBLIC_SUPABASE_URL=http://localhost:8098 EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_e2e \
    npx expo export -p web --output-dir ../../e2e/.web > ../../e2e/.build.log 2>&1) || { tail -40 .build.log; exit 1; }
fi

node setup-db.mjs
DB="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.username="authenticator";u.password="e2e";u.pathname="/quarti_e2e";console.log(u.toString())')"
PGRST_DB_URI="$DB" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1 \
  PGRST_JWT_SECRET=quarti-e2e-only-secret-not-used-anywhere-else \
  .bin/postgrest > .postgrest.log 2>&1 &
PGRST_PID=$!
node gateway.mjs > .gateway.log 2>&1 &
GW_PID=$!
trap 'kill $PGRST_PID $GW_PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -sf http://localhost:8098/rest/v1/ > /dev/null 2>&1 && break; sleep 0.5; done

node flow.mjs
