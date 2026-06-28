import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import {
  IS_PUBLIC_METADATA_KEY,
  TENANT_CLS_COMPANY_ID,
  TENANT_REQUIRED_METADATA_KEY,
} from '../constants/tenant.constants.js';
import { TenantResolutionStrategy } from '../strategies/tenant-resolution.strategy.js';
import { TenantService } from '../services/tenant.service.js';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private readonly cls: ClsService,
    private readonly tenantService: TenantService,
    private readonly reflector: Reflector,
    private readonly resolutionStrategy: TenantResolutionStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const contextType = context.getType<'http' | 'rpc' | 'ws'>();
    if (contextType === 'rpc') {
      return this.handleRpcContext(context);
    }
    if (contextType !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isTenantRequired = this.reflector.getAllAndOverride<boolean>(
      TENANT_REQUIRED_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const strictByDefault = process.env.TENANT_REQUIRED_BY_DEFAULT !== 'false';
    const enforceRequired = isTenantRequired ?? strictByDefault;
    const request = context.switchToHttp().getRequest();
    const companyId = this.resolutionStrategy.resolve(request);
    const user = request.user;

    if (this.isCompanySetupRecommendationRequest(request)) {
      // Setup recommendation is account-level onboarding assistance.
      // It can run without strict company membership check.
      if (!user?.id) {
        throw new UnauthorizedException('User context is required for setup recommendation');
      }
      if (companyId) {
        request.companyId = companyId;
      }
      return true;
    }

    if (!companyId) {
      if (this.isCompanyBootstrapCreateRequest(request)) {
        if (!user?.id) {
          throw new UnauthorizedException(
            'User context is required for company creation',
          );
        }
        return true;
      }

      if (enforceRequired) {
        throw new BadRequestException('Company ID is required');
      }
      return true;
    }

    if (!user?.id) {
      throw new UnauthorizedException('User context is required for tenant access');
    }

    const hasAccess = await this.tenantService.userBelongsToCompany(
      user.id,
      companyId,
    );
    if (!hasAccess) {
      throw new UnauthorizedException(
        'You do not have access to this company',
      );
    }

    this.cls.set(TENANT_CLS_COMPANY_ID, companyId);
    request.companyId = companyId;
    return true;
  }

  private async handleRpcContext(context: ExecutionContext): Promise<boolean> {
    const data = context.switchToRpc().getData() as
      | { actor?: { id?: string }; companyId?: string }
      | undefined;
    const companyId =
      typeof data?.companyId === 'string' ? data.companyId.trim() : '';
    const actorId =
      typeof data?.actor?.id === 'string' ? data.actor.id.trim() : '';

    if (!companyId) {
      throw new BadRequestException('Company ID is required');
    }
    if (!actorId) {
      throw new UnauthorizedException('User context is required for tenant access');
    }

    const hasAccess = await this.tenantService.userBelongsToCompany(
      actorId,
      companyId,
    );
    if (!hasAccess) {
      this.logger.warn('RPC tenant access denied', { actorId, companyId });
      throw new UnauthorizedException('You do not have access to this company');
    }

    this.cls.set(TENANT_CLS_COMPANY_ID, companyId);
    return true;
  }

  private isCompanyBootstrapCreateRequest(request: any): boolean {
    const method = String(request?.method || '').toUpperCase();
    const path = String(request?.path || request?.url || '');
    if (method !== 'POST') {
      return false;
    }

    // API 内部常见路径：/v1/companies；在某些测试/本地场景可能是 /companies
    return (
      path === '/v1/companies' ||
      path.endsWith('/v1/companies') ||
      path === '/companies' ||
      path.endsWith('/companies')
    );
  }

  private isCompanySetupRecommendationRequest(request: any): boolean {
    const method = String(request?.method || '').toUpperCase();
    const path = String(request?.path || request?.url || '');
    if (method !== 'POST') return false;
    const wizardPaths = [
      '/v1/companies/setup-recommendation',
      '/companies/setup-recommendation',
      '/v1/companies/wizard/template-recommendations',
      '/companies/wizard/template-recommendations',
      '/v1/companies/wizard/patch-organization-draft',
      '/companies/wizard/patch-organization-draft',
    ];
    return wizardPaths.some((p) => path === p || path.endsWith(p));
  }
}
