import {
  BadRequestException,
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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '@service/tenant';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../../common/types/user.types.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { EffectiveSkillsService } from '../../skills/services/effective-skills.service.js';
import { AssignAgentNodeDto } from '../dto/assign-agent-node.dto.js';
import { BatchRecruitDto } from '../dto/batch-recruit.dto.js';
import { BindAgentSkillsDto } from '../dto/bind-agent-skills.dto.js';
import { CreateAgentDto } from '../dto/create-agent.dto.js';
import { QueryAgentAuditLogsDto } from '../dto/query-agent-audit.dto.js';
import { QueryAgentsDto } from '../dto/query-agents.dto.js';
import { UpdateAgentDto } from '../dto/update-agent.dto.js';
import { UpdateAgentStatusDto } from '../dto/update-agent-status.dto.js';
import { AgentRecruiterService } from '../services/agent-recruiter.service.js';
import { AgentSkillService } from '../services/agent-skill.service.js';
import { AgentsService } from '../services/agents.service.js';

@ApiTags('agents')
@ApiBearerAuth('JWT-auth')
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly recruiterService: AgentRecruiterService,
    private readonly agentSkillService: AgentSkillService,
    private readonly effectiveSkillsService: EffectiveSkillsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent 列表' })
  async findAll(@Query() query: QueryAgentsDto) {
    return this.agentsService.findAll(query);
  }

  @Get('audit-logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent 审计日志' })
  async auditLogs(@Query() query: QueryAgentAuditLogsDto) {
    return this.agentsService.queryAuditLogs(query);
  }

  @Get(':id/effective-skills')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '有效 Skill ID（直接绑定 ∪ 组织节点继承）' })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async effectiveSkills(@Param('id', ParseUUIDPipe) id: string) {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    const skillIds = await this.effectiveSkillsService.getEffectiveSkillIdsForAgent(id, companyId);
    return { skillIds };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent 详情' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.agentsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '招聘 Agent（绑定组织节点）' })
  @ApiBody({ type: CreateAgentDto })
  async create(@Body() dto: CreateAgentDto, @CurrentUser() user: UserInfo) {
    return this.recruiterService.recruitOne(dto, { id: user.id, roles: user.roles });
  }

  @Post('batch-recruit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '批量招聘' })
  @ApiBody({ type: BatchRecruitDto })
  async batchRecruit(@Body() dto: BatchRecruitDto, @CurrentUser() user: UserInfo) {
    return this.recruiterService.batchRecruit(dto, { id: user.id, roles: user.roles });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新 Agent' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.agentsService.update(id, dto, { id: user.id, roles: user.roles });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审批并应用 pending 配置' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserInfo) {
    return this.agentsService.approve(id, { id: user.id, roles: user.roles });
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新 Agent 状态' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentStatusDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.agentsService.updateStatus(id, dto, { id: user.id, roles: user.roles });
  }

  @Patch(':id/assign-node')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新分配到组织节点' })
  async assignNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignAgentNodeDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.agentsService.assignToNode(id, dto, { id: user.id, roles: user.roles });
  }

  @Post(':id/skills')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '绑定 Skills' })
  async bindSkills(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BindAgentSkillsDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.agentSkillService.bindSkills(id, dto, { id: user.id, roles: user.roles });
  }

  @Post(':id/skills/unbind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解绑 Skills' })
  async unbindSkills(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BindAgentSkillsDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.agentSkillService.unbindSkills(id, dto, { id: user.id, roles: user.roles });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除 Agent' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserInfo) {
    return this.agentsService.remove(id, { id: user.id, roles: user.roles });
  }
}
