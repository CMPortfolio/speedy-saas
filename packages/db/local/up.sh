#!/usr/bin/env bash
# Start the local Supabase stack, wait for it, apply migrations.
set -euo pipefail
cd "$(dirname "$0")"
API_PORT="${SUPABASE_API_PORT:-54321}"
DB_PORT="${SUPABASE_DB_PORT:-54322}"
ANON=$(grep -m1 'x-anon-key' docker-compose.yml | awk '{print $3}')
SERVICE=$(grep -m1 'x-service-key' docker-compose.yml | awk '{print $3}')
docker compose up -d
echo "waiting for auth, rest and storage..."
for i in $(seq 1 60); do
  ok=1
  curl -fsS --noproxy '*' http://127.0.0.1:$API_PORT/auth/v1/health >/dev/null 2>&1 || ok=0
  curl -fsS --noproxy '*' -H "apikey: $ANON" http://127.0.0.1:$API_PORT/rest/v1/ >/dev/null 2>&1 || ok=0
  curl -fsS --noproxy '*' http://127.0.0.1:$API_PORT/storage/v1/status >/dev/null 2>&1 || ok=0
  if [ "$ok" = 1 ]; then break; fi
  sleep 2
done
[ "$ok" = 1 ] || { echo "stack did not become healthy"; docker compose ps; exit 1; }
cd ..
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:$DB_PORT/postgres pnpm db:reset
docker compose -f local/docker-compose.yml kill -s SIGUSR1 rest >/dev/null 2>&1 || true
echo
echo "Local Supabase is up:"
echo "  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$API_PORT"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON"
echo "  SUPABASE_SERVICE_ROLE_KEY=$SERVICE"
echo "  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:$DB_PORT/postgres"
