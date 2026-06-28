import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { SkillsManagementService } from './services/skills-management.service.js';

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

class SkillIdDto extends AdminBaseDto {
  @IsUUID()
  id: string;
}

class ListSkillsDto extends AdminBaseDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  companyScope?: 'platform' | 'company' | 'all';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'all';
}

class CreateSkillDto extends AdminBaseDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  skillMd?: string;

  @IsOptional()
  @IsString()
  promptTemplate?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown> | null;

  @IsString()
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';

  @IsOptional()
  requiredPermissions?: string[];

  @IsString()
  changeReason: string;

  @IsOptional()
  @Type(() => Number)
  maxInputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  maxOutputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  maxInputSizeBytes?: number | null;

  @IsOptional()
  @Type(() => Number)
  timeoutSeconds?: number | null;

  @IsOptional()
  @IsString()
  chunkStrategy?: 'none' | 'fixed' | 'semantic' | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category?: string[] | null;

  @IsOptional()
  @IsString()
  icon?: string | null;
}

class ParseSkillMdRpcDto extends AdminBaseDto {
  @IsString()
  skillMd: string;
}

class UpdateSkillDto extends SkillIdDto {
  @IsOptional()
  @IsString()
  skillMd?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  promptTemplate?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  securityProfile?: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';

  @IsOptional()
  requiredPermissions?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  changeReason?: string;

  @IsOptional()
  @Type(() => Number)
  maxInputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  maxOutputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  maxInputSizeBytes?: number | null;

  @IsOptional()
  @Type(() => Number)
  timeoutSeconds?: number | null;

  @IsOptional()
  @IsString()
  chunkStrategy?: 'none' | 'fixed' | 'semantic' | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category?: string[] | null;

  @IsOptional()
  @IsString()
  icon?: string | null;
}

class ToolBindingItemDto {
  @IsUUID()
  toolId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOverridden?: boolean;

  @IsOptional()
  @IsObject()
  configOverride?: Record<string, unknown> | null;
}

class McpToolBindingItemDto {
  @IsUUID()
  mcpToolId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOverridden?: boolean;

  @IsOptional()
  @IsObject()
  configOverride?: Record<string, unknown> | null;
}

class ReplaceToolBindingsDto extends SkillIdDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolBindingItemDto)
  bindings: ToolBindingItemDto[];

  @IsString()
  changeReason: string;
}

class ReplaceMcpToolBindingsDto extends SkillIdDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => McpToolBindingItemDto)
  bindings: McpToolBindingItemDto[];

  @IsString()
  changeReason: string;
}

@Controller()
export class AdminSkillsRpcController {
  private readonly logger = new Logger(AdminSkillsRpcController.name);

  constructor(private readonly service: SkillsManagementService) {}

  @MessagePattern('admin.skills.list')
  async list(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ListSkillsDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.list',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.list(dto as any, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.findOne')
  async findOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SkillIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.findOne',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.getAdminDetail(dto.id, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.create')
  async create(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CreateSkillDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.create',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.create(dto as any, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.update')
  async update(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(UpdateSkillDto, payload);
      const { id, actor, ...rest } = dto as any;
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.update',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.update(id, rest, actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.remove')
  async remove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SkillIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.remove',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.remove(dto.id, dto.actor).then(() => ({ ok: true as const })),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.versions')
  async versions(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(SkillIdDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.versions',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.service.listVersions(dto.id, dto.actor),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.replaceToolBindings')
  async replaceToolBindings(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ReplaceToolBindingsDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.replaceToolBindings',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: async () => {
          // Use the same changeReason approval guard used by update/bind endpoints.
          await this.service.bindTools(
            dto.id,
            { toolIds: dto.bindings.map((b) => b.toolId), bindings: dto.bindings, changeReason: dto.changeReason } as any,
            dto.actor,
          );
          // Return fresh detail for UI convenience.
          return await this.service.getAdminDetail(dto.id, dto.actor);
        },
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.parseMd')
  async parseMd(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ParseSkillMdRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.parseMd',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: async () => this.service.parseSkillMdDocument(dto.skillMd),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('admin.skills.replaceMcpToolBindings')
  async replaceMcpToolBindings(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ReplaceMcpToolBindingsDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'admin.skills.replaceMcpToolBindings',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: async () => {
          await this.service.bindMcpTools(
            dto.id,
            { mcpToolIds: dto.bindings.map((b) => b.mcpToolId), bindings: dto.bindings, changeReason: dto.changeReason } as any,
            dto.actor,
          );
          return await this.service.getAdminDetail(dto.id, dto.actor);
        },
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

