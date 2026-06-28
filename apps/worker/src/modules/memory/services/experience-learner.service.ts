import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import type { CollaborationDiscussionConvergedEvent, ExperienceRecapGeneratedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { createRecapFromDiscussion, RecapSchema } from '@foundry/multi-agent-core';
import { ConfigService } from '../../../common/config/config.service.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';
import { LlmKeyResolverService } from '../../autonomous/llm-key-resolver.service.js';
import { CeoChatModelFactory } from '../../autonomous/ceo-chat-model.factory.js';

type RoomInfoRow = { taskId?: string | null };

interface ChatMessageShape {
  id: string;
  roomId: string;
  threadId?: string | null;
  senderType: 'human' | 'agent';
  senderId?: string;
  messageType: string;
  content: string;
  createdAt?: string | null;
}

@Injectable()
export class ExperienceLearnerService {
  private readonly logger = new Logger(ExperienceLearnerService.name);
  private readonly limiter = new SimpleRateLimiter({
    maxConcurrent: 2,
    maxPerWindow: 30,
    windowMs: 60_000,
  });
  private readonly breaker = new SimpleCircuitBreaker({
    failureThreshold: 5,
    openMs: 30_000,
  });

  private readFlag(key: string, defaultValue: boolean): boolean {
    const cfg = this.config as unknown as { get?: <T>(k: string, d?: T) => T };
    if (typeof cfg.get === 'function') return Boolean(cfg.get<boolean>(key, defaultValue));
    return defaultValue;
  }

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
    private readonly llmKeyResolver: LlmKeyResolverService,
    private readonly chatFactory: CeoChatModelFactory,
  ) {}

  private async getRoomProjectId(companyId: string, actor: { id: string; roles: string[] }, roomId: string): Promise<string | null> {
    try {
      const room = await firstValueFrom(
        this.apiRpc
          .send<RoomInfoRow>('collaboration.rooms.findOne', { companyId, actor, roomId })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      return typeof room?.taskId === 'string' && room.taskId.trim() ? room.taskId.trim() : null;
    } catch {
      return null;
    }
  }

  async generateRecap(event: CollaborationDiscussionConvergedEvent): Promise<void> {
    const companyId = event.companyId;
    if (!companyId) return;

    const { roomId, threadId } = event.data;
    const startedAt = Date.now();

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        if (!this.breaker.canExecute()) {
          this.monitoring.recordExperienceRecapSkipped('circuit_open');
          return;
        }
        if (!this.limiter.tryEnter()) {
          this.monitoring.recordExperienceRecapSkipped('rate_limited');
          return;
        }

        const actor = { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };

        const messages = await this.fetchRecentMessages(companyId, actor, roomId, 180);
        const threadMessages = messages
          .filter((m) => m.messageType !== 'stream_chunk')
          .filter((m) => (m.threadId ?? null) === threadId)
          .map((m) => ({
            senderType: m.senderType,
            senderId: m.senderId,
            content: m.content?.trim() ?? '',
            createdAt: m.createdAt ?? undefined,
          }))
          .filter((m) => m.content.length > 0)
          .slice(-120);

        const analysisPrompt = this.buildAnalysisPrompt({
          roomId,
          threadId,
          summary: event.data.summary ?? '',
          messages: threadMessages,
        });

        const key = await this.llmKeyResolver.acquireWithFallback({
          companyId,
          requestedModelName: 'gpt-4o',
        });
        const model = this.chatFactory.create(
          key.modelName || 'gpt-4o',
          key.apiKey,
          key.providerKind,
          key.requestUrl,
          120000,
          1600,
        );

        const raw = await model.invoke(analysisPrompt);
        const analysis = this.parseStrictJson(String((raw as any)?.content ?? raw ?? '').trim());

        const recap = createRecapFromDiscussion(
          { ...event, data: { ...event.data, threadId } } as any,
          analysis as any,
        );
        const recapParsed = RecapSchema.parse(recap);

        const contentForEmbedding = this.buildEmbeddingFriendlyContent(recapParsed);
        const projectId = await this.getRoomProjectId(companyId, actor, roomId);
        const targetNamespace = projectId ? `project:${projectId}` : 'company';
        const useGovernanceV2 = this.readFlag('MEMORY_GOVERNANCE_V2_ENABLED', false);
        const useGraphV2 = this.readFlag('MEMORY_GRAPH_V2_ENABLED', false);
        const storePattern = useGovernanceV2 ? 'memory.summary.store' : 'memory.entries.store';
        const stored = await firstValueFrom(
          this.apiRpc
            .send(storePattern, {
              companyId,
              actor,
              data: {
                namespace: targetNamespace,
                collectionLabel: `experience_recap:thread:${threadId}`,
                content: contentForEmbedding.slice(0, 12000),
                sourceType: useGovernanceV2 ? 'summary' : 'recap',
                metadata: {
                  source: 'experience_learner',
                  roomId,
                  threadId,
                  ...(projectId ? { projectId } : {}),
                  outcome: recapParsed.outcome,
                  recapId: recapParsed.recapId,
                  recap: recapParsed,
                  causedBy: { eventType: event.eventType, eventId: event.eventId },
                },
              },
            })
            .pipe(timeout(this.config.getApiRpcTimeoutMs())),
        );
        const recapEntryId = typeof (stored as any)?.id === 'string' ? String((stored as any).id) : null;
        if (useGraphV2 && recapEntryId) {
          // 预留：与 CEO Heavy Layer 对齐（未来可把高价值 recap 与 consolidation summary/任务节点建边）
          await firstValueFrom(
            this.apiRpc
              .send('memory.graph.addEdge', {
                companyId,
                actor,
                fromEntryId: recapEntryId,
                toEntryId: null,
                edgeType: 'caused_by',
                metadata: {
                  roomId,
                  threadId,
                  sourceEventType: event.eventType,
                  sourceEventId: event.eventId,
                  ...(projectId ? { projectId } : {}),
                },
              })
              .pipe(timeout(this.config.getApiRpcTimeoutMs())),
          ).catch(() => undefined);
        }

        for (const p of recapParsed.errorPattern) {
          this.monitoring.setExperienceFailurePatternFrequency(p.category, p.frequency);
        }

        const recapEvent: ExperienceRecapGeneratedEvent = {
          eventId: randomUUID(),
          eventType: 'experience.recap.generated',
          aggregateId: recapParsed.recapId,
          aggregateType: 'experience_recap',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId,
          data: {
            recapId: recapParsed.recapId,
            discussionId: recapParsed.discussionId,
            companyId,
            outcome: recapParsed.outcome,
            policySuggestions: recapParsed.policySuggestions,
            recap: recapParsed as unknown as Record<string, unknown>,
            generatedAt: new Date().toISOString(),
          },
          metadata: {
            roomId,
            threadId,
            sourceEventType: event.eventType,
            sourceEventId: event.eventId,
          },
        };

        await this.messaging.publish(recapEvent, {
          routingKey: recapEvent.eventType,
          persistent: true,
        });

        const elapsedMs = Date.now() - startedAt;
        this.monitoring.recordExperienceRecapGenerated(recapParsed.outcome, elapsedMs);
        this.breaker.recordSuccess();
      } catch (e: unknown) {
        this.monitoring.recordExperienceRecapGenerated('failure', Date.now() - startedAt);
        this.breaker.recordFailure();
        this.logger.error('Experience learning failed', {
          companyId,
          roomId,
          threadId,
          message: e instanceof Error ? e.message : String(e),
          elapsedMs: Date.now() - startedAt,
        });
      } finally {
        this.limiter.exit();
      }
    });
  }

  private async fetchRecentMessages(
    companyId: string,
    actor: { id: string; roles: string[] },
    roomId: string,
    max: number,
  ): Promise<ChatMessageShape[]> {
    const out: ChatMessageShape[] = [];
    let beforeSeq: number | undefined;
    while (out.length < max) {
      const page = await firstValueFrom(
        this.apiRpc
          .send<{ items: ChatMessageShape[]; hasMore: boolean }>('collaboration.messages.list', {
            companyId,
            actor,
            roomId,
            limit: Math.min(60, max - out.length),
            beforeSeq,
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      const items = page?.items ?? [];
      if (!items.length) break;
      out.push(...items);
      const firstSeq = Number((items[0] as any)?.seq ?? 0);
      beforeSeq = Number.isFinite(firstSeq) && firstSeq > 1 ? firstSeq : 1;
      if (!page.hasMore || beforeSeq <= 1) break;
    }
    return out.slice(-max);
  }

  private buildAnalysisPrompt(input: {
    roomId: string;
    threadId: string;
    summary: string;
    messages: Array<{ senderType: string; senderId?: string; content: string; createdAt?: string }>;
  }): string {
    return `你是一个经验提炼专家。请从以下讨论收敛信息中提取结构化复盘（严格 JSON 输出，不要解释，不要 Markdown，不要多余字段）。

背景:
- roomId: ${input.roomId}
- threadId: ${input.threadId}
- summary: ${input.summary || ''}

讨论消息（按时间顺序，已截断）:
${JSON.stringify(input.messages).slice(0, 15000)}

输出必须符合 schema:
{
  "outcome": "success|partial_success|failure|timeout",
  "errorPatterns": [
    { "category": "hallucination|tool_misuse|approval_loop|budget_exceed|context_loss|other", "description": "...", "frequency": 1, "rootCause": "..." }
  ],
  "summary": "关键决策与结果摘要",
  "lessons": ["..."],
  "suggestions": [{ "policyKey": "...", "suggestedValue": null, "reason": "...", "confidence": 0.5 }]
}`;
  }

  private parseStrictJson(text: string): unknown {
    const trimmed = (text || '').trim();
    if (!trimmed) throw new Error('empty_llm_output');
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const slice = trimmed.slice(start, end + 1);
        return JSON.parse(slice);
      }
      throw new Error('invalid_json_llm_output');
    }
  }

  private buildEmbeddingFriendlyContent(recap: any): string {
    const lines: string[] = [];
    lines.push(`RecapId: ${String(recap.recapId ?? '')}`);
    lines.push(`TraceId: ${String(recap.traceId ?? '')}`);
    lines.push(`DiscussionId: ${String(recap.discussionId ?? '')}`);
    lines.push(`Outcome: ${String(recap.outcome ?? '')}`);
    if (recap.goal) lines.push(`Goal: ${String(recap.goal)}`);
    if (recap.decisionSummary) lines.push(`DecisionSummary: ${String(recap.decisionSummary)}`);
    const lessons = Array.isArray(recap.lessonsLearned) ? recap.lessonsLearned : [];
    if (lessons.length) {
      lines.push('LessonsLearned:');
      for (const l of lessons.slice(0, 12)) lines.push(`- ${String(l)}`);
    }
    const errors = Array.isArray(recap.errorPattern) ? recap.errorPattern : [];
    if (errors.length) {
      lines.push('ErrorPatterns:');
      for (const p of errors.slice(0, 12)) {
        lines.push(
          `- [${String(p.category)}] ${String(p.description)} (freq=${Number(p.frequency ?? 1)})`,
        );
      }
    }
    const sugg = Array.isArray(recap.policySuggestions) ? recap.policySuggestions : [];
    if (sugg.length) {
      lines.push('PolicySuggestions:');
      for (const s of sugg.slice(0, 12)) {
        lines.push(
          `- ${String(s.policyKey)} => ${JSON.stringify(s.suggestedValue)} (conf=${Number(
            s.confidence ?? 0,
          )}) reason=${String(s.reason ?? '')}`,
        );
      }
    }
    return lines.join('\n');
  }
}

class SimpleCircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  constructor(private readonly cfg: { failureThreshold: number; openMs: number }) {}
  canExecute(): boolean {
    return Date.now() >= this.openUntil;
  }
  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }
  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.cfg.failureThreshold) {
      this.openUntil = Date.now() + this.cfg.openMs;
    }
  }
}

class SimpleRateLimiter {
  private inFlight = 0;
  private windowStart = Date.now();
  private windowCount = 0;
  constructor(
    private readonly cfg: { maxConcurrent: number; maxPerWindow: number; windowMs: number },
  ) {}
  tryEnter(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= this.cfg.windowMs) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (this.inFlight >= this.cfg.maxConcurrent) return false;
    if (this.windowCount >= this.cfg.maxPerWindow) return false;
    this.inFlight += 1;
    this.windowCount += 1;
    return true;
  }
  exit(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }
}

