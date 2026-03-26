export const ALLOWED_RPC_PATTERNS = [
  // auth
  'auth.validate',
  // users
  'users.findAll',
  'users.findOne',
  'users.create',
  'users.update',
  'users.remove',
  // files
  'files.list',
  'files.getUrl',
  'files.getInfo',
  'files.delete',
  // oauth
  'oauth.bind',
  'oauth.accounts',
  'oauth.findOrCreate',
  // webhooks
  'webhooks.create',
  'webhooks.findAll',
  'webhooks.findOne',
  'webhooks.update',
  'webhooks.remove',
  'webhooks.history',
] as const;

export function isAllowedRpcPattern(pattern: string | undefined): boolean {
  if (!pattern) return false;
  return (ALLOWED_RPC_PATTERNS as readonly string[]).includes(pattern);
}

