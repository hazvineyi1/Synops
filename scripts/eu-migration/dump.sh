#!/usr/bin/env bash
# EU migration - step 1: dump the current (US) production database.
#
# Produces a compressed custom-format dump (prod.dump) that restore.sh loads
# into the new EU database. Run this from a maintenance window AFTER writes are
# frozen (MAINTENANCE_MODE=1) so the dump is a consistent point-in-time copy.
#
# This is a READ-ONLY operation against the source database. It never writes to,
# alters, or drops anything in production.
#
# Usage:
#   OLD_DATABASE_URL="postgres://...us-project..." ./scripts/eu-migration/dump.sh
#
# See EU-CUTOVER-CHECKLIST.md for the full sequence.
set -euo pipefail

: "${OLD_DATABASE_URL:?Set OLD_DATABASE_URL to the current (US) production connection string}"

OUT="${1:-prod.dump}"

echo "Dumping $(echo "$OLD_DATABASE_URL" | sed -E 's#(://[^:]+):[^@]+@#\1:****@#') -> $OUT"
pg_dump -Fc "$OLD_DATABASE_URL" -f "$OUT"
echo "Done. Wrote $OUT ($(du -h "$OUT" | cut -f1)). Keep this file private - it contains personal information."
