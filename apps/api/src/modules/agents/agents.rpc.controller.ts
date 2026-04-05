import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
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
import { AgentsService } from './services/agents.service.js';
import { EffectiveSkillsService } from '../skills/services/effective-skills.service.js';
import { MemoryStatsService } from '../memory/services/memory-stats.service.js';
import { SkillsService, revisionToSnapshot } from '../skills/services/skills.service.js';

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

class AgentsAuditRpcDto extends QueryAgentAuditLogsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

@Controller()
export class AgentsRpcController {
  private readonly logger = new Logger(AgentsRpcController.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly recruiterService: AgentRecruiterService,
    private readonly agentSkillService: AgentSkillService,
    private readonly effectiveSkillsService: EffectiveSkillsService,
    private readonly skillsService: SkillsService,
    private readonly memoryStats: MemoryStatsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @MessagePattern('agents.findAll')
  async findAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(AgentsFindAllRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'agents.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () => this.runWithCompanyContext(dto, () => this.agentsService.findAll(dto)),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('agents.findOne')
  async findOne(@Payload() payload: any) {
    try {
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
      return await this.runWithCompanyContext(dto, () =>
        this.effectiveSkillsService.getEffectiveSkillIdsForAgent(dto.id, dto.companyId),
      );
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
        const rows = await this.skillsService.findPublishedRevisionsBySkillIdsForTenant(skillIds, dto.companyId);
        return {
          skillIds,
          skills: rows.map((r) => revisionToSnapshot(r)),
        };
      });
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
