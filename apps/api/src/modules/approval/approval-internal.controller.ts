import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { ApprovalService } from './services/approval.service.js';

class ExpireBodyDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  approvalId: string;
}

/**
 * 内网：Temporal activity 触发 pending 超时失效。
 */
@Controller('internal/approval')
export class ApprovalInternalController {
  constructor(
    private readonly approval: ApprovalService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private assertInternalAuth(header: string | undefined): void {
    const expected = process.env.API_INTERNAL_AUTH_SECRET?.trim();
    if (!expected) {
      throw new UnauthorizedException('internal approval routes disabled');
    }
    if (header !== expected) {
      throw new UnauthorizedException('invalid internal auth');
    }
  }

  @Post('expire')
  @HttpCode(HttpStatus.OK)
  async expire(
    @Headers('x-internal-auth') internalAuth: string | undefined,
    @Body() body: ExpireBodyDto,
  ) {
    this.assertInternalAuth(internalAuth);
    const changed = await this.tenantContext.runWithCompanyId(body.companyId, () =>
      this.approval.expireIfStillPending(body.companyId, body.approvalId),
    );
    return { ok: true, changed };
  }
}
