import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { TemporalHeartbeatIngressService } from './temporal-heartbeat-ingress.service.js';

class CompanyHeartbeatDto {
  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsUUID()
  runId?: string;

  @IsOptional()
  @IsString()
  temporalWorkflowId?: string;

  @IsOptional()
  @IsString()
  temporalRunId?: string;
}

/**
 * 内网/编排专用：Temporal Worker 经此触发与 Nest 定时器等价的心跳流水线。
 */
@Controller('internal/temporal')
export class InternalTemporalController {
  constructor(private readonly ingress: TemporalHeartbeatIngressService) {}

  @Post('company-heartbeat')
  @HttpCode(HttpStatus.OK)
  async companyHeartbeat(
    @Headers('x-internal-auth') internalAuth: string | undefined,
    @Body() body: CompanyHeartbeatDto,
  ) {
    this.ingress.assertInternalAuth(internalAuth);
    return this.ingress.execute(body);
  }
}
