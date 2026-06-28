/**
 * Shared HTTP helpers for Gateway E2E scripts (wizard, main-room probe, journeys).
 */

export function unwrap(data) {
  if (data && typeof data === 'object' && data.success === true && 'data' in data) {
    return data.data;
  }
  return data;
}

export function randStr(len = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function postJson(url, body, headers = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { raw: text };
  }
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} POST ${url} -> ${JSON.stringify(j).slice(0, 800)}`);
  }
  return j;
}

export async function getJson(url, headers = {}) {
  const r = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', ...headers } });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { raw: text };
  }
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} GET ${url} -> ${JSON.stringify(j).slice(0, 800)}`);
  }
  return j;
}

export async function patchJson(url, body, headers = {}) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { raw: text };
  }
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} PATCH ${url} -> ${JSON.stringify(j).slice(0, 800)}`);
  }
  return j;
}

/**
 * Poll `fn` until it returns a truthy value or `timeoutMs` elapses.
 * @template T
 * @param {() => Promise<T | null | undefined | false>} fn
 * @param {{ timeoutMs?: number; intervalMs?: number; label?: string }} [opts]
 * @returns {Promise<NonNullable<T>>}
 */
export async function until(fn, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 2000;
  const label = opts.label ?? 'until';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return /** @type {NonNullable<T>} */ (v);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`${label}: timeout after ${timeoutMs}ms`);
}
