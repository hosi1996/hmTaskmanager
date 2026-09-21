import { goto } from '$app/navigation';

/** فراخوانی API؛ هدر x-requested-with برای محافظت CSRF الزامی است */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'x-requested-with': 'hm' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch('/api' + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  if (r.status === 401 && !path.startsWith('/auth/') && path !== '/me') {
    goto('/login');
    throw new Error('ورود لازم است');
  }
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw new Error(data?.error ?? `خطا (${r.status})`);
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
};
