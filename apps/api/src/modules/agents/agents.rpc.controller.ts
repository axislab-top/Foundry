import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { metrics } from '@opentelemetry/api';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ConfigService } from '../../common/config/config.service.js';
import { serializeUnknownErrorForLog } from '../../common/logging/serialize-unknown-error.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { TenantContextService } from '@service/tenant';
import { AssignAgentNodeDto } from './dto/assign-agent-node.dto.js';
import { BatchRecruitDto } from './dto/batch-recruit.dto.js';
import { BindAgentSkillsDto } from './dto/bind-agent-skills.dto.js';
import { CreateAgentDto } from './dto/create-agent.dto.js';
import { QueryAgentAuditLogsDto } from './dto/query-agent-audit.dto.js';
import { QueryAgentsDto } from './dto/query-agents.dto.js';
import { UpdateAgentDto } from './dto/update-agent.dto.js';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto.js';
import { AgentRecruiterService } from './services/agent-recruiter.service.js';
import { AgentSkillService } from './services/agent-skill.service.js';
import { AgentHierarchyService } from './services/agent-hierarchy.service.js';
import { AgentsService } from './services/agents.service.js';
import { AgentWorkspaceService } from './services/agent-workspace.service.js';
import { AgentExecutionRolesService } from './services/agent-execution-roles.service.js';
import { EffectiveSkillsService } from '../skills/services/effective-skills.service.js';
import { MemoryStatsService } from '../memory/services/memory-stats.service.js';
import { SkillsService } from '../skills/services/skills.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class AgentsBaseRpcDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class AgentsFindAllRpcDto extends QueryAgentsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class AgentsIdRpcDto extends AgentsBaseRpcDto {
  @IsUUID()
  id: string;
}

class AgentsRemoveRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class AgentsApproveRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class AgentsCreateRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => CreateAgentDto)
  data: CreateAgentDto;
}

class AgentsBatchRecruitRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => BatchRecruitDto)
  data: BatchRecruitDto;
}

class AgentsUpdateRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateAgentDto)
  data: UpdateAgentDto;
}

class AgentsAssignRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => AssignAgentNodeDto)
  data: AssignAgentNodeDto;
}

class AgentsStatusRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateAgentStatusDto)
  data: UpdateAgentStatusDto;
}

class AgentsBindSkillsRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => BindAgentSkillsDto)
  data: BindAgentSkillsDto;
}

class AgentsGcTemporarySkillsRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class AgentsAuditRpcDto extends QueryAgentAuditLogsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class AgentsManagementIdRpcDto extends AgentsBaseRpcDto {
  @IsUUID()
  id: string;
}

class AgentsLlmKeyPoolRpcDto extends AgentsBaseRpcDto {
  @IsUUID()
  id: string;

  /**
   * CEO 三层（用于按层 lane 选择 dedicated key）
   * - classifier / light / heavy
   */
  @IsOptional()
  @IsString()
  ceoContext?: string;

  /** Worker 观测用：关联 messageId / trace（不改变池解析逻辑） */
  @IsOptional()
  @IsString()
  correlationMessageId?: string;
}

class AgentsSetSupervisorRpcDto extends AgentsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsOptional()
  @IsUUID()
  reportsToAgentId?: string | null;
}

class AgentsDepartmentSharingContextRpcDto extends AgentsBaseRpcDto {
  @IsUUID()
  id: string;
}

const agentsRpcMeter = metrics.getMeter('foundry-api-agents');
const foundryAgentsRpcCounter = agentsRpcMeter.createCounter('foundry.agents.rpc.count', {
  description: 'Agents RPC handler invocations on API (per MessagePattern)',
});

/** 仅打一次完整 agents.findAll 返回体，便于对照 Worker 侧结构（可用 FOUNDRY_LOG_AGENTS_FINDALL_MAX_CHARS 控制长度）。 */
let agentsFindAllResponseDumpLoggedOnce = false;

function extractRpcExceptionValidationDiagnostics(e: unknown): {
  validationErrors?: unknown;
  rpcStatus?: unknown;
  rpcMessage?: unknown;
} {
  if (!e || typeof e !== 'object') return {};
  const getError = (e as { getError?: () => unknown }).getError;
  if (typeof getError !== 'function') return {};
  const inner = getError.call(e);
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return {};
  const r = inner as Record<string, unknown>;
  return {
    validationErrors: Array.isArray(r['errors']) ? r['errors'] : undefined,
    rpcStatus: r['status'],
    rpcMessage: r['message'],
  };
}

@Controller()
export class AgentsRpcController {
  private readonly logger = new Logger(AgentsRpcController.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentWorkspaceService: AgentWorkspaceService,
    private readonly recruiterService: AgentRecruiterService,
    private readonly agentSkillService: AgentSkillService,
    private readonly hierarchyService: AgentHierarchyService,
    private readonly agentExecutionRolesService: AgentExecutionRolesService,
    private readonly effectiveSkillsService: EffectiveSkillsService,
    private readonly skillsService: SkillsService,
    private readonly memoryStats: MemoryStatsService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  @MessagePattern('agents.uiConfig')
  async uiConfig(@Payload() payload: unknown) {
    try {
      validateRpcDto(AgentsBaseRpcDto, payload);
      return {
        marketplaceConfigStaleHours: this.configService.getAgentMarketplaceConfigStaleHours(),
      };
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.systemApproval')
  async systemApproval(@Payload() payload: unknown) {
    try {
      validateRpcDto(AgentsBaseRpcDto, payload);
      return {
        id: 'system-approval',
        name: '审批系统',
        role: 'system',
      };
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.findAll')
  async findAll(@Payload() payload: any) {
    try {
      foundryAgentsRpcCounter.add(1, { pattern: 'agents.findAll' });
      const dto = validateRpcDto(AgentsFindAllRpcDto, payload);
      const result = await executeRpc({
        logger: this.logger,
        pattern: 'agents.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.runWithCompanyContext(dto, () => this.agentsService.findAll(dto)),
      });
      if (!agentsFindAllResponseDumpLoggedOnce) {
        agentsFindAllResponseDumpLoggedOnce = true;
        let responseJson = '';
        try {
          responseJson = JSON.stringify(result);
        } catch (stringifyErr: unknown) {
          responseJson = `[JSON.stringify_failed] ${JSON.stringify(serializeUnknownErrorForLog(stringifyErr))}`;
        }
        const maxChars = Math.max(
          10_000,
          Math.min(
            2_000_000,
            Number.parseInt(String(process.env.FOUNDRY_LOG_AGENTS_FINDALL_MAX_CHARS ?? '400000'), 10) || 400_000,
          ),
        );
        const truncated = responseJson.length > maxChars;
        this.logger.log('agents.rpc.find_all_response_once', {
          pattern: 'agents.findAll',
          topLevelKeys: result && typeof result === 'object' ? Object.keys(result as object) : [],
          responseCharLength: responseJson.length,
          truncated,
          maxChars,
          responseJson: truncated ? `${responseJson.slice(0, maxChars)}\n/* truncated */` : responseJson,
        });
      }
      return result;
    } catch (e: any) {
      const vd = extractRpcExceptionValidationDiagnostics(e);
      this.logger.warn('agents.rpc.find_all_handler_error', {
        ...vd,
        fullError: serializeUnknownErrorForLog(e),
      });
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.workspace.get')
  async workspaceGet(@Payload() payload: any) {
    try {
      foundryAgentsRpcCounter.add(1, { pattern: 'agents.workspace.get' });
      const dto = validateRpcDto(AgentsIdRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'agents.workspace.get',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompanyContext(dto, () =>
            this.agentWorkspaceService.getWorkspace(dto.companyId!, dto.id),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.findOne')
  async findOne(@Payload() payload: any) {
    try {
      foundryAgentsRpcCounter.add(1, { pattern: 'agents.findOne' });
      const dto = validateRpcDto(AgentsIdRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'agents.findOne',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.runWithCompanyContext(dto, () => this.agentsService.findOne(dto.id)),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.effectiveSkills')
  async effectiveSkills(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsIdRpcDto, payload);
      if (!dto.companyId) {
        throw new RpcException({ status: 400, message: 'companyId is required' });
      }
      return await this.runWithCompanyContext(dto, async () => {
        const skillIds = await this.effectiveSkillsService.getEffectiveSkillIdsForAgent(
          dto.id,
          dto.companyId!,
        );
        return { skillIds };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** Worker 执行前拉取有效技能快照（与 agent.skills.changed 中 skills 结构一致） */
  @MessagePattern('agents.effectiveExecutionRoles')
  async effectiveExecutionRoles(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsIdRpcDto, payload);
      if (!dto.companyId) {
        throw new RpcException({ status: 400, message: 'companyId is required' });
      }
      return await this.runWithCompanyContext(dto, async () => {
        const roles = await this.agentExecutionRolesService.getEffectiveExecutionRoles(
          dto.id,
          dto.companyId!,
        );
        return { roles };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** Worker 执行前拉取有效技能快照（与 agent.skills.changed 中 skills 结构一致） */
  @MessagePattern('agents.effectiveSkillSnapshots')
  async effectiveSkillSnapshots(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsIdRpcDto, payload);
      if (!dto.companyId) {
        throw new RpcException({ status: 400, message: 'companyId is required' });
      }
      return await this.runWithCompanyContext(dto, async () => {
        const skillIds = await this.effectiveSkillsService.getEffectiveSkillIdsForAgent(
          dto.id,
          dto.companyId,
        );
        const rows = await this.skillsService.findByIdsForTenant(skillIds, dto.companyId);
        const enabledRows = rows.filter((row) => row.isEnabled);
        return {
          skillIds,
          skills: await this.skillsService.skillsToSnapshotsWithBindings(enabledRows),
        };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** 只返回 agent_skills 直接绑定的技能快照（不含任何组织继承） */
  @MessagePattern('agents.directSkillSnapshots')
  async directSkillSnapshots(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsIdRpcDto, payload);
      if (!dto.companyId) {
        throw new RpcException({ status: 400, message: 'companyId is required' });
      }
      return await this.runWithCompanyContext(dto, async () => {
        const skillIds = await this.effectiveSkillsService.getDirectSkillIdsForAgent(dto.id, dto.companyId);
        const rows = await this.skillsService.findByIdsForTenant(skillIds, dto.companyId);
        const enabledRows = rows.filter((row) => row.isEnabled);
        return {
          skillIds,
          skills: await this.skillsService.skillsToSnapshotsWithBindings(enabledRows),
        };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** 返回 Agent 的部门共享上下文（用于 Worker 决定是否注入 department:* 命名空间） */
  @MessagePattern('agents.departmentSharingContext')
  async departmentSharingContext(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsDepartmentSharingContextRpcDto, payload);
      if (!dto.companyId) {
        throw new RpcException({ status: 400, message: 'companyId is required' });
      }
      return await this.runWithCompanyContext(dto, () =>
        this.effectiveSkillsService.getDepartmentSharingContextForAgent({
          agentId: dto.id,
          companyId: dto.companyId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.create')
  async create(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsCreateRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.recruiterService.recruitOne(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.batchRecruit')
  async batchRecruit(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsBatchRecruitRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.recruiterService.batchRecruit(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.update')
  async update(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsUpdateRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.update(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.remove')
  async remove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsRemoveRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.remove(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.assignToNode')
  async assignToNode(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsAssignRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.assignToNode(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.updateStatus')
  async updateStatus(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsStatusRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.updateStatus(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.bindSkills')
  async bindSkills(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsBindSkillsRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentSkillService.bindSkills(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** Periodic cleanup: remove expired temporary skill bindings for tenant */
  @MessagePattern('agents.skills.gcExpiredTemporary')
  async gcExpiredTemporary(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsGcTemporarySkillsRpcDto, payload);
      if (!dto.companyId) {
        throw new RpcException({ status: 400, message: 'companyId is required' });
      }
      return await this.runWithCompanyContext(dto, async () => {
        return this.agentSkillService.gcExpiredTemporaryBindings(dto.companyId!, dto.actor);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.unbindSkills')
  async unbindSkills(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsBindSkillsRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentSkillService.unbindSkills(dto.id, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.approve')
  async approve(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsApproveRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.approve(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.memoryStats')
  async memoryStatsRpc(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsIdRpcDto, payload);
      if (!dto.companyId) {
        throw new RpcException({ status: 400, message: 'companyId is required' });
      }
      return await this.runWithCompanyContext(dto, () =>
        this.memoryStats.getAgentMemoryStats(dto.companyId, dto.id),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.auditLogs')
  async auditLogs(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsAuditRpcDto, payload);
      return await this.runWithCompanyContext(dto, () => this.agentsService.queryAuditLogs(dto));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.management.subordinates')
  async managementSubordinates(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsManagementIdRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.listDirectSubordinates(dto.id),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.management.supervisorChain')
  async managementSupervisorChain(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsManagementIdRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.getSupervisorChain(dto.id),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.llmKeyPoolCandidates')
  async llmKeyPoolCandidates(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsLlmKeyPoolRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.resolveLlmKeyPoolCandidates(dto.id, dto.ceoContext),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.refreshMarketplaceLlmSnapshot')
  async refreshMarketplaceLlmSnapshot(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsApproveRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.agentsService.refreshMarketplaceLlmSnapshot(dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.hierarchy.setSupervisor')
  async setSupervisor(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(AgentsSetSupervisorRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.hierarchyService.setSupervisor(
          dto.id,
          dto.reportsToAgentId ?? null,
          dto.actor,
          'rpc_set_supervisor',
        ),
      );
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
    return e instanceof RpcException
      ? e
      : new RpcException({ status: 500, message: e?.message || 'Internal error' });
  }

  private runWithCompanyContext<T>(
    payload: { companyId?: string; actor?: { id: string } },
    callback: () => Promise<T>,
  ): Promise<T> {
    const companyId = payload?.companyId;
    if (!companyId) {
      return callback();
    }
    return this.tenantContext.runWithCompanyId(companyId, callback);
  }
}
