#!/usr/bin/env bash
# Tests the Neon schema against a local Postgres (RLS, last-write-wins, grants).
# Usage: neon/test/run.sh   (needs psql + a local server; PGUSER/PGHOST env vars are respected)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="pettagam_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f neon/test/neon-stub.sql
for f in neon/migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f neon/test/schema.test.sql
