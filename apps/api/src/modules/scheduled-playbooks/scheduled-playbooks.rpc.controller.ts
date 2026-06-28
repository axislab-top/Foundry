import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import {
  CreateScheduledPlaybookDto,
  CreateScheduledPlaybookFromAgentDto,
  QueryScheduledPlaybooksDto,
  UpdateScheduledPlaybookDto,
} from './dto/scheduled-playbook.dto.js';
import { ScheduledPlaybookRunnerService } from './services/scheduled-playbook-runner.service.js';
import { ScheduledPlaybooksService } from './services/scheduled-playbooks.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class ScheduledPlaybooksCompanyRpcDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class ScheduledPlaybooksListRpcDto extends ScheduledPlaybooksCompanyRpcDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QueryScheduledPlaybooksDto)
  query?: QueryScheduledPlaybooksDto;
}

class ScheduledPlaybooksIdRpcDto extends ScheduledPlaybooksCompanyRpcDto {
  @IsUUID()
  scheduleId: string;
}

class ScheduledPlaybooksCreateRpcDto extends ScheduledPlaybooksCompanyRpcDto {
  @ValidateNested()
  @Type(() => CreateScheduledPlaybookDto)
  data: CreateScheduledPlaybookDto;
}

class ScheduledPlaybooksCreateFromAgentRpcDto extends ScheduledPlaybooksCompanyRpcDto {
  @ValidateNested()
  @Type(() => CreateScheduledPlaybookFromAgentDto)
  data: CreateScheduledPlaybookFromAgentDto;
}

class ScheduledPlaybooksUpdateRpcDto extends ScheduledPlaybooksIdRpcDto {
  @ValidateNested()
  @Type(() => UpdateScheduledPlaybookDto)
  data: UpdateScheduledPlaybookDto;
}

@Controller()
export class ScheduledPlaybooksRpcController {
  private readonly logger = new Logger(ScheduledPlaybooksRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly schedules: ScheduledPlaybooksService,
    private readonly runner: ScheduledPlaybookRunnerService,
  ) {}

  @MessagePattern('scheduledPlaybooks.list')
  async list(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.list', payload, ScheduledPlaybooksListRpcDto, (dto) =>
      this.schedules.list(dto.companyId, dto.actor, dto.query ?? {}),
    );
  }

  @MessagePattern('scheduledPlaybooks.get')
  async get(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.get', payload, ScheduledPlaybooksIdRpcDto, (dto) =>
      this.schedules.get(dto.companyId, dto.scheduleId, dto.actor),
    );
  }

  @MessagePattern('scheduledPlaybooks.create')
  async create(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.create', payload, ScheduledPlaybooksCreateRpcDto, (dto) =>
      this.schedules.create(dto.companyId, dto.data, dto.actor),
    );
  }

  @MessagePattern('scheduledPlaybooks.createFromAgent')
  async createFromAgent(@Payload() payload: unknown) {
    return this.run(
      'scheduledPlaybooks.createFromAgent',
      payload,
      ScheduledPlaybooksCreateFromAgentRpcDto,
      (dto) => this.schedules.createFromAgent(dto.companyId, dto.data, dto.actor),
    );
  }

  @MessagePattern('scheduledPlaybooks.update')
  async update(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.update', payload, ScheduledPlaybooksUpdateRpcDto, (dto) =>
      this.schedules.update(dto.companyId, dto.scheduleId, dto.data, dto.actor),
    );
  }

  @MessagePattern('scheduledPlaybooks.updateFromAgent')
  async updateFromAgent(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.update', payload, ScheduledPlaybooksUpdateRpcDto, (dto) =>
      this.schedules.updateFromAgent(dto.companyId, dto.scheduleId, dto.data, dto.actor),
    );
  }

  @MessagePattern('scheduledPlaybooks.remove')
  async remove(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.remove', payload, ScheduledPlaybooksIdRpcDto, (dto) =>
      this.schedules.remove(dto.companyId, dto.scheduleId, dto.actor),
    );
  }

  @MessagePattern('scheduledPlaybooks.removeFromAgent')
  async removeFromAgent(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.removeFromAgent', payload, ScheduledPlaybooksIdRpcDto, (dto) =>
      this.schedules.removeFromAgent(dto.companyId, dto.scheduleId, dto.actor),
    );
  }

  @MessagePattern('scheduledPlaybooks.triggerNow')
  async triggerNow(@Payload() payload: unknown) {
    return this.run('scheduledPlaybooks.triggerNow', payload, ScheduledPlaybooksIdRpcDto, (dto) =>
      this.runner.triggerNow(dto.companyId, dto.scheduleId, dto.actor),
    );
  }

  private async run<TDto extends ScheduledPlaybooksCompanyRpcDto, TResult>(
    pattern: string,
    payload: unknown,
    dtoClass: new () => TDto,
    handler: (dto: TDto) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      const dto = validateRpcDto(dtoClass, payload);
      return await executeRpc({
        logger: this.logger,
        pattern,
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.tenantContext.runWithCompanyId(dto.companyId, () => handler(dto)),
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
