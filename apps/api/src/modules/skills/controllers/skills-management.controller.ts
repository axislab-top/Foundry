import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  SetMetadata,
} from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { validateRpcDto } from '../../../common/rpc/rpc-validation.js';
import type { UserInfo } from '../../../common/types/user.types.js';
import { TENANT_REQUIRED_METADATA_KEY } from '@service/tenant';
import {
  BindToolsDto,
  BindMcpToolsDto,
  CreateSkillManagementDto,
  QuerySkillManagementDto,
  UpdateSkillManagementDto,
} from '../dto/skills-management.dto.js';
import { SkillsManagementService } from '../services/skills-management.service.js';

class RuntimeResolveSkillsDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyEnabled?: boolean;
}

@Controller('v1/skills')
@SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
export class SkillsManagementController {
  constructor(private readonly service: SkillsManagementService) {}

  private actor(req: Request): UserInfo | undefined {
    return (req as Request & { user?: UserInfo }).user;
  }

  @Post()
  @Roles('superadmin', 'admin')
  create(@Body() dto: CreateSkillManagementDto, @Req() req: Request) {
    return this.service.create(dto, this.actor(req));
  }

  @Put(':id')
  @Roles('superadmin', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateSkillManagementDto, @Req() req: Request) {
    return this.service.update(id, dto, this.actor(req));
  }

  @Get()
  @Roles('superadmin', 'admin')
  list(@Query() query: QuerySkillManagementDto, @Req() req: Request) {
    return this.service.list(query, this.actor(req));
  }

  @Delete(':id')
  @Roles('superadmin', 'admin')
  async remove(@Param('id') id: string, @Req() req: Request) {
    await this.service.remove(id, this.actor(req));
    return { ok: true };
  }

  @Get(':id/versions')
  @Roles('superadmin', 'admin')
  versions(@Param('id') id: string, @Req() req: Request) {
    return this.service.listVersions(id, this.actor(req));
  }

  @Post(':id/bind-mcp-tools')
  @Roles('superadmin', 'admin')
  bindMcpTools(@Param('id') id: string, @Body() dto: BindMcpToolsDto, @Req() req: Request) {
    return this.service.bindMcpTools(id, dto, this.actor(req));
  }

  @Post(':id/bind-tools')
  @Roles('superadmin', 'admin')
  bindTools(@Param('id') id: string, @Body() dto: BindToolsDto, @Req() req: Request) {
    return this.service.bindTools(id, dto, this.actor(req));
  }

  @Post(':id/test-mcp-connection')
  @Roles('superadmin', 'admin')
  testMcpConnection(@Param('id') id: string, @Req() req: Request) {
    return this.service.testMcpConnection(id, this.actor(req));
  }

  @MessagePattern('skills.resolveRuntime')
  async resolveRuntime(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(RuntimeResolveSkillsDto, payload);
      return await this.service.resolveSkillsForRuntime({
        companyId: dto.companyId,
        agentId: dto.agentId,
        onlyEnabled: dto.onlyEnabled,
      });
    } catch (e: any) {
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'skills.resolveRuntime failed' });
    }
  }
}

