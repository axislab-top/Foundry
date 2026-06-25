/**
 * Dev: leave VITE_API_BASE_URL unset so requests use same-origin `/api/*`
 * (proxied by Vite to the gateway). LAN clients then work without per-IP env.
 * Prod / preview: set VITE_API_BASE_URL to the gateway origin.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
