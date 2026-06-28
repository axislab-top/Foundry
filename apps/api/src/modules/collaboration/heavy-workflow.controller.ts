import {
  Body,
  ForbiddenException,
  Logger,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '@service/tenant';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../common/types/user.types.js';
import {
  HeavyTemporalClientService,
  type HeavyWorkflowSignalType,
} from './services/heavy-temporal-client.service.js';

class SignalRequestDto {
  signalType: HeavyWorkflowSignalType;
  approvalRequestId?: string;
  decision?: 'approve' | 'reject' | 'revise';
  reason?: string;
}

/**
 * L3 Temporal 重构 Step 8: Admin Observability Panel
 * REST endpoints for heavy workflow observability and intervention.
 */
@ApiTags('collaboration-heavy-workflows')
@ApiBearerAuth('JWT-auth')
@Controller('v1/collaboration/heavy/workflows')
export class HeavyWorkflowController {
  private readonly logger = new Logger(HeavyWorkflowController.name);

  constructor(
    private readonly temporalClient: HeavyTemporalClientService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active L3 heavy workflows' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  async list(
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() _user: UserInfo,
  ) {
    // Tenant + Auth guard is globally enforced; explicit tenant run keeps context consistent.
    const tenant = companyId?.trim() || this.tenantContext.getCompanyId?.() || '';
    if (tenant) {
      return this.tenantContext.runWithCompanyId(tenant, () =>
        this.temporalClient.listOpenWorkflows(tenant),
      );
    }
    return this.temporalClient.listOpenWorkflows(undefined);
  }

  @Get(':workflowId')
  @ApiOperation({ summary: 'Get heavy workflow detail/history' })
  async detail(
    @Param('workflowId') workflowId: string,
    @CurrentUser() _user: UserInfo,
  ) {
    const detail = await this.temporalClient.describeWorkflow(workflowId);
    await this.assertWorkflowTenantOwnership(workflowId, detail.rawDescribe as any);
    return detail;
  }

  @Post(':workflowId/signal')
  @ApiOperation({ summary: 'Send humanApproval/intervention signal to workflow' })
  async signal(
    @Param('workflowId') workflowId: string,
    @Body() body: SignalRequestDto,
    @CurrentUser() _user: UserInfo,
  ) {
    const detail = await this.temporalClient.describeWorkflow(workflowId);
    await this.assertWorkflowTenantOwnership(workflowId, detail.rawDescribe as any);
    return this.temporalClient.signalWorkflow({
      workflowId,
      signalType: body.signalType,
      payload: {
        approvalRequestId: body.approvalRequestId ?? '',
        decision: body.decision ?? 'approve',
        reason: body.reason ?? '',
      },
    });
  }

  private async assertWorkflowTenantOwnership(
    workflowId: string,
    rawDescribe: Record<string, any> | undefined,
  ): Promise<void> {
    const currentCompanyId = this.tenantContext.getCompanyId?.();
    if (!currentCompanyId) {
      throw new ForbiddenException('Missing tenant context');
    }

    const workflowCompanyId = String(
      rawDescribe?.memo?.companyId ?? rawDescribe?.searchAttributes?.companyId ?? '',
    ).trim();
    if (!workflowCompanyId || workflowCompanyId !== currentCompanyId) {
      this.logger.warn('heavy workflow tenant ownership check failed', {
        workflowId,
        currentCompanyId,
        workflowCompanyId: workflowCompanyId || null,
      });
      throw new ForbiddenException('Workflow does not belong to current tenant');
    }
  }
}

