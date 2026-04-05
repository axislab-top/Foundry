import { Injectable } from '@nestjs/common';
import {
  TENANT_HEADER_COMPANY_ID,
  TENANT_QUERY_COMPANY_ID,
} from '../constants/tenant.constants.js';

@Injectable()
export class TenantResolutionStrategy {
  resolve(request: any): string | undefined {
    if (!request) return undefined;

    const fromHeader = this.readHeader(request, TENANT_HEADER_COMPANY_ID);
    if (fromHeader) return fromHeader;

    const fromUser =
      request.user?.companyId ||
      request.user?.company_id ||
      request.user?.tenantId ||
      request.user?.tenant_id;
    if (typeof fromUser === 'string' && fromUser.trim()) {
      return fromUser.trim();
    }

    const fromQuery = request.query?.[TENANT_QUERY_COMPANY_ID];
    if (typeof fromQuery === 'string' && fromQuery.trim()) {
      return fromQuery.trim();
    }

    const fromSubdomain = this.readSubdomain(request);
    if (fromSubdomain) return fromSubdomain;

    return undefined;
  }

  private readHeader(request: any, headerName: string): string | undefined {
    const headers = request.headers || {};
    const value = headers[headerName] ?? headers[headerName.toLowerCase()];
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized || undefined;
  }

  private readSubdomain(request: any): string | undefined {
    const host = this.readHeader(request, 'host');
    if (!host) return undefined;

    const hostname = host.split(':')[0];
    const labels = hostname.split('.');
    if (labels.length < 3) {
      return undefined;
    }

    const subdomain = labels[0]?.trim();
    return subdomain || undefined;
  }
}
