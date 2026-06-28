import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { McpToolsService } from './mcp-tools.service.js';

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

class ListMcpToolsDto extends AdminBaseDto {
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

class McpToolIdDto extends AdminBaseDto {
  @IsUUID()
  id: string;
}

class CreateMcpToolDto extends AdminBaseDto {
  @IsString()
  name: string;

  @IsString()
  displayName: string;

  @IsString()
  description: string;

  @IsObject()
  inputSchema: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown> | null;

  @IsString()
  securityProfile: string;

  @IsOptional()
  requiredPermissions?: string[];

  @IsOptional()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  serverRef?: string | null;

  @IsOptional()
  @IsString()
  transport?: string | null;

  @IsOptional()
  @IsString()
  scope?: string | null;

  @IsOptional()
  @IsString()
  endpointUrl?: string | null;

  @IsString()
  changeReason: string;
}

class UpdateMcpToolDto extends McpToolIdDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

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
  serverRef?: string | null;

  @IsOptional()
  @IsString()
  transport?: string | null;

  @IsOptional()
  @IsString()
  scope?: string | null;

  @IsOptional()
  @IsString()
  endpointUrl?: string | null;

  @IsOptional()
  @IsString()
  changeReason?: string;
}

@Controller()
export class McpToolsRpcController {
  private readonly logger = new Logger(McpToolsRpcController.name);

  constructor(private readonly service: McpToolsService) {}

  @MessagePattern('admin.mcpTools.list')
  async list(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ListMcpToolsDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.mcpTools.list',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.list(dto, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.mcpTools.findOne')
  async findOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(McpToolIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.mcpTools.findOne',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.findOne(dto.id, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.mcpTools.create')
  async create(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CreateMcpToolDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.mcpTools.create',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.create(dto as any, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.mcpTools.update')
  async update(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(UpdateMcpToolDto, payload);
      const { id, actor, ...rest } = dto as any;
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.mcpTools.update',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.update(id, rest, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.mcpTools.remove')
  async remove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(McpToolIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.mcpTools.remove',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.remove(dto.id, dto.actor).then(() => ({ ok: true as const })),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.mcpTools.versions')
  async versions(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(McpToolIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.mcpTools.versions',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.listVersions(dto.id, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.mcpTools.testConnection')
  async testConnection(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(McpToolIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.mcpTools.testConnection',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.testConnection(dto.id, dto.actor),
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

