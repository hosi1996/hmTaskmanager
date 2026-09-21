#!/usr/bin/env bash
# آپدیت hmTaskManager بدون از دست رفتن داده: بک‌آپ ← git pull ← build ← migrate (خودکار در استارت بک‌اند)
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

envget() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//'; }
BRANCH="${BRANCH:-main}"

echo "▶ بک‌آپ قبل از آپدیت"
./scripts/backup.sh || { echo "بک‌آپ ناموفق بود؛ آپدیت متوقف شد" >&2; exit 1; }

echo "▶ دریافت نسخه‌ی جدید"
git fetch --quiet origin "$BRANCH"
git checkout -q "$BRANCH"
git pull --ff-only --quiet
chmod +x install.sh update.sh scripts/*.sh

# اگر پستگرس داکری است، اتصالش به شبکه‌ی پروژه را (در صورت ری‌کریت‌شدن) دوباره برقرار کن
docker network inspect hmtm-net >/dev/null 2>&1 || docker network create hmtm-net >/dev/null
PGC="$(envget PG_CONTAINER || true)"
[ -n "$PGC" ] && docker network connect hmtm-net "$PGC" 2>/dev/null || true

echo "▶ build و راه‌اندازی مجدد"
docker compose build
docker compose up -d --remove-orphans

echo -n "  منتظر بک‌اند "
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' hmtm-backend 2>/dev/null)" = "healthy" ] && { echo; echo "✔ آپدیت کامل شد"; docker image prune -f >/dev/null; exit 0; }
  echo -n "."; sleep 3
done
echo; docker compose logs --tail 50 backend
echo "✘ بک‌اند بالا نیامد. برای بازگشت: git checkout <commit قبلی> و ./scripts/restore.sh" >&2
exit 1
