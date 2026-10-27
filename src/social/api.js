import { apiOrigin } from './config.js';

// One call to the server: JSON in and out, cookies always. Never throws; a failed fetch is
// { ok: false, status: 0, code: 'NETWORK' }. A reply that isn't JSON has data: null.
export async function api(path, { method = 'GET', body, headers } = {}) {
  try {
    const res = await fetch(apiOrigin() + path, {
      method,
      credentials: 'include',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, code: data?.code ?? null };
  } catch {
    return { ok: false, status: 0, data: null, code: 'NETWORK' };
  }
}
