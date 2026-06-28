import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type {
  BaseEvent,
  DepartmentEscalationForcedEvent,
  GovernanceCommandExecutedEvent,
  GovernanceInterventionReceivedEvent,
  OrganizationEvolutionSuggestionApprovedEvent,
  OrganizationEvolutionSuggestionGeneratedEvent,
  TaskHeartbeatTickEvent,
} from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { ConfigService } from '../../../common/config/config.service.js';
import { GovernanceCommandBusService } from '../governance/governance-command-bus.service.js';

@Injectable()
export class OrganizationEvolutionEngine implements OnModuleInit {
  private readonly logger = new Logger(OrganizationEvolutionEngine.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly governanceBus: GovernanceCommandBusService,
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<DepartmentEscalationForcedEvent>(
      'department.escalation.forced',
      this.handleSignal.bind(this),
      { queue: 'worker-org-evolution-department-escalation', durable: true, prefetchCount: 10 },
    );
    this.messaging.subscribeWithBackoff<GovernanceCommandExecutedEvent>(
      'governance.command.executed',
      this.handleSignal.bind(this),
      { queue: 'worker-org-evolution-governance-command', durable: true, prefetchCount: 10 },
    );
    this.messaging.subscribeWithBackoff<GovernanceInterventionReceivedEvent>(
      'governance.intervention.received',
      this.handleSignal.bind(this),
      { queue: 'worker-org-evolution-governance-intervention', durable: true, prefetchCount: 10 },
    );
    this.messaging.subscribeWithBackoff<TaskHeartbeatTickEvent>(
      'task.heartbeat.tick',
      this.handleSignal.bind(this),
      { queue: 'worker-org-evolution-heartbeat', durable: true, prefetchCount: 10 },
    );
    this.messaging.subscribeWithBackoff<OrganizationEvolutionSuggestionApprovedEvent>(
      'organization.evolution.suggestion.approved',
      this.handleSuggestionApproved.bind(this),
      { queue: 'worker-org-evolution-suggestion-approved', durable: true, prefetchCount: 10 },
    );
  }

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async storeSuggestionMemory(companyId: string, content: string, metadata: Record<string, unknown>) {
    await firstValueFrom(
      this.apiRpc
        .send('memory.entries.store', {
          companyId,
          actor: this.actor(),
          data: {
            namespace: 'company_runtime:evolution',
            collectionLabel: `evolution:${new Date().toISOString().slice(0, 10)}`,
            sourceType: 'summary',
            content: content.slice(0, 8000),
            metadata,
          },
        })
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    ).catch(() => undefined);
  }

  private buildSuggestion(
    evt: BaseEvent,
  ): Omit<OrganizationEvolutionSuggestionGeneratedEvent, 'eventId' | 'occurredAt' | 'version'> {
    const companyId = String((evt as any).companyId ?? (evt as any).data?.companyId ?? '').trim();
    const suggestionId = randomUUID();
    let category: OrganizationEvolutionSuggestionGeneratedEvent['data']['category'] = 'governance_policy';
    let summary = '建议优化治理策略';
    let recommendation = '建议老板确认后更新治理策略模板。';
    let confidence = 0.72;
    if (evt.eventType === 'department.escalation.forced') {
      category = 'split_strategy';
      summary = '部门升级事件频发，建议优化拆分策略';
      recommendation = '收紧部门任务拆分粒度并在升级前增加一次主管复核。';
      confidence = 0.84;
    } else if (evt.eventType === 'task.heartbeat.tick') {
      category = 'risk_threshold';
      summary = '巡检触发信号出现，建议调整风险阈值';
      recommendation = '适度下调风险阈值，提高高风险任务的提前预警敏感度。';
      confidence = 0.69;
    } else if (evt.eventType === 'governance.command.executed') {
      category = 'governance_policy';
      summary = '治理命令执行完成，建议沉淀为策略模板';
      recommendation = '将本次治理命令归档为可复用政策，并纳入后续自动决策提示。';
      confidence = 0.76;
    } else if (evt.eventType === 'governance.intervention.received') {
      category = 'prompt_template';
      summary = '接收到治理干预，建议优化提示词模板';
      recommendation = '基于干预结果更新 CEO/主管 prompt 模板，减少重复升级。';
      confidence = 0.74;
    }
    return {
      eventType: 'organization.evolution.suggestion.generated',
      aggregateId: suggestionId,
      aggregateType: 'organization_evolution',
      companyId,
      data: {
        companyId,
        suggestionId,
        basedOnEventType: evt.eventType,
        category,
        summary,
        recommendation,
        confidence,
        requiresBossApproval: true,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        sourceEventId: evt.eventId,
      },
    };
  }

  private async handleSignal(evt: BaseEvent): Promise<void> {
    const companyId = String((evt as any).companyId ?? (evt as any).data?.companyId ?? '').trim();
    if (!companyId) return;
    // 防回环：本引擎会发布 governance.intervention.received。
    // 若再次消费到 source=organization_evolution_engine 的同类事件，必须跳过，
    // 否则会形成 "consume -> publish -> consume" 自激循环，导致队列与 memory 爆增。
    if (
      evt.eventType === 'governance.intervention.received' &&
      String((evt as any)?.data?.source ?? '') === 'organization_evolution_engine'
    ) {
      this.logger.debug('skip self-emitted governance.intervention.received to avoid loop', {
        companyId,
        eventId: evt.eventId,
      });
      return;
    }
    const base = this.buildSuggestion(evt);
    const suggestion: OrganizationEvolutionSuggestionGeneratedEvent = {
      ...base,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      version: 1,
    };
    await this.messaging.publish(suggestion, {
      routingKey: suggestion.eventType,
      persistent: true,
    });
    // 避免在处理 governance.intervention.received 时再次发布同类事件，防止反馈环。
    if (evt.eventType !== 'governance.intervention.received') {
      await this.governanceBus.publishInterventionReceived({
        companyId,
        interventionType: 'evolution_suggestion',
        source: 'organization_evolution_engine',
        payload: {
          suggestionId: suggestion.data.suggestionId,
          category: suggestion.data.category,
          basedOnEventType: suggestion.data.basedOnEventType,
        },
        commandVersion: 1,
      });
    }
    await this.storeSuggestionMemory(
      companyId,
      `summary=${suggestion.data.summary}\nrecommendation=${suggestion.data.recommendation}`,
      {
        source: 'organization_evolution_engine',
        suggestionId: suggestion.data.suggestionId,
        basedOnEventType: suggestion.data.basedOnEventType,
        category: suggestion.data.category,
      },
    );
  }

  private async handleSuggestionApproved(evt: OrganizationEvolutionSuggestionApprovedEvent): Promise<void> {
    const companyId = String(evt.data.companyId ?? '').trim();
    if (!companyId) return;
    await this.governanceBus.publishCommandExecuted({
      companyId,
      commandType: 'organization_evolution.suggestion.apply',
      commandId: evt.data.suggestionId,
      commandVersion: 1,
      status: 'applied',
      reason: evt.data.approvalNote ?? 'boss approved suggestion',
      payload: {
        suggestionId: evt.data.suggestionId,
        approvedBy: evt.data.approvedBy,
      },
    });
    this.logger.log('organization evolution suggestion applied', {
      companyId,
      suggestionId: evt.data.suggestionId,
      approvedBy: evt.data.approvedBy,
    });
  }
}

