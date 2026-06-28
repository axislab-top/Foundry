/**
 * Turn thrown values (including non-Error RPC / microservice payloads) into log-safe strings.
 */
export function formatUnknownError(e: unknown, maxLength = 4000): string {
  if (e === null) {
    return 'null';
  }
  if (e === undefined) {
    return 'undefined';
  }
  if (typeof e === 'string') {
    return truncate(e, maxLength);
  }
  if (typeof e === 'number' || typeof e === 'boolean' || typeof e === 'bigint') {
    return String(e);
  }
  if (typeof AggregateError !== 'undefined' && e instanceof AggregateError) {
    const parts = e.errors.map((x) => formatUnknownError(x, Math.max(200, Math.floor(maxLength / 2))));
    return truncate(parts.join(' | '), maxLength);
  }
  if (e instanceof Error) {
    const base = e.stack || e.message || e.name || 'Error';
    return truncate(base, maxLength);
  }
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === 'string' && msg.trim()) {
      return truncate(msg, maxLength);
    }
    if (typeof msg === 'object' && msg !== null) {
      try {
        return truncate(JSON.stringify(msg), maxLength);
      } catch {
        /* fall through */
      }
    }
    if (typeof o.error === 'string' && o.error.trim()) {
      return truncate(o.error, maxLength);
    }
    try {
      return truncate(JSON.stringify(o), maxLength);
    } catch {
      return truncate(Object.prototype.toString.call(e), maxLength);
    }
  }
  return truncate(String(e), maxLength);
}

export function stackFromUnknown(e: unknown): string | undefined {
  if (e instanceof Error && typeof e.stack === 'string') {
    return e.stack;
  }
  return undefined;
}

function truncate(s: string, maxLength: number): string {
  if (s.length <= maxLength) {
    return s;
  }
  return `${s.slice(0, maxLength)}…`;
}
