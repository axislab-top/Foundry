import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { SupervisorReviewService } from './services/supervisor-review.service.js';
import { SupervisorReportService } from './services/supervisor-report.service.js';

class SupervisorPipelineDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsString()
  temporalWorkflowId?: string;
}

class SupervisorReportDto {
  @IsUUID()
  companyId: string;

  @IsIn(['daily', 'weekly'])
  kind!: 'daily' | 'weekly';
}

/**
 * Temporal activity：在租户上下文中执行复盘 + 记忆回灌。
 */
@Controller('internal/supervisor')
export class SupervisorInternalController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly review: SupervisorReviewService,
    private readonly reports: SupervisorReportService,
  ) {}

  private assertInternalAuth(header: string | undefined): void {
    const expected = process.env.API_INTERNAL_AUTH_SECRET?.trim();
    if (!expected) {
      throw new UnauthorizedException('internal supervisor routes disabled');
    }
    if (header !== expected) {
      throw new UnauthorizedException('invalid internal auth');
    }
  }

  @Post('run-pipeline')
  @HttpCode(HttpStatus.OK)
  async runPipeline(
    @Headers('x-internal-auth') internalAuth: string | undefined,
    @Body() body: SupervisorPipelineDto,
  ) {
    this.assertInternalAuth(internalAuth);
    return this.tenantContext.runWithCompanyId(body.companyId, () =>
      this.review.executeReviewPipeline({
        companyId: body.companyId,
        runId: body.runId,
        taskId: body.taskId ?? null,
        temporalWorkflowId: body.temporalWorkflowId ?? null,
      }),
    );
  }

  @Post('publish-report')
  @HttpCode(HttpStatus.OK)
  async publishReport(
    @Headers('x-internal-auth') internalAuth: string | undefined,
    @Body() body: SupervisorReportDto,
  ) {
    this.assertInternalAuth(internalAuth);
    return this.tenantContext.runWithCompanyId(body.companyId, () =>
      this.reports.publishDailyReport(body.companyId, body.kind),
    );
  }
}
