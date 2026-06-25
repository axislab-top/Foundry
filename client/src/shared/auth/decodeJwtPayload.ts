export type DecodedJwtPayload = {
  sub?: string;
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
  authType?: string;
  iat?: number;
  exp?: number;
};

export function decodeJwtPayload(accessToken: string | undefined): DecodedJwtPayload | null {
  if (!accessToken?.trim()) return null;
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const binary = atob(b64 + pad);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);
    const payload = JSON.parse(json) as DecodedJwtPayload;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}
