import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import { DailyBriefService } from './services/daily-brief.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString()
  username?: string;
}

class DailyBriefRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

@Controller()
export class DailyBriefRpcController {
  private readonly logger = new Logger(DailyBriefRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly dailyBrief: DailyBriefService,
  ) {}

  @MessagePattern('dailyBrief.getForUser')
  async getForUser(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(DailyBriefRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'dailyBrief.getForUser',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.tenantContext.runWithCompanyId(dto.companyId, () =>
            this.dailyBrief.getForUser(dto.actor),
          ),
      });
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  private toRpcError(e: unknown): RpcException {
    if (e instanceof RpcException) return e;
    const err = e as { status?: number; response?: { statusCode?: number; message?: string } };
    const status = err?.status ?? err?.response?.statusCode ?? 500;
    const message =
      typeof err?.response?.message === 'string'
        ? err.response.message
        : e instanceof Error
          ? e.message
          : 'Internal error';
    return new RpcException({ status, message });
  }
}
