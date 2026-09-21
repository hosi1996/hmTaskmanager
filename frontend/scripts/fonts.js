// فونت وزیرمتن را از پکیج npm داخل static کپی می‌کند (self-hosted؛ بدون CDN)
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';

const src = 'node_modules/vazirmatn/fonts/webfonts';
mkdirSync('static/fonts', { recursive: true });
if (existsSync(src)) {
  const f = readdirSync(src).find((n) => n.endsWith('.woff2') && n.includes('wght'));
  if (f) copyFileSync(`${src}/${f}`, 'static/fonts/Vazirmatn.woff2');
  else console.warn('Vazirmatn variable woff2 not found in', src);
}
