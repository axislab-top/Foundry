export type TokenPayload = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
};

export function extractTokenPayload(raw: unknown): TokenPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const nested = record.tokens;
  const source =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : record;

  const accessToken = source.accessToken ?? source.access_token ?? source.token;
  const refreshToken = source.refreshToken ?? source.refresh_token;
  const expiresIn = source.expiresIn ?? source.expires_in;

  if (typeof accessToken !== "string" || !accessToken.trim()) return null;
  if (typeof refreshToken !== "string" || !refreshToken.trim()) return null;

  return {
    accessToken,
    refreshToken,
    expiresIn: typeof expiresIn === "number" ? expiresIn : undefined,
  };
}
