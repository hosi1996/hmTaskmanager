// موتور چک‌های مانیتورینگ دامنه — پیاده‌سازی جاوااسکریپتی همان چک‌های ربات uptimebot + چند چک اضافه
import dns from 'node:dns/promises';
import tls from 'node:tls';
import net from 'node:net';
import { domainToASCII } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// نام → برچسب فارسی (ترتیب درج = ترتیب نمایش)
export const CHECKS = {
  dns: 'DNS',
  ns: 'Nameserver',
  mx: 'MX (ایمیل)',
  ping: 'Ping',
  http: 'HTTP',
  https: 'HTTPS',
  redirect: 'ریدایرکت HTTP به HTTPS',
  ssl: 'گواهی SSL',
  speed: 'سرعت پاسخ',
  whois: 'انقضای دامنه',
  keyword: 'وجود کلمه‌ی کلیدی در صفحه',
  port: 'پورت سفارشی',
};
// چک‌هایی که نتیجه‌شان به محل اجرا وابسته نیست (همیشه یک نتیجه‌ی واحد دارند)
export const LOCATION_FREE = new Set(['whois']);
// چک‌هایی که چک‌کننده‌ی ایران پشتیبانی نمی‌کند؛ همیشه از همین سرور اجرا می‌شوند
export const REMOTE_UNSUPPORTED = new Set(['keyword', 'port']);
export const DEFAULT_CHECKS = Object.keys(CHECKS).filter((n) => !['mx', 'keyword', 'port'].includes(n));
export const INTERVALS = [1, 2, 5, 10, 15, 30, 60];
export const RETENTIONS = [1, 3, 7, 14, 30, 90, 0]; // روز؛ 0 = هرگز پاک نشود

const TIMEOUT = 10000;
const SLOW_SECONDS = 3;
const SSL_WARN_DAYS = 14;
const DOMAIN_WARN_DAYS = 30;
const WEAK_TLS = new Set(['TLSv1', 'TLSv1.1']);
const KEYWORD_MAX_BYTES = 300000;
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+(xn--[a-z0-9-]+|[a-z]{2,63})$/;
const UA = { 'user-agent': 'hmTaskManager-Monitor/1.0' };

const errMsg = (e) => e?.message || String(e);

export const baseDomain = (domain) => {
  const p = domain.split('.');
  if (p.length >= 3 && p.at(-1).length === 2 && SECOND_LEVEL.has(p.at(-2))) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
};

/** ورودی آزاد کاربر را به دامنه‌ی نرمال‌شده تبدیل می‌کند یا null برمی‌گرداند */
export function parseDomain(text) {
  let t = String(text || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '');
  t = t.split(/[/?#:]/)[0].replace(/\.$/, '');
  if (!t) return null;
  const ascii = domainToASCII(t);
  return ascii && DOMAIN_RE.test(ascii) ? ascii : null;
}

async function checkDns(domain) {
  const ips = [];
  try {
    for (const rtype of ['A', 'AAAA']) {
      try {
        ips.push(...(await dns.resolve(domain, rtype)));
      } catch (e) {
        if (e.code !== 'ENODATA' && e.code !== 'ENOTFOUND') throw e;
      }
    }
  } catch (e) {
    return { ok: false, detail: errMsg(e) };
  }
  return ips.length ? { ok: true, detail: ips.join('، ') } : { ok: false, detail: 'رکورد A/AAAA وجود ندارد' };
}

async function checkNs(domain) {
  try {
    const names = (await dns.resolveNs(baseDomain(domain))).sort();
    return { ok: true, detail: names.join('، ') };
  } catch (e) {
    return { ok: false, detail: errMsg(e) };
  }
}

async function checkMx(domain) {
  try {
    const names = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    return { ok: true, detail: names.join('، ') };
  } catch (e) {
    return { ok: false, detail: errMsg(e) };
  }
}

async function checkPing(domain) {
  try {
    const { stdout } = await execFileP('ping', ['-c', '2', '-W', '3', domain], { timeout: 15000 });
    const m = stdout.match(/= [\d.]+\/([\d.]+)\//);
    return { ok: true, detail: m ? `${Math.round(+m[1])}ms` : 'OK' };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: null, detail: 'دستور ping روی سرور نصب نیست' };
    if (e.killed) return { ok: false, detail: 'timeout' };
    return { ok: false, detail: 'بدون پاسخ' };
  }
}

async function fetchOnce(url) {
  const start = Date.now();
  try {
    const resp = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers: UA });
    return { resp, elapsed: (Date.now() - start) / 1000, error: null };
  } catch (e) {
    return { resp: null, elapsed: (Date.now() - start) / 1000, error: errMsg(e) };
  }
}

const checkHttp = (f) => (f.error ? { ok: false, detail: f.error } : { ok: f.resp.status < 400, detail: `HTTP ${f.resp.status}` });

function checkRedirect(f, httpSelected) {
  if (f.error) return { ok: httpSelected ? false : null, detail: f.error };
  const loc = f.resp.headers.get('location') || '';
  if ([301, 302, 303, 307, 308].includes(f.resp.status) && loc.startsWith('https://')) return { ok: true, detail: String(f.resp.status) };
  return { ok: false, detail: `ریدایرکت به HTTPS ندارد (HTTP ${f.resp.status})` };
}

function checkSpeed(f, httpsSelected) {
  if (f.error) return { ok: httpsSelected ? false : null, detail: f.error };
  const ok = f.elapsed <= SLOW_SECONDS;
  return { ok, detail: `${f.elapsed.toFixed(2)}s` + (ok ? '' : ` (بیشتر از ${SLOW_SECONDS}s)`) };
}

function checkSsl(domain) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (!done) { done = true; resolve(r); }
    };
    let socket;
    try {
      socket = tls.connect({ host: domain, port: 443, servername: domain, timeout: TIMEOUT }, () => {
        const cert = socket.getPeerCertificate();
        const proto = socket.getProtocol?.() || '';
        socket.end();
        if (!cert || !cert.valid_to) return finish({ ok: false, detail: 'گواهی یافت نشد' });
        if (WEAK_TLS.has(proto)) return finish({ ok: false, detail: `نسخه‌ی قدیمی و ناامن ${proto}` });
        const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
        const suffix = proto ? ` · ${proto}` : '';
        finish(days < SSL_WARN_DAYS ? { ok: false, detail: `فقط ${days} روز تا انقضا${suffix}` } : { ok: true, detail: `${days} روز تا انقضا${suffix}` });
      });
    } catch (e) {
      return finish({ ok: false, detail: errMsg(e) });
    }
    socket.on('timeout', () => { socket.destroy(); finish({ ok: false, detail: 'timeout' }); });
    socket.on('error', (e) => finish({ ok: false, detail: errMsg(e) }));
  });
}

async function checkWhois(domain) {
  try {
    const resp = await fetch(`https://rdap.org/domain/${baseDomain(domain)}`, { signal: AbortSignal.timeout(TIMEOUT), headers: UA });
    if (!resp.ok) return { ok: null, detail: `RDAP در دسترس نیست (${resp.status})` };
    const data = await resp.json();
    const ev = (data.events || []).find((e) => e.eventAction === 'expiration');
    if (!ev?.eventDate) return { ok: null, detail: 'تاریخ انقضا در RDAP نیست' };
    const days = Math.floor((new Date(ev.eventDate).getTime() - Date.now()) / 86400000);
    return days < DOMAIN_WARN_DAYS ? { ok: false, detail: `فقط ${days} روز تا انقضای دامنه` } : { ok: true, detail: `${days} روز تا انقضا` };
  } catch (e) {
    return { ok: null, detail: errMsg(e) };
  }
}

/** بررسی می‌کند که یک متن مشخص در صفحه‌ی اصلی سایت هست یا نه (برای تشخیص خرابی/دیفیس/پیام خطا) */
async function checkKeyword(domain, keyword) {
  if (!keyword) return { ok: null, detail: 'کلمه‌ی کلیدی تنظیم نشده' };
  let lastErr = 'خطای نامشخص';
  for (const scheme of ['https', 'http']) {
    try {
      const resp = await fetch(`${scheme}://${domain}`, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT), headers: UA });
      const reader = resp.body?.getReader();
      let text = '';
      if (reader) {
        const decoder = new TextDecoder();
        let read = 0;
        while (read < KEYWORD_MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          read += value.length;
        }
        reader.cancel().catch(() => {});
      } else {
        text = await resp.text();
      }
      return text.includes(keyword)
        ? { ok: true, detail: 'کلمه‌ی کلیدی در صفحه پیدا شد' }
        : { ok: false, detail: 'کلمه‌ی کلیدی در صفحه پیدا نشد' };
    } catch (e) {
      lastErr = errMsg(e);
    }
  }
  return { ok: false, detail: lastErr };
}

/** اتصال TCP به یک پورت دلخواه (برای سرویس‌های غیر HTTP مثل دیتابیس، SSH، ایمیل و…) */
function checkPort(domain, port) {
  if (!port) return Promise.resolve({ ok: null, detail: 'پورت تنظیم نشده' });
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const socket = net.createConnection({ host: domain, port, timeout: TIMEOUT });
    socket.once('connect', () => { const ms = Date.now() - start; socket.destroy(); finish({ ok: true, detail: `پورت ${port} باز است (${ms}ms)` }); });
    socket.once('timeout', () => { socket.destroy(); finish({ ok: false, detail: 'timeout' }); });
    socket.once('error', (e) => finish({ ok: false, detail: errMsg(e) }));
  });
}

/** چک‌های محلی (روی همین سرور) را اجرا می‌کند؛ opts: {keyword?, port?} برای چک‌های اختصاصی */
export async function runChecks(domain, names, opts = {}) {
  const wanted = new Set(names);
  const httpP = wanted.has('http') || wanted.has('redirect') ? fetchOnce(`http://${domain}`) : null;
  const httpsP = wanted.has('https') || wanted.has('speed') ? fetchOnce(`https://${domain}`) : null;
  const out = {};
  await Promise.all(
    names.map(async (n) => {
      try {
        if (n === 'dns') out[n] = await checkDns(domain);
        else if (n === 'ns') out[n] = await checkNs(domain);
        else if (n === 'mx') out[n] = await checkMx(domain);
        else if (n === 'ping') out[n] = await checkPing(domain);
        else if (n === 'ssl') out[n] = await checkSsl(domain);
        else if (n === 'whois') out[n] = await checkWhois(domain);
        else if (n === 'keyword') out[n] = await checkKeyword(domain, opts.keyword);
        else if (n === 'port') out[n] = await checkPort(domain, opts.port);
        else if (n === 'http') out[n] = checkHttp(await httpP);
        else if (n === 'https') out[n] = checkHttp(await httpsP);
        else if (n === 'redirect') out[n] = checkRedirect(await httpP, wanted.has('http'));
        else if (n === 'speed') out[n] = checkSpeed(await httpsP, wanted.has('https'));
      } catch (e) {
        out[n] = { ok: null, detail: `خطای داخلی: ${errMsg(e)}` };
      }
    }),
  );
  return out;
}

/** چک‌ها را از طریق چک‌کننده‌ی مستقر در ایران (iran-checker/check.php) اجرا می‌کند */
export async function runRemote(url, token, domain, names) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-token': token },
    body: JSON.stringify({ domain, checks: names }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json())?.results || {};
  const out = {};
  for (const n of names) if (data[n]) out[n] = { ok: data[n].ok ?? null, detail: String(data[n].detail ?? '') };
  return out;
}
