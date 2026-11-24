#!/usr/bin/env bash
# Applies the migration (twice, to check it can re-run) to a scratch database on a local Postgres and runs the access tests.
# Usage: PGHOST=/tmp/pgsock PGPORT=5433 tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGUSER=${PGUSER:-postgres}
dropdb --if-exists uridul_test >/dev/null
createdb uridul_test
P="psql -X -q -v ON_ERROR_STOP=1 -d uridul_test"
$P -f tests/sql/stubs.sql
# the two Supabase extensions are replaced by the stubs above
mig() { sed -e '/^create extension if not exists pg_net/d' -e '/^create extension if not exists pg_cron/d' supabase/migrations/*.sql; }
mig | $P
mig | $P
$P -f tests/sql/access.sql
echo "SQL tests passed"
