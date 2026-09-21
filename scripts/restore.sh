#!/usr/bin/env bash
# Restore with one command:
#   ./scripts/restore.sh /var/backups/hmtm/db-20260921-033000.dump [/var/backups/hmtm/uploads-20260921-033000.tgz]
# WARNING: current database contents are replaced by the backup.
set -euo pipefail
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
cd "$ROOT"
DUMP="${1:?Provide path to db-*.dump file}"; UPL="${2:-}"
[ -f "$DUMP" ] || { echo "File not found: $DUMP" >&2; exit 1; }
envget() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//'; }
MODE="$(envget DB_MODE)"; PGC="$(envget PG_CONTAINER)"; DB="$(envget DB_NAME)"; USER="$(envget DB_USER)"; PASS="$(envget DB_PASS)"

read -r -p "Replace database $DB with this backup? (yes/no) " a </dev/tty
[ "$a" = "yes" ] || exit 1

docker compose stop backend bot frontend
if [ "$MODE" = "docker" ]; then
  docker exec -i -e PGPASSWORD="$PASS" "$PGC" pg_restore -h 127.0.0.1 -U "$USER" -d "$DB" --clean --if-exists --no-owner < "$DUMP"
else
  sudo -u postgres pg_restore -d "$DB" --clean --if-exists --no-owner < "$DUMP"
fi
if [ -n "$UPL" ]; then
  docker compose up -d --no-start backend
  docker run --rm -v hmtm_uploads:/data -v "$(dirname "$(readlink -f "$UPL")")":/in:ro alpine sh -c "rm -rf /data/* && tar xzf /in/$(basename "$UPL") -C /data --strip-components=1 && chown -R 1000:1000 /data"
fi
docker compose up -d
echo "OK Restore complete"
