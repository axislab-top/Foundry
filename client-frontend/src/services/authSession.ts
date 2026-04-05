import type { AuthResult, AuthUser } from './authApi';

export interface AuthSessionState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
}

type Listener = () => void;

const empty: AuthSessionState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  expiresIn: null,
};

let state: AuthSessionState = { ...empty };
const listeners = new Set<Listener>();

export const authSession = {
  getState: (): AuthSessionState => state,

  /** Replace session (login / register / refresh). Notifies listeners. */
  setState(next: AuthSessionState): void {
    state = { ...next };
    listeners.forEach((l) => l());
  },

  /** Internal sync from storage without notify (use once at init). */
  hydrate(s: AuthSessionState): void {
    state = { ...s };
  },

  clear(): void {
    state = { ...empty };
    listeners.forEach((l) => l());
  },

  getAccessToken: (): string | null => state.accessToken,
  getRefreshToken: (): string | null => state.refreshToken,

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function toAuthState(result: AuthResult): AuthSessionState {
  return {
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  };
}
