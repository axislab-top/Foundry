const SESSION_STORAGE_KEY = 'foundry-admin-session';
const ACCESS_EXPIRES_AT_KEY = 'foundry-admin-access-expires-at';

export type SessionUser = {
  username: string;
};

export function readSessionUser(): SessionUser | null {
  const rawSession = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawSession) return null;
  try {
    const parsed = JSON.parse(rawSession) as SessionUser;
    if (parsed && typeof parsed.username === 'string' && parsed.username.length > 0) {
      return { username: parsed.username };
    }
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
  return null;
}

export function writeSessionUser(user: SessionUser): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

export function clearSessionUser(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getAccessTokenExpiresAt(): number | null {
  const raw = localStorage.getItem(ACCESS_EXPIRES_AT_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setAccessTokenExpiresAt(expiresAtMs: number | undefined): void {
  if (expiresAtMs == null || !Number.isFinite(expiresAtMs)) {
    localStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
    return;
  }
  localStorage.setItem(ACCESS_EXPIRES_AT_KEY, String(Math.floor(expiresAtMs)));
}

export function clearAccessTokenExpiresAt(): void {
  localStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
}
