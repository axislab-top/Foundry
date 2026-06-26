import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import type { SkillToolSnapshot } from '@contracts/events';
import { ToolRegistry } from '@service/ai';
import { ConfigService } from '../../../common/config/config.service.js';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';
import {
  pickDeliverableExecutionSkillName,
  isDirectorManagementSkillName,
} from '../utils/execution-skill-picker.util.js';
import type { ExecutionProfile } from '../utils/execution-profile.util.js';
import { soloDirectorMustUseDeliverableSkill } from '../utils/execution-profile.util.js';

export type UnifiedDeliverableExecuteParams = {
  companyId: string;
  agentId: string;
  traceId: string;
  args: Record<string, unknown>;
  preferredSkillName?: string | null;
  executionProfile?: ExecutionProfile | null;
  projectId?: string | null;
  executionTokenId?: string | null;
  taskContext?: string | null;
  layer?: string;
};

export type UnifiedDeliverableExecuteResult = {
  result: unknown;
  skillName: string;
  skillExecutionId: string;
  durationMs: number;
  executionSource: 'unified_deliverable_executor';
};

@Injectable()
export class UnifiedDeliverableExecutorService {
  private readonly logger = new Logger(UnifiedDeliverableExecutorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly agentExecution: AgentExecutionService,
    private readonly registry: ToolRegistry,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, data: Record<string, unknown>): Promise<T> {
    const ms = Math.max(4_000, Math.min(30_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    return firstValueFrom(this.apiRpc.send<T>(pattern, data).pipe(timeout({ first: ms })));
  }

  async hydrateAgentSkills(companyId: string, agentId: string): Promise<SkillToolSnapshot[]> {
    const hydrated = await this.rpc<{ skills: SkillToolSnapshot[] }>('agents.effectiveSkillSnapshots', {
      companyId,
      actor: this.workerActor(),
      id: agentId,
    });
    const skills = hydrated?.skills ?? [];
    this.registry.setAgentTools(companyId, agentId, skills);
    return skills;
  }

  async resolveExecutionRoles(companyId: string, agentId: string): Promise<string[]> {
    const res = await this.rpc<{ roles?: string[] }>('agents.effectiveExecutionRoles', {
      companyId,
      actor: this.workerActor(),
      id: agentId,
    });
    return Array.isArray(res?.roles) ? res.roles.filter((r) => typeof r === 'string' && r.trim()) : [];
  }

  pickSkillName(
    skills: SkillToolSnapshot[],
    hints?: {
      preferredSkillName?: string | null;
      executionProfile?: ExecutionProfile | null;
      taskContext?: string | null;
    },
  ): string | null {
    const profile = hints?.executionProfile ?? null;
    const picked = pickDeliverableExecutionSkillName(skills, {
      preferredSkillName: hints?.preferredSkillName,
      taskContext: hints?.taskContext,
    });
    if (!picked) return null;
    if (soloDirectorMustUseDeliverableSkill(profile ?? 'director_delegates') && isDirectorManagementSkillName(picked)) {
      const fallback = pickDeliverableExecutionSkillName(
        skills.filter((s) => !isDirectorManagementSkillName(String(s.name ?? '').trim())),
        { taskContext: hints?.taskContext },
      );
      return fallback;
    }
    return picked;
  }

  async execute(params: UnifiedDeliverableExecuteParams): Promise<UnifiedDeliverableExecuteResult> {
    const startedAt = Date.now();
    const skills = await this.hydrateAgentSkills(params.companyId, params.agentId);
    const skillName = this.pickSkillName(skills, {
      preferredSkillName: params.preferredSkillName,
      executionProfile: params.executionProfile,
      taskContext: params.taskContext,
    });
    if (!skillName) {
      throw new Error('unified_deliverable_no_skill');
    }

    const roles = await this.resolveExecutionRoles(params.companyId, params.agentId);
    if (!roles.length) {
      throw new Error(`unified_deliverable_no_execution_roles:${params.agentId}`);
    }

    const skillExecutionId = randomUUID();
    const exec = await this.agentExecution.executeSkill({
      companyId: params.companyId,
      agentId: params.agentId,
      projectId: params.projectId ?? undefined,
      skillName,
      args: params.args,
      traceId: params.traceId,
      roles,
      executionTokenId: params.executionTokenId ?? undefined,
      skillExecutionId,
      layer: params.layer ?? 'employee',
      promptSkillMode: 'complete',
    });

    return {
      result: exec.result,
      skillName,
      skillExecutionId,
      durationMs: Date.now() - startedAt,
      executionSource: 'unified_deliverable_executor',
    };
  }
}
