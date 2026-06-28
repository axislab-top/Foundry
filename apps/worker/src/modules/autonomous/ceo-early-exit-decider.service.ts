import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  evaluateAutonomousGraphEarlyExit,
  type CeoSupervisorState,
  type EarlyExitDecision,
} from '@service/ai';
import { ConfigService } from '../../common/config/config.service.js';
import { CeoNaturalReplyGeneratorService } from '../collaboration/ceo-natural-reply-generator.service.js';
import { ceoPlanSchema } from './ceo-plan.schema.js';

@Injectable()
export class CeoEarlyExitDeciderService {
  private readonly logger = new Logger(CeoEarlyExitDeciderService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(forwardRef(() => CeoNaturalReplyGeneratorService))
    private readonly naturalReplyGenerator: CeoNaturalReplyGeneratorService | undefined,
  ) {}

  async decide(state: CeoSupervisorState): Promise<EarlyExitDecision | null> {
    if (!this.config.isCeoEarlyExitEnabled()) return null;

    let rawPlan: unknown = {};
    try {
      rawPlan = JSON.parse(state.planResultJson || '{}');
    } catch {
      rawPlan = {};
    }
    const planParsed = ceoPlanSchema.safeParse(rawPlan);
    if (!planParsed.success) {
      return { canEarlyExit: false, confidence: 0, suggestedReply: '', reason: 'plan_parse_failed', routeTag: 'none' };
    }
    const plan = planParsed.data;

    let ctx: Record<string, unknown> = {};
    try {
      ctx = JSON.parse(state.contextBundle || '{}') as Record<string, unknown>;
    } catch {
      ctx = {};
    }
    const memArr = Array.isArray(ctx.memorySearch) ? ctx.memorySearch : [];

    const ev = evaluateAutonomousGraphEarlyExit({
      earlyExitEnabled: true,
      confidenceThreshold: this.config.getEarlyExitConfidenceThreshold(),
      runKind: state.runKind,
      goal: state.goal ?? '',
      planTasksLength: plan.tasks?.length ?? 0,
      requiresHumanApproval: Boolean(plan.requiresHumanApproval),
      memoryHits: memArr,
    });

    if (!ev.canEarlyExit) {
      return {
        canEarlyExit: false,
        confidence: ev.confidence,
        suggestedReply: '',
        reason: ev.reason,
        routeTag: ev.routeTag,
      };
    }

    if (!this.naturalReplyGenerator) {
      this.logger.warn('CEO early-exit: CeoNaturalReplyGenerator unavailable', { traceId: state.traceId });
      return {
        canEarlyExit: false,
        confidence: ev.confidence,
        suggestedReply: '',
        reason: 'natural_reply_generator_missing',
        routeTag: ev.routeTag,
      };
    }

    const roomId = state.collaborationRoomId?.trim() || '';
    const userText =
      state.runKind === 'breakdown' && state.goal?.trim()
        ? state.goal.trim()
        : String(plan.summary ?? '').trim().slice(0, 2000) || '（本轮自治上下文摘要）';

    const reply = await this.naturalReplyGenerator.generateNaturalReply({
      companyId: state.companyId,
      roomId,
      messageId: state.triggerRef?.trim() || state.traceId,
      threadId: null,
      userText,
      ceoAgentId: state.ceoAgentId?.trim() || null,
      memory: { memoryHits: memArr as any },
    });

    const text = String(reply ?? '').trim();
    if (!text) {
      return {
        canEarlyExit: false,
        confidence: ev.confidence,
        suggestedReply: '',
        reason: 'natural_reply_empty',
        routeTag: ev.routeTag,
      };
    }

    return {
      canEarlyExit: true,
      confidence: ev.confidence,
      suggestedReply: text,
      reason: ev.reason,
      routeTag: ev.routeTag,
    };
  }
}
