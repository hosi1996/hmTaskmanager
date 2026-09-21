#!/usr/bin/env bash
# Update hmTaskManager without data loss: backup -> git pull -> build -> migrate (automatic on backend start)
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

envget() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//'; }
BRANCH="${BRANCH:-main}"

echo ">> Backup before update"
./scripts/backup.sh || { echo "Backup failed; update aborted" >&2; exit 1; }

echo ">> Fetching new version"
git fetch --quiet origin "$BRANCH"
git checkout -q "$BRANCH"
git pull --ff-only --quiet
chmod +x install.sh update.sh scripts/*.sh

# If PostgreSQL runs in Docker, re-attach it to the project network (in case it was recreated)
docker network inspect hmtm-net >/dev/null 2>&1 || docker network create hmtm-net >/dev/null
PGC="$(envget PG_CONTAINER || true)"
[ -n "$PGC" ] && docker network connect hmtm-net "$PGC" 2>/dev/null || true

echo ">> Building and restarting"
docker compose build
docker compose up -d --remove-orphans

echo -n "  Waiting for backend "
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' hmtm-backend 2>/dev/null)" = "healthy" ] && { echo; echo "OK Update complete"; docker image prune -f >/dev/null; exit 0; }
  echo -n "."; sleep 3
done
echo; docker compose logs --tail 50 backend
echo "FAIL Backend did not start. To roll back: git checkout <previous commit> and ./scripts/restore.sh" >&2
exit 1
