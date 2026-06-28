import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageProcessingDecision } from '../entities/message-processing-decision.entity.js';
import type { MessageActionDecision, MessageSemanticProfile } from './message-processing.types.js';

@Injectable()
export class MessageProcessingDecisionService {
  readonly policyVersion = 'v2';

  constructor(
    @InjectRepository(MessageProcessingDecision)
    private readonly repo: Repository<MessageProcessingDecision>,
  ) {}

  async record(params: {
    companyId: string;
    messageId: string;
    roomId: string;
    correlationId?: string | null;
    traceId?: string | null;
    profile: MessageSemanticProfile;
    decisions: MessageActionDecision[];
  }): Promise<void> {
    const now = new Date();
    const rows = params.decisions.map((decision) =>
      this.repo.create({
        companyId: params.companyId,
        messageId: params.messageId,
        roomId: params.roomId,
        correlationId: params.correlationId ?? null,
        traceId: params.traceId ?? null,
        policyVersion: this.policyVersion,
        action: decision.action,
        decision: decision.allow ? 'allow' : 'deny',
        reasonCodes: decision.reasonCodes,
        profile: {
          messageKind: params.profile.messageKind,
          intentCategory: params.profile.intentCategory,
          contentLength: params.profile.contentLength,
          hasMentions: params.profile.hasMentions,
          hasTaskIntent: params.profile.hasTaskIntent,
          isIndexable: params.profile.isIndexable,
          isEligibleForReceivedEvent: params.profile.isEligibleForReceivedEvent,
          reasons: params.profile.reasons,
        },
        createdAt: now,
      }),
    );
    await this.repo.save(rows);
  }
}
