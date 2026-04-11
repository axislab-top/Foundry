import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import type { BillingConsumptionRequestedEvent, SkillExecutedEvent } from '@contracts/events';
import { ToolRegistry } from '@service/ai';
import { skillRequiresExecutionToken } from '@foundry/approval-core';
import { ConfigService } from '../../../common/config/config.service.js';
import { ExecutionGuardService } from '../../approval/execution-guard.service.js';
import { ExternalHttpSkillRunnerService } from './external-http-skill-runner.service.js';

export interface ExecuteSkillParams {
  companyId: string;
  agentId: string;
  /** Required for temporary agents; used for project isolation */
  projectId?: string | null;
  skillName: string;
  args: Record<string, unknown>;
  traceId?: string;
  skillId?: string | null;
  /** Caller capability / role keys; required when skill.requiredPermissions is non-empty */
  roles?: string[];
  /** M4：高风险 Skill（metadata.approvalRiskLevel L2/L3）须携带一次性执行令牌 */
  executionToken?: string;
}

@Injectable()
export class AgentExecutionService {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly messagingService: MessagingService,
    private readonly externalHttp: ExternalHttpSkillRunnerService,
    private readonly config: ConfigService,
    private readonly executionGuard: ExecutionGuardService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async assertTemporaryAgentProjectScope(params: {
    companyId: string;
    agentId: string;
    projectId?: string | null;
  }): Promise<void> {
    const actor = this.workerActor();
    const agent = await firstValueFrom(
      this.apiRpc
        .send<{ metadata?: Record<string, unknown> | null }>('agents.findOne', {
          companyId: params.companyId,
          actor,
          id: params.agentId,
        })
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
    const meta = (agent as any)?.metadata as Record<string, unknown> | null | undefined;
    const employmentType =
      meta && typeof meta['employmentType'] === 'string' ? String(meta['employmentType']) : 'permanent';
    if (employmentType !== 'temporary') return;
    const boundProjectId = meta && typeof meta['projectId'] === 'string' ? String(meta['projectId']) : '';
    const pid = typeof params.projectId === 'string' ? params.projectId.trim() : '';
    if (!boundProjectId) {
      throw new Error('PROJECT_SCOPE_REQUIRED: temporary agent missing bound projectId');
    }
    if (!pid) {
      throw new Error('PROJECT_SCOPE_REQUIRED: projectId required for temporary agent');
    }
    if (pid !== boundProjectId) {
      throw new Error('PROJECT_SCOPE_REQUIRED: temporary agent project mismatch');
    }
  }

  private async assertExternalSkillBudgetAllowance(
    params: ExecuteSkillParams,
    snap: { name: string; metadata?: Record<string, unknown> | null },
  ): Promise<void> {
    const actor = this.workerActor();
    const estimatedCost = this.config.getExternalSkillBudgetEstimate();
    const allowance = await firstValueFrom(
      this.apiRpc
        .send<{ allowed: boolean; reason?: string; warning?: string }>('billing.checkAllowance', {
          companyId: params.companyId,
          actor,
          estimatedCost,
          agentId: params.agentId,
        })
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
    if (allowance?.warning) {
      this.logger.warn('billing.checkAllowance soft budget warning (external skill)', {
        companyId: params.companyId,
        agentId: params.agentId,
        warning: allowance.warning,
      });
    }
    if (!allowance?.allowed) {
      if (allowance?.reason === 'execution_paused') {
        throw new Error(`execution paused: ${allowance.reason}`);
      }
      this.logger.warn('billing.checkAllowance disallowed (non-pause); continuing per soft budget policy', {
        companyId: params.companyId,
        agentId: params.agentId,
        reason: allowance?.reason,
      });
    }
  }

  private async publishSkillBilling(
    params: ExecuteSkillParams,
    skillId: string | null,
    durationMs: number,
  ): Promise<void> {
    const idempotencyKey = params.traceId
      ? `skill:${params.companyId}:${params.agentId}:${params.skillName}:${params.traceId}`
      : `skill:${params.companyId}:${params.agentId}:${params.skillName}:${randomUUID()}`;
    const event: BillingConsumptionRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.consumption.requested',
      aggregateId: skillId ?? params.skillName,
      aggregateType: 'billing',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        recordType: 'skill',
        agentId: params.agentId,
        skillId: skillId ?? undefined,
        skillCallUnits: Math.max(1, Math.ceil(durationMs / 60_000)),
        idempotencyKey,
        metadata: { skillName: params.skillName, durationMs },
      },
    };
    await this.messagingService.publish(event, {
      routingKey: 'billing.consumption.requested',
      persistent: true,
    });
  }

  async executeSkill(params: ExecuteSkillParams): Promise<{ result: unknown; durationMs: number }> {
    const started = Date.now();
    let skillId: string | null = params.skillId ?? null;
    const snapshots = this.registry.getToolSnapshots(params.companyId, params.agentId);
    const snap = snapshots.find((s) => s.name === params.skillName);
    if (snap) {
      skillId = snap.id;
    }
    let result: unknown;
    try {
      await this.assertTemporaryAgentProjectScope({
        companyId: params.companyId,
        agentId: params.agentId,
        projectId: params.projectId,
      });
      if (!snap) {
        // Keep existing error semantics aligned with ToolRegistry.execute.
        throw new Error(`Skill "${params.skillName}" is not bound to this agent`);
      }

      // Permission check shared across implementations.
      this.registry.assertCanExecute(snap, {
        companyId: params.companyId,
        agentId: params.agentId,
        traceId: params.traceId,
        roles: params.roles,
      });

      const snapMeta = (snap as { metadata?: Record<string, unknown> | null }).metadata;
      if (skillRequiresExecutionToken(snapMeta ?? undefined)) {
        const tok = params.executionToken?.trim();
        if (!tok) {
          throw new Error(
            `M4: execution token required for high-risk skill "${params.skillName}" (metadata.approvalRiskLevel L2/L3)`,
          );
        }
        await this.executionGuard.validateAndConsumeToken({
          companyId: params.companyId,
          tokenId: tok,
          action: `skill:${params.skillName}`,
        });
      }

      if (snap.implementationType === 'external') {
        await this.assertExternalSkillBudgetAllowance(params, snap);
        result = await this.externalHttp.execute(snap, params.args, { traceId: params.traceId });
      } else {
        // builtin (default) / api / langgraph: currently only builtin handler is supported.
        // TODO: P8 必须迁移到 runner.execute RPC（当前仍为临时路径）
        result = await this.registry.execute(
          params.companyId,
          params.agentId,
          params.skillName,
          params.args,
          {
            companyId: params.companyId,
            agentId: params.agentId,
            traceId: params.traceId,
            roles: params.roles,
          },
        );
      }
    } catch (e: any) {
      const durationMs = Date.now() - started;
      await this.publishExecuted(params, skillId, {
        ok: false,
        error: e?.message ?? String(e),
      }, durationMs);
      throw e;
    }
    const durationMs = Date.now() - started;
    const resultSummary =
      result !== null && typeof result === 'object'
        ? (result as Record<string, unknown>)
        : { value: result };
    await this.publishExecuted(params, skillId, resultSummary, durationMs);
    await this.publishSkillBilling(params, skillId, durationMs);
    return { result, durationMs };
  }

  private async publishExecuted(
    params: ExecuteSkillParams,
    skillId: string | null,
    resultSummary: Record<string, unknown>,
    durationMs: number,
  ): Promise<void> {
    const event: SkillExecutedEvent = {
      eventId: randomUUID(),
      eventType: 'skill.executed',
      aggregateId: skillId ?? params.skillName,
      aggregateType: 'skill',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        agentId: params.agentId,
        skillId,
        skillName: params.skillName,
        traceId: params.traceId,
        argsSummary: params.args,
        resultSummary,
        durationMs,
        billingUnits: null,
        executedAt: new Date().toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }
}
