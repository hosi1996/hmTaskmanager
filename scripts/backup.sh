#!/usr/bin/env bash
# بک‌آپ دیتابیس + فایل‌های آپلودی؛ نگه‌داری N روز آخر (BACKUP_KEEP_DAYS)
set -euo pipefail
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
cd "$ROOT"
envget() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//'; }

DIR="$(envget BACKUP_DIR)"; DIR="${DIR:-/var/backups/hmtm}"
KEEP="$(envget BACKUP_KEEP_DAYS)"; KEEP="${KEEP:-14}"
MODE="$(envget DB_MODE)"; PGC="$(envget PG_CONTAINER)"
DB="$(envget DB_NAME)"; USER="$(envget DB_USER)"; PASS="$(envget DB_PASS)"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"; chmod 700 "$DIR"

if [ "$MODE" = "docker" ]; then
  docker exec -e PGPASSWORD="$PASS" "$PGC" pg_dump -h 127.0.0.1 -U "$USER" -Fc "$DB" > "$DIR/db-$TS.dump"
else
  sudo -u postgres pg_dump -Fc "$DB" > "$DIR/db-$TS.dump"
fi
docker cp hmtm-backend:/data/uploads - 2>/dev/null | gzip > "$DIR/uploads-$TS.tgz" || true

find "$DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tgz' \) -mtime +"$KEEP" -delete
echo "✔ بک‌آپ ساخته شد: $DIR/db-$TS.dump"
