# hmTaskManager

تسک‌منیجر اختصاصی، سبک و راست‌چین (Fastify + Prisma + SvelteKit + PostgreSQL + Redis + ربات تلگرام).

## نصب روی سرور (تک‌خطی)
```bash
curl -fsSL https://raw.githubusercontent.com/hosi1996/hmTaskmanager/main/install.sh | sudo -E bash
```
پیش‌نیازهای موجود (Docker, PostgreSQL, Nginx) بررسی و **دوباره نصب نمی‌شوند**؛ دیتابیس/یوزر اختصاصی، کانفیگ Nginx مجزا برای `carable.hmoazzne.ir` و SSL (certbot) خودکار ساخته می‌شود.
اگر PostgreSQL روی سرور (native) فقط روی localhost گوش می‌دهد، برای ری‌استارت آن باید صریحاً `HMTM_ALLOW_PG_RESTART=yes` بدهید.

آپدیت: `/opt/hmTaskManager/update.sh` — بک‌آپ، `git pull`، build، migrate (بدون از دست رفتن داده).
بک‌آپ: روزانه با cron (`scripts/backup.sh`)؛ بازیابی: `scripts/restore.sh <db.dump> [uploads.tgz]`.

## ربات تلگرام
1. توکن را از @BotFather بگیرید و در `.env` بگذارید (`TELEGRAM_BOT_TOKEN`)، سپس `docker compose up -d`.
2. در @BotFather: `/setprivacy` → **Disable** (تا بات همه‌ی پیام‌های گروه را برای لاگ ببیند).
3. بات را به گروه اضافه کنید ← در پنل «مدیریت» گروه ظاهر می‌شود ← به پروژه وصلش کنید.
4. روی یک پیام ریپلای و `/task` بفرستید → تسک ساخته و لینکش در گروه ارسال می‌شود.
5. اتصال حساب شخصی برای اعلان خصوصی: تنظیمات ← «دریافت کد اتصال» ← `/start CODE` در چت خصوصی بات.
دستورهای دیگر: `/mytasks`، `/done <شماره>`.

## توسعه‌ی محلی
```bash
# PostgreSQL و Redis محلی، سپس:
cd backend && cp ../.env.example .env   # DATABASE_URL, REDIS_URL را تنظیم کنید
npx prisma migrate deploy && npm run seed && npm run dev
cd frontend && npm install && npm run dev   # http://localhost:5173 (پروکسی /api → 3111)
```
ساختار: `backend/src/modules/*` · `frontend/src/{routes,lib}` · `bot/` · `docs/ADR.md` · `nginx/` · `scripts/`.

## API (خلاصه)
همه‌ی مسیرها زیر `/api`، احراز هویت با کوکی `sid`، درخواست‌های تغییردهنده با هدر `x-requested-with: hm`. `GET /health` برای مانیتورینگ.
`auth` (login/logout/2FA/sessions/invite) · `projects` (+members/columns/labels/templates/workload/monitors) · `tasks` (+checklist/deps/time/bulk/views) · `comments` · `attachments` · `notifications` · `search` · `archive` · `reports` (overview/members/workload/export.csv) · `telegram/groups` · `settings` · `monitor-settings` · `users`.

## مانیتورینگ دامنه (سرویس پایداری وب‌سایت)
داخل هر پروژه، تب «مانیتورینگ» (فقط برای مدیر پروژه/مالک) امکان افزودن دامنه و چک خودکار آن را می‌دهد — دقیقاً همان چک‌های ربات uptimebot، این‌بار به‌صورت داخلی در بک‌اند (بدون بات جدا):
DNS، Nameserver، MX، Ping، HTTP، HTTPS، ریدایرکت HTTP→HTTPS، گواهی SSL، سرعت پاسخ، انقضای دامنه (RDAP).
هر دامنه بازه‌ی زمانی، چک‌های فعال، و محل چک (خارج/ایران/هر دو) مستقل دارد. اگر مشکلی پیدا شود، در پنل نوتیفیکیشن می‌رود و — در صورت وصل‌بودن پروژه به یک گروه تلگرام — همان‌جا هم گزارش می‌شود؛ وقتی مشکل رفع شود پیام «بازیابی شد» هم می‌آید.
برای چک از ایران (اختیاری): فایل [`iran-checker/check.php`](iran-checker/check.php) (عیناً از پروژه‌ی uptimebot) را روی یک هاست ایرانی آپلود کنید، مقدار `TOKEN` داخل آن را عوض کنید، و آدرس + همان توکن را در پنل «مدیریت» ← «چک‌کننده‌ی ایران» وارد کنید.
