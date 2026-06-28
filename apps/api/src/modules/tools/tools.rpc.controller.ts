import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { ToolsService } from './tools.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  roles?: string[];
}

class AdminBaseDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class ListToolsDto extends AdminBaseDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

class ToolIdDto extends AdminBaseDto {
  @IsUUID()
  id: string;
}

class CreateToolDto extends AdminBaseDto {
  @IsString()
  name: string;

  @IsString()
  displayName: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  implementationType?: string;

  @IsOptional()
  @IsObject()
  handlerConfig?: Record<string, unknown> | null;

  @IsObject()
  inputSchema: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  securityProfile?: string;

  @IsOptional()
  requiredPermissions?: string[];

  @IsOptional()
  isEnabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsString()
  changeReason: string;
}

class UpdateToolDto extends ToolIdDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  implementationType?: string;

  @IsOptional()
  @IsObject()
  handlerConfig?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  securityProfile?: string;

  @IsOptional()
  requiredPermissions?: string[];

  @IsOptional()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  semverVersion?: string;

  @IsOptional()
  @IsString()
  changeReason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

@Controller()
export class ToolsRpcController {
  private readonly logger = new Logger(ToolsRpcController.name);

  constructor(private readonly service: ToolsService) {}

  @MessagePattern('admin.tools.list')
  async list(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ListToolsDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.tools.list',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.list(dto, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.tools.findOne')
  async findOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ToolIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.tools.findOne',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.findOne(dto.id, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.tools.create')
  async create(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CreateToolDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.tools.create',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.create(dto as Parameters<ToolsService['create']>[0], dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.tools.update')
  async update(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(UpdateToolDto, payload);
      const { id, actor, ...rest } = dto as any;
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.tools.update',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.update(id, rest, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.tools.remove')
  async remove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ToolIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.tools.remove',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.remove(dto.id, dto.actor).then(() => ({ ok: true as const })),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.tools.versions')
  async versions(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ToolIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.tools.versions',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.listVersions(dto.id, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private toRpcError(e: any): RpcException {
    if (e?.getStatus && e?.getResponse) {
      return new RpcException({
        status: e.getStatus(),
        response: e.getResponse(),
        message: e.message,
      });
    }
    return e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message || 'Internal error' });
  }
}

