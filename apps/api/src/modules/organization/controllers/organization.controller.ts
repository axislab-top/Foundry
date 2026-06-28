import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateOrganizationNodeDto } from '../dto/create-organization-node.dto.js';
import { MoveNodeDto } from '../dto/move-node.dto.js';
import { QueryOrganizationTreeDto } from '../dto/query-organization-tree.dto.js';
import { UpdateNodeDto } from '../dto/update-node.dto.js';
import { OrganizationService } from '../services/organization.service.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../../common/types/user.types.js';
import { QueryNodeAgentsDto } from '../dto/query-node-agents.dto.js';
import { QueryOrganizationAuditLogsDto } from '../dto/query-audit-logs.dto.js';
import { BindOrganizationNodeSkillsDto } from '../../skills/dto/bind-organization-node-skills.dto.js';
import { OrganizationNodeSkillsService } from '../../skills/services/organization-node-skills.service.js';
import { SuggestDepartmentCapabilitiesDto } from '../dto/suggest-department-capabilities.dto.js';

@ApiTags('organizations')
@ApiBearerAuth('JWT-auth')
@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly organizationNodeSkillsService: OrganizationNodeSkillsService,
  ) {}

  @Get('tree')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取组织树' })
  @ApiQuery({ type: QueryOrganizationTreeDto, required: false })
  async getTree(@Query() query: QueryOrganizationTreeDto) {
    return this.organizationService.getTree(query);
  }

  @Post('departments/suggest-capabilities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '根据部门名称与职能摘要草稿推荐 taskTypeTags' })
  @ApiBody({ type: SuggestDepartmentCapabilitiesDto })
  suggestDepartmentCapabilities(@Body() dto: SuggestDepartmentCapabilitiesDto) {
    return this.organizationService.suggestDepartmentCapabilities(dto);
  }

  @Post('nodes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建组织节点' })
  @ApiBody({ type: CreateOrganizationNodeDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createNode(@Body() dto: CreateOrganizationNodeDto, @CurrentUser() user: UserInfo) {
    return this.organizationService.createNode(dto, { id: user?.id, roles: user?.roles });
  }

  @Patch('nodes/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新组织节点' })
  @ApiParam({ name: 'id', description: '节点 ID (UUID)' })
  async updateNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNodeDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.organizationService.updateNode(id, dto, { id: user?.id, roles: user?.roles });
  }

  @Patch('nodes/:id/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移动组织节点（拖拽）' })
  @ApiParam({ name: 'id', description: '节点 ID (UUID)' })
  async moveNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveNodeDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.organizationService.moveNode(id, dto, { id: user?.id, roles: user?.roles });
  }

  @Delete('nodes/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除组织节点（叶子节点）' })
  async removeNode(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserInfo) {
    return this.organizationService.removeNode(id, { id: user?.id, roles: user?.roles });
  }

  @Get('nodes/:id/agents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询节点及其下属 Agent 节点' })
  async getDescendantAgents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryNodeAgentsDto,
  ) {
    return this.organizationService.findDescendantAgents(id, query.includeSelf ?? true);
  }

  @Get('nodes/:id/reporting-chain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询节点汇报链（当前节点到根节点）' })
  async getReportingChain(@Param('id', ParseUUIDPipe) id: string) {
    return this.organizationService.getReportingChain(id);
  }

  @Get('nodes/:id/skills')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '节点级 Skills（部门继承源）' })
  @ApiParam({ name: 'id', description: '组织节点 ID' })
  async listNodeSkills(@Param('id', ParseUUIDPipe) id: string) {
    const skillIds = await this.organizationNodeSkillsService.listSkillIdsForNode(id);
    return { skillIds };
  }

  @Post('nodes/:id/skills/bind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '绑定 Skills 到组织节点（子树内 Agent 可通过继承获得）' })
  @ApiBody({ type: BindOrganizationNodeSkillsDto })
  async bindNodeSkills(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BindOrganizationNodeSkillsDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.organizationNodeSkillsService.bindSkills(id, dto, {
      id: user.id,
      roles: user.roles,
    });
  }

  @Post('nodes/:id/skills/unbind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '从组织节点解绑 Skills' })
  @ApiBody({ type: BindOrganizationNodeSkillsDto })
  async unbindNodeSkills(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BindOrganizationNodeSkillsDto,
    @CurrentUser() user: UserInfo,
  ) {
    const skillIds = await this.organizationNodeSkillsService.unbindSkills(id, dto, {
      id: user.id,
      roles: user.roles,
    });
    return { skillIds };
  }

  @Get('audit-logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询组织结构变更审计日志' })
  async getAuditLogs(@Query() query: QueryOrganizationAuditLogsDto) {
    return this.organizationService.queryAuditLogs(query);
  }
}
