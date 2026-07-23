#!/usr/bin/env bash
# EU migration - step 2: restore the dump into the new EU (Frankfurt) database.
#
# Loads prod.dump (from dump.sh) into a FRESHLY CREATED, EMPTY EU database.
# --no-owner and --no-privileges drop the source role/ACL assignments so the
# objects come up owned by the EU connection role (Supabase-managed).
#
# Only ever point NEW_EU_DATABASE_URL at the new, empty EU project. Never run
# this against the live US database.
#
# Usage:
#   NEW_EU_DATABASE_URL="postgres://...eu-project..." ./scripts/eu-migration/restore.sh [prod.dump]
#
# See EU-CUTOVER-CHECKLIST.md for the full sequence.
set -euo pipefail

: "${NEW_EU_DATABASE_URL:?Set NEW_EU_DATABASE_URL to the new (EU/Frankfurt) connection string}"

IN="${1:-prod.dump}"
[ -f "$IN" ] || { echo "Dump file not found: $IN (run dump.sh first)"; exit 1; }

echo "Restoring $IN -> $(echo "$NEW_EU_DATABASE_URL" | sed -E 's#(://[^:]+):[^@]+@#\1:****@#')"
pg_restore --no-owner --no-privileges -d "$NEW_EU_DATABASE_URL" "$IN"
echo "Done. Next: run scripts/eu-migration/verify.ts to compare row counts before cutover."
