#!/usr/bin/env bash
# نصب تک‌خطی hmTaskManager
#   curl -fsSL https://raw.githubusercontent.com/hosi1996/hmTaskmanager/main/install.sh | bash
#
# متغیرهای اختیاری:
#   DOMAIN, INSTALL_DIR, REPO_URL, BRANCH, CERTBOT_EMAIL, TELEGRAM_BOT_TOKEN,
#   HMTM_ALLOW_PG_RESTART=yes  (اجازه‌ی ری‌استارت PostgreSQL نصب‌شده روی سرور، فقط اگر لازم باشد)
set -euo pipefail

DOMAIN="${DOMAIN:-carable.hmoazzne.ir}"
INSTALL_DIR="${INSTALL_DIR:-/opt/hmTaskManager}"
REPO_URL="${REPO_URL:-https://github.com/hosi1996/hmTaskmanager.git}"
BRANCH="${BRANCH:-main}"
DB_NAME="${DB_NAME:-hmtm}"
DB_USER="${DB_USER:-hmtm}"
NET="hmtm-net"

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_off=$'\e[0m'
ok()   { echo "${c_ok}✔${c_off} $*"; }
warn() { echo "${c_warn}!${c_off} $*"; }
die()  { echo "${c_err}✘ $*${c_off}" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(id -u)" -eq 0 ] || die "با root اجرا کنید:  curl -fsSL https://raw.githubusercontent.com/hosi1996/hmTaskmanager/main/install.sh | sudo -E bash"

# ───────── ۱) بررسی پیش‌نیازها (نصب مجدد نمی‌کند) ─────────
echo "▶ بررسی پیش‌نیازها"
have curl || die "curl لازم است"
have openssl || die "openssl لازم است"

if have docker && docker info >/dev/null 2>&1; then ok "Docker: $(docker -v)"
else warn "Docker پیدا نشد؛ نصب از get.docker.com"; curl -fsSL https://get.docker.com | sh; systemctl enable --now docker; fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 (docker compose) لازم است"

if have git; then ok "git موجود است"; else apt-get update -y && apt-get install -y git; fi

if have nginx; then ok "Nginx: $(nginx -v 2>&1)"
else warn "Nginx پیدا نشد؛ نصب"; apt-get update -y && apt-get install -y nginx; systemctl enable --now nginx; fi

if have certbot; then ok "certbot موجود است"
else warn "certbot پیدا نشد؛ نصب"; apt-get update -y && apt-get install -y certbot python3-certbot-nginx; fi

# ───────── ۲) دریافت کد ─────────
echo "▶ دریافت پروژه در $INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH" && git -C "$INSTALL_DIR" checkout -q "$BRANCH" && git -C "$INSTALL_DIR" pull --ff-only --quiet
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
chmod +x install.sh update.sh scripts/*.sh
ok "کد آماده است"

# ───────── ۳) فایل .env ─────────
envget() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//'; }
envset() { # KEY VALUE
  local v="${2//\\/\\\\}"; v="${v//&/\\&}"; v="${v//|/\\|}"
  if grep -qE "^$1=" .env; then sed -i -E "s|^$1=[^#]*|$1=$v   |" .env; else echo "$1=$2" >> .env; fi
}
rand() { openssl rand -hex "${1:-16}"; }
free_port() { local p=$1; while ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p$"; do p=$((p+1)); done; echo "$p"; }

FIRST_RUN=0
if [ ! -f .env ]; then
  FIRST_RUN=1
  cp .env.example .env
  chmod 600 .env
  envset DOMAIN "$DOMAIN"
  envset DB_NAME "$DB_NAME"; envset DB_USER "$DB_USER"
  envset DB_PASS "$(rand 16)"
  envset BOT_INTERNAL_TOKEN "$(rand 24)"
  envset OWNER_PASSWORD "$(rand 6)"
  envset FRONTEND_PORT "$(free_port 3110)"
  envset BACKEND_PORT "$(free_port 3111)"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && envset TELEGRAM_BOT_TOKEN "$TELEGRAM_BOT_TOKEN"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] && [ -r /dev/tty ]; then
    read -r -p "توکن بات تلگرام (اختیاری، Enter = بعداً): " tok </dev/tty || tok=""
    [ -n "$tok" ] && envset TELEGRAM_BOT_TOKEN "$tok"
  fi
  ok ".env ساخته شد (رمزها تصادفی تولید شدند)"
else
  DOMAIN="$(envget DOMAIN)"; ok ".env موجود است؛ مقادیر قبلی حفظ می‌شود"
fi
DB_NAME="$(envget DB_NAME)"; DB_USER="$(envget DB_USER)"; DB_PASS="$(envget DB_PASS)"

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
ok "شبکه‌ی داکر $NET"

# ───────── ۴) PostgreSQL: تشخیص و ساخت دیتابیس/یوزر اختصاصی ─────────
echo "▶ تنظیم PostgreSQL"
find_pg_container() {
  docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' '$2 ~ /(^|\/)(postgres|postgis|bitnami\/postgresql|timescale)/ && $1 != "hmtm-postgres" {print $1; exit}'
}
PG_C="$(envget PG_CONTAINER)"
[ -n "$PG_C" ] && ! docker ps --format '{{.Names}}' | grep -qx "$PG_C" && PG_C=""
[ -n "$PG_C" ] || PG_C="$(find_pg_container || true)"

SQL_SETUP() { cat <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE "$DB_USER" LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE "$DB_USER" LOGIN PASSWORD '$DB_PASS';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$DB_USER"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
SQL
}

if [ -n "$PG_C" ]; then
  ok "PostgreSQL داکری پیدا شد: $PG_C"
  SU="$(docker exec "$PG_C" printenv POSTGRES_USER 2>/dev/null || true)"; SU="${SU:-postgres}"
  SQL_SETUP | docker exec -i "$PG_C" psql -v ON_ERROR_STOP=1 -q -U "$SU" -d postgres
  docker network connect "$NET" "$PG_C" 2>/dev/null || true
  envset DB_MODE docker; envset PG_CONTAINER "$PG_C"; envset DB_HOST "$PG_C"
elif id postgres >/dev/null 2>&1 && have psql && (systemctl is-active --quiet postgresql 2>/dev/null || ss -ltn 2>/dev/null | grep -q ':5432 '); then
  ok "PostgreSQL نصب‌شده روی سرور (native) پیدا شد"
  SQL_SETUP | sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d postgres
  SUBNET="$(docker network inspect "$NET" -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}')"
  GW_IP="$(ip -4 addr show docker0 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')"
  LISTEN="$(sudo -u postgres psql -tAc 'SHOW listen_addresses')"
  HBA="$(sudo -u postgres psql -tAc 'SHOW hba_file')"
  if ! grep -qE "^host\s+\"?$DB_NAME\"?\s+\"?$DB_USER\"?\s+$SUBNET" "$HBA"; then
    echo "host    $DB_NAME    $DB_USER    $SUBNET    scram-sha-256   # hmTaskManager" >> "$HBA"
    sudo -u postgres psql -qtAc 'SELECT pg_reload_conf()' >/dev/null
    ok "دسترسی $SUBNET به pg_hba.conf اضافه شد"
  fi
  case "$LISTEN" in
    *"*"*|*"$GW_IP"*) ;;
    *)
      if [ "${HMTM_ALLOW_PG_RESTART:-}" = "yes" ]; then
        sudo -u postgres psql -qc "ALTER SYSTEM SET listen_addresses = '${LISTEN},${GW_IP}'"
        systemctl restart postgresql; ok "PostgreSQL روی $GW_IP هم گوش می‌دهد (ری‌استارت شد)"
      else
        die "PostgreSQL فقط روی '$LISTEN' گوش می‌دهد و کانتینرها نمی‌توانند وصل شوند.
   ری‌استارت آن ممکن است سرویس‌های دیگر را لحظه‌ای قطع کند، پس خودکار انجام نمی‌شود.
   اگر مشکلی نیست دوباره اجرا کنید:  HMTM_ALLOW_PG_RESTART=yes bash $INSTALL_DIR/install.sh"
      fi ;;
  esac
  envset DB_MODE native; envset PG_CONTAINER ""; envset DB_HOST host.docker.internal
else
  warn "PostgreSQL پیدا نشد؛ یک کانتینر اختصاصی (hmtm-postgres) ساخته می‌شود"
  docker volume inspect hmtm_pgdata >/dev/null 2>&1 || docker volume create hmtm_pgdata >/dev/null
  docker ps -a --format '{{.Names}}' | grep -qx hmtm-postgres || docker run -d --name hmtm-postgres --restart unless-stopped --network "$NET" \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$(rand 16)" -v hmtm_pgdata:/var/lib/postgresql/data postgres:16-alpine >/dev/null
  docker start hmtm-postgres >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do docker exec hmtm-postgres pg_isready -q -U postgres && break; sleep 1; done
  SQL_SETUP | docker exec -i hmtm-postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres
  envset DB_MODE docker; envset PG_CONTAINER hmtm-postgres; envset DB_HOST hmtm-postgres
fi
ok "دیتابیس «$DB_NAME» و یوزر «$DB_USER» آماده است"

# ───────── ۵) دامنه/SSL-mode در .env ─────────
envset APP_URL "https://$DOMAIN"; envset COOKIE_SECURE true

# ───────── ۶) build و اجرا (migrate + seed داخل entrypoint بک‌اند) ─────────
echo "▶ ساخت و اجرای سرویس‌ها (ممکن است چند دقیقه طول بکشد)"
docker compose build
docker compose up -d
echo -n "  منتظر آماده‌شدن بک‌اند "
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' hmtm-backend 2>/dev/null)" = "healthy" ] && break
  echo -n "."; sleep 3
done; echo
[ "$(docker inspect -f '{{.State.Health.Status}}' hmtm-backend)" = "healthy" ] || { docker compose logs --tail 40 backend; die "بک‌اند بالا نیامد"; }
ok "سرویس‌ها بالا هستند"

# ───────── ۷) Nginx (فقط یک فایل جدید؛ بقیه‌ی کانفیگ‌ها دست‌نخورده) ─────────
echo "▶ کانفیگ Nginx برای $DOMAIN"
FP="$(envget FRONTEND_PORT)"; BP="$(envget BACKEND_PORT)"
if [ -d /etc/nginx/sites-available ]; then
  CONF="/etc/nginx/sites-available/$DOMAIN.conf"; LINK="/etc/nginx/sites-enabled/$DOMAIN.conf"
else
  CONF="/etc/nginx/conf.d/$DOMAIN.conf"; LINK=""
fi
if [ -f "$CONF" ] && grep -q "ssl_certificate" "$CONF"; then
  ok "کانفیگ با SSL از قبل موجود است؛ دست‌نخورده ماند"
else
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__FRONTEND_PORT__/$FP/g" -e "s/__BACKEND_PORT__/$BP/g" nginx/carable.hmoazzne.ir.conf > "$CONF"
  [ -n "$LINK" ] && ln -sf "$CONF" "$LINK"
  if nginx -t 2>/dev/null; then systemctl reload nginx
  else rm -f "$CONF" "$LINK"; nginx -t; die "تست Nginx ناموفق بود؛ فایل ما حذف شد و به کانفیگ‌های دیگر دست نخورده"; fi
  ok "Nginx بارگذاری شد"

  EMAIL="${CERTBOT_EMAIL:-admin@${DOMAIN#*.}}"
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then ok "گواهی SSL دریافت شد"
  else
    warn "دریافت SSL ناموفق بود (DNS دامنه باید به IP این سرور اشاره کند). فعلاً روی HTTP کار می‌کند."
    envset APP_URL "http://$DOMAIN"; envset COOKIE_SECURE false
    docker compose up -d backend bot
    warn "بعد از اصلاح DNS اجرا کنید: certbot --nginx -d $DOMAIN  و سپس در .env مقدار APP_URL/COOKIE_SECURE را https/true کنید"
  fi
fi

# ───────── ۸) بک‌آپ روزانه ─────────
cat > /etc/cron.d/hmtm-backup <<CRON
30 3 * * * root $INSTALL_DIR/scripts/backup.sh >> /var/log/hmtm-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/hmtm-backup
ok "بک‌آپ روزانه ساعت ۰۳:۳۰ زمان‌بندی شد"

echo
echo "════════════════════════════════════════════"
echo " نصب کامل شد:  $(envget APP_URL)"
if [ "$FIRST_RUN" = 1 ]; then
  echo " ورود مالک →  کاربر: $(envget OWNER_USERNAME)   رمز: $(envget OWNER_PASSWORD)"
  echo " (رمز را بعد از اولین ورود از «تنظیمات» عوض کنید)"
fi
[ -z "$(envget TELEGRAM_BOT_TOKEN)" ] && echo " بات تلگرام: TELEGRAM_BOT_TOKEN را در $INSTALL_DIR/.env بگذارید و  docker compose up -d  بزنید"
echo " آپدیت: $INSTALL_DIR/update.sh    بک‌آپ: $INSTALL_DIR/scripts/backup.sh"
echo "════════════════════════════════════════════"
