import { HttpException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { MemorySummaryGeneratedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

export interface SummarizeInput {
  texts: string[];
  context?: string;
  /** 结构化输出：决策要点 / 行动项 / 经验教训 */
  structured?: boolean;
  companyId?: string;
  source?: 'rpc' | 'room' | 'manual';
  roomId?: string;
}

@Injectable()
export class MemorySummarizerService {
  private readonly logger = new Logger(MemorySummarizerService.name);
  private capDay = '';
  private capCount = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * 生成摘要；未配置 OPENAI_API_KEY 时返回拼接截断文本
   */
  async summarize(input: SummarizeInput): Promise<{ summary: string }> {
    const key = this.config.getMemoryConfig().openaiApiKey;
    const body = input.texts.join('\n---\n').slice(0, 12000);
    if (key) {
      this.assertSummaryQuota();
    }
    if (!key) {
      const s =
        body.slice(0, 2000) + (body.length > 2000 ? '…' : '');
      await this.maybePublishSummaryEvent(input, s.length);
      return { summary: s };
    }
    try {
      const base = this.config
        .getMemoryConfig()
        .openaiBaseUrl.replace(/\/$/, '');
      const system = input.structured
        ? 'You produce compact structured summaries with sections: 决策要点, 行动项, 经验教训. Use the same language as the source text.'
        : 'You summarize internal company memory snippets into concise bullet points in the same language as the source.';
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: system,
            },
            {
              role: 'user',
              content: `${input.context ?? ''}\n\n---\n${body}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        this.logger.warn('summarize LLM failed', { status: res.status, t: t.slice(0, 400) });
        const s = body.slice(0, 2000);
        await this.maybePublishSummaryEvent(input, s.length);
        return { summary: s };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const summary = json?.choices?.[0]?.message?.content?.trim();
      const out = summary || body.slice(0, 2000);
      await this.maybePublishSummaryEvent(input, out.length);
      return { summary: out };
    } catch (e: any) {
      this.logger.warn('summarize error', { message: e?.message });
      const s = body.slice(0, 2000);
      await this.maybePublishSummaryEvent(input, s.length);
      return { summary: s };
    }
  }

  private assertSummaryQuota(): void {
    const cap = this.config.getMemoryConfig().summaryDailyCap;
    if (!cap || cap <= 0) return;
    const day = new Date().toISOString().slice(0, 10);
    if (this.capDay !== day) {
      this.capDay = day;
      this.capCount = 0;
    }
    this.capCount += 1;
    if (this.capCount > cap) {
      throw new HttpException(
        {
          code: 'MEMORY_SUMMARY_DAILY_CAP',
          message: '已达到今日记忆总结 LLM 调用上限（MEMORY_SUMMARY_DAILY_CAP）',
        },
        429,
      );
    }
  }

  private async maybePublishSummaryEvent(
    input: SummarizeInput,
    summaryLength: number,
  ): Promise<void> {
    if (!input.companyId) return;
    try {
      const event: MemorySummaryGeneratedEvent = {
        eventId: randomUUID(),
        eventType: 'memory.summary.generated',
        aggregateId: input.companyId,
        aggregateType: 'memory_summary',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: input.companyId,
        data: {
          companyId: input.companyId,
          source: input.source ?? 'manual',
          summaryLength,
          chunkCount: input.texts?.length,
          generatedAt: new Date().toISOString(),
          roomId: input.roomId,
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'memory.summary.generated',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish memory.summary.generated failed', {
        message: e?.message,
      });
    }
  }
}
