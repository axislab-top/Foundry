import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { SkillExecutedEvent } from '@contracts/events';
import { MemoryService } from '../services/memory.service.js';
import { agentNamespace } from '../utils/memory-namespace.js';

/** Skill 执行结果沉淀到 Agent 命名空间记忆 */
@Injectable()
export class SkillExecutedMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(SkillExecutedMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<SkillExecutedEvent>(
      'skill.executed',
      this.handle.bind(this),
      {
        queue: 'api-skill-executed-memory',
        durable: true,
        prefetchCount: 30,
      },
    );
  }

  private async handle(event: SkillExecutedEvent): Promise<void> {
    const companyId =
      resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;

    const resultText = safeJson(event.data.resultSummary);
    const argsText = safeJson(event.data.argsSummary);
    const content = [
      `Skill: ${event.data.skillName}`,
      argsText ? `Args: ${argsText}` : '',
      resultText ? `Result: ${resultText}` : '',
      event.data.durationMs != null ? `DurationMs: ${event.data.durationMs}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (!content.trim()) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.memory.storeEntry({
          companyId,
          namespace: agentNamespace(event.data.agentId),
          collectionLabel: `Agent ${event.data.agentId}`,
          content,
          sourceType: 'skill',
          metadata: {
            skillId: event.data.skillId,
            skillName: event.data.skillName,
            traceId: event.data.traceId,
            executedAt: event.data.executedAt,
          },
          skipAccessCheck: true,
        });
      } catch (e: any) {
        this.logger.warn('skill memory store failed', {
          message: e?.message,
          skillName: event.data.skillName,
        });
      }
    });
  }
}

function safeJson(v: unknown): string {
  if (v == null) return '';
  try {
    return JSON.stringify(v).slice(0, 8000);
  } catch {
    return String(v);
  }
}
