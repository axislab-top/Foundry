export interface ActorLike {
  id?: string;
  roles?: string[];
  permissions?: string[];
}

export interface AuthorizationOptions {
  anyRoles?: string[];
  anyPermissions?: string[];
}

export function isAuthorized(
  actor: ActorLike | undefined,
  options: AuthorizationOptions,
): boolean {
  if (!actor?.id) return false;

  const roleOk =
    !options.anyRoles?.length ||
    options.anyRoles.some((role) => actor.roles?.includes(role));

  const permissionOk =
    !options.anyPermissions?.length ||
    options.anyPermissions.some((p) => actor.permissions?.includes(p));

  // 双通道：任一通道满足即可
  return roleOk || permissionOk;
}

