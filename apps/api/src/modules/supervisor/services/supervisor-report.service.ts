import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoom } from '../../collaboration/entities/chat-room.entity.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { MemoryService } from '../../memory/services/memory.service.js';
import { SUPERVISOR_LESSON_NAMESPACE } from '@foundry/supervisor-core';
import { SupervisorMetricsService } from './supervisor-metrics.service.js';

@Injectable()
export class SupervisorReportService {
  private readonly logger = new Logger(SupervisorReportService.name);

  constructor(
    @InjectRepository(ChatRoom) private readonly roomsRepo: Repository<ChatRoom>,
    private readonly metrics: SupervisorMetricsService,
    private readonly chatMessages: ChatMessageService,
    private readonly memory: MemoryService,
  ) {}

  async publishDailyReport(companyId: string, kind: 'daily' | 'weekly'): Promise<{ posted: boolean }> {
    const slice = await this.metrics.getRetrospectiveSlice(companyId);
    const title = kind === 'daily' ? '复盘日报' : '复盘周报';
    const body = [
      `## ${title}`,
      `- 近7日失败运行: ${slice.failedRuns7d}`,
      `- 近7日已回灌教训(记忆): ${slice.lessonsIngested7d}`,
      `- 重复失败模式数: ${slice.repeatFailurePatterns7d}`,
      `- 重复失败率(粗估): ${(slice.repeatFailureRate7d * 100).toFixed(1)}%`,
    ].join('\n');

    try {
      await this.memory.storeEntry({
        companyId,
        namespace: SUPERVISOR_LESSON_NAMESPACE,
        collectionLabel: title,
        content: body,
        sourceType: 'summary',
        skipAccessCheck: true,
        metadata: { kind: 'supervisor_report', reportKind: kind, generatedAt: new Date().toISOString() },
      });
    } catch (e: unknown) {
      this.logger.warn('memory archive for supervisor report failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    const room = await this.roomsRepo.findOne({
      where: { companyId, roomType: 'main' },
      order: { createdAt: 'ASC' },
    });
    if (!room?.id || !room.createdBy) {
      return { posted: false };
    }
    await this.chatMessages.appendSystemMessageAsActor(companyId, room.id, room.createdBy, body, {
      kind: 'supervisor_report',
      reportKind: kind,
    });
    return { posted: true };
  }
}
