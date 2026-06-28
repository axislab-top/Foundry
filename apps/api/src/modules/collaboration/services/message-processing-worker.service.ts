import { Injectable, Logger } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { randomUUID } from 'crypto';
import type {
  CollaborationMemoryIndexRequestedEvent,
  CollaborationMentionRoutedEvent,
  CollaborationTaskExtractedEvent,
} from '@contracts/events';
import { MessageProcessingJobService } from './message-processing-job.service.js';
import { CollaborationMessageInboundPublisherService } from './collaboration-message-inbound-publisher.service.js';
import { ChatRoomService } from './chat-room.service.js';
import { ChatMessageService } from './chat-message.service.js';
import { MessageActionCandidateService } from './message-action-candidate.service.js';
import { TaskIntentCandidateService } from './task-intent-candidate.service.js';

@Injectable()
export class MessageProcessingWorkerService {
  private readonly logger = new Logger(MessageProcessingWorkerService.name);

  constructor(
    private readonly jobs: MessageProcessingJobService,
    private readonly messaging: MessagingService,
    private readonly inboundPublisher: CollaborationMessageInboundPublisherService,
    private readonly rooms: ChatRoomService,
    private readonly messages: ChatMessageService,
    private readonly actionCandidates: MessageActionCandidateService,
    private readonly taskIntentCandidates: TaskIntentCandidateService,
  ) {}

  async processOnce(limit = 50): Promise<{ processed: number }> {
    const pending = await this.jobs.listPending(limit);
    let processed = 0;
    for (const job of pending) {
      try {
        await this.handleJob(job.jobType, job.payload ?? {});
        await this.jobs.markSucceeded(job);
        processed += 1;
      } catch (error) {
        this.logger.warn('message_processing_job.failed', {
          jobId: job.id,
          jobType: job.jobType,
          err: error instanceof Error ? error.message : String(error),
        });
        await this.jobs.markFailed(job, error);
      }
    }
    return { processed };
  }

  private async handleJob(jobType: string, payload: Record<string, unknown>): Promise<void> {
    if (jobType === 'publish_received') {
      await this.publishReceived(payload);
      return;
    }
    if (jobType === 'extract_task_candidates') {
      await this.publishTaskExtracted(payload);
      return;
    }
    if (jobType === 'route_mentions') {
      await this.publishMentionRouted(payload);
      return;
    }
    if (jobType === 'request_memory_index') {
      await this.publishMemoryIndexRequested(payload);
      return;
    }
    throw new Error(`Unsupported job type: ${jobType}`);
  }

  private async publishReceived(payload: Record<string, unknown>): Promise<void> {
    const companyId = String(payload.companyId ?? '');
    const message = await this.loadMessage(payload);
    await this.inboundPublisher.publishMessageReceived(companyId, message);
  }

  private async publishTaskExtracted(payload: Record<string, unknown>): Promise<void> {
    const companyId = String(payload.companyId ?? '');
    const actionCandidateId = typeof payload.actionCandidateId === 'string' ? payload.actionCandidateId : '';
    const message = await this.loadMessage(payload);
    const room = await this.rooms.findOneOrFail(companyId, String(payload.roomId));
    const actionCandidate = actionCandidateId
      ? await this.actionCandidates.findById(companyId, actionCandidateId)
      : null;
    const taskIntent = await this.taskIntentCandidates.draftFromMessage({
      companyId,
      roomId: room.id,
      message,
      actionCandidate,
    });

    if (actionCandidate) {
      await this.actionCandidates.markExecuted(actionCandidate);
    }

    if (taskIntent.status === 'needs_clarification') {
      await this.messages.patchMessageMetadata(companyId, message.id, {
        processingStatus: {
          stage: 'task_candidate_detected',
          mode: 'task_execution',
          status: 'needs_clarification',
          taskIntentCandidateId: taskIntent.id,
          clarificationPrompt: taskIntent.readiness.clarificationPrompt,
          missingFields: taskIntent.readiness.missingFields,
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    const event = this.baseEvent('collaboration.task.extracted', payload, {
      aggregateId: taskIntent.id,
      aggregateType: 'chat_room',
      data: {
        roomId: room.id,
        sourceMessageId: message.id,
        title: taskIntent.specDraft.title ?? message.content.split('\n')[0]!.slice(0, 500),
        description: taskIntent.specDraft.description ?? message.content.slice(0, 4000),
        extractedAt: new Date().toISOString(),
      },
    });
    await this.messaging.publish(event as CollaborationTaskExtractedEvent, { routingKey: 'collaboration.task.extracted', persistent: true });
  }

  private async publishMentionRouted(payload: Record<string, unknown>): Promise<void> {
    const message = await this.loadMessage(payload);
    const mentionedAgentIds = this.extractStringArray(message.metadata?.mentionedAgentIds);
    if (mentionedAgentIds.length === 0) return;
    const event = this.baseEvent<CollaborationMentionRoutedEvent>('collaboration.mention.routed', payload, {
      aggregateId: message.id,
      aggregateType: 'chat_message',
      data: {
        messageId: message.id,
        roomId: message.roomId,
        mentionedAgentIds,
        routedAt: new Date().toISOString(),
      },
    });
    await this.messaging.publish(event, { routingKey: 'collaboration.mention.routed', persistent: true });
  }

  private async publishMemoryIndexRequested(payload: Record<string, unknown>): Promise<void> {
    const message = await this.loadMessage(payload);
    const room = await this.rooms.findOneOrFail(String(payload.companyId), String(payload.roomId));
    const indexable = this.isIndexableMessage(message.content, message.messageType, message.senderType);
    if (!indexable) return;
    const event = this.baseEvent<CollaborationMemoryIndexRequestedEvent>('collaboration.memory.index.requested', payload, {
      aggregateId: message.id,
      aggregateType: 'chat_message',
      data: {
        messageId: message.id,
        roomId: room.id,
        requestedAt: new Date().toISOString(),
      },
    });
    await this.messaging.publish(event as CollaborationMemoryIndexRequestedEvent, { routingKey: 'collaboration.memory.index.requested', persistent: true });
  }

  private async loadMessage(payload: Record<string, unknown>) {
    const companyId = String(payload.companyId ?? '');
    const messageId = String(payload.messageId ?? '');
    if (!companyId || !messageId) throw new Error('Missing companyId or messageId in job payload');
    return this.messages.findMessageById(companyId, messageId);
  }

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  }

  private isIndexableMessage(content: string, messageType: string, senderType: string): boolean {
    const text = content.trim();
    if (!text) return false;
    if (messageType === 'stream_chunk') return false;
    if (senderType === 'agent') return false;
    if (text.length < 6) return false;
    return !/^([.。!！?？,，\s]*)$/.test(text);
  }

  private baseEvent<T extends { eventId: string; eventType: string; aggregateId: string; aggregateType: string; occurredAt: string; version: number; companyId?: string; data: Record<string, unknown> }>(
    eventType: string,
    payload: Record<string, unknown>,
    overrides?: Partial<Pick<T, 'aggregateId' | 'aggregateType' | 'data'>>,
  ): T {
    const companyId = String(payload.companyId ?? '');
    return {
      eventId: randomUUID(),
      eventType,
      aggregateId: overrides?.aggregateId ?? String(payload.messageId ?? payload.roomId ?? randomUUID()),
      aggregateType: overrides?.aggregateType ?? 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: overrides?.data ?? payload,
    } as T;
  }
}
