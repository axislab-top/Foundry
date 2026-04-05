import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ExecutionTokenGuard } from '../approval/execution-token.guard.js';
import { RequireExecutionToken } from '../approval/require-execution-token.decorator.js';
import { WorkerInternalAuthGuard } from './worker-internal-auth.guard.js';

/**
 * 内网示例：先 X-Internal-Auth，再消费 execution token（Guard 顺序：内网 → token）。
 */
class GatedDemoDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  executionToken: string;

  /** 可选覆盖默认 action，须与审批签发时 action 一致 */
  @IsOptional()
  @IsString()
  action?: string;
}

@Controller('internal/gated')
export class InternalGatedDemoController {
  @Post('demo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WorkerInternalAuthGuard, ExecutionTokenGuard)
  @RequireExecutionToken({ action: 'internal:gated:demo' })
  async demo(@Body() _body: GatedDemoDto) {
    return { ok: true, action: 'internal:gated:demo' };
  }
}
