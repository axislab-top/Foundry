export function decodeJwtExpMs(accessToken: string | undefined): number | undefined {
  if (!accessToken?.trim()) return undefined;
  const parts = accessToken.split('.');
  if (parts.length < 2) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return undefined;
    return payload.exp * 1000;
  } catch {
    return undefined;
  }
}

export function computeAccessTokenExpiresAt(
  accessToken: string,
  expiresInSeconds?: number
): number | undefined {
  if (
    typeof expiresInSeconds === 'number' &&
    Number.isFinite(expiresInSeconds) &&
    expiresInSeconds > 0
  ) {
    return Date.now() + Math.floor(expiresInSeconds * 1000);
  }
  return decodeJwtExpMs(accessToken);
}
