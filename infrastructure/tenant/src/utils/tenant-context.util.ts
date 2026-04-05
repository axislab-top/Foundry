import { TENANT_HEADER_COMPANY_ID } from '../constants/tenant.constants.js';

export function resolveCompanyIdFromRequest(request: any): string | undefined {
  if (!request) return undefined;

  const fromHeader = request.headers?.[TENANT_HEADER_COMPANY_ID];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim();
  }

  const fromUser =
    request.user?.companyId ||
    request.user?.company_id ||
    request.user?.tenantId ||
    request.user?.tenant_id;
  if (typeof fromUser === 'string' && fromUser.trim()) {
    return fromUser.trim();
  }

  const fromQuery = request.query?.companyId;
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }

  return undefined;
}

export function resolveCompanyIdFromEvent(event: any): string | undefined {
  if (!event) return undefined;

  const direct = event.companyId || event.company_id;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  const nested = event.data?.companyId || event.data?.company_id;
  if (typeof nested === 'string' && nested.trim()) {
    return nested.trim();
  }

  return undefined;
}
