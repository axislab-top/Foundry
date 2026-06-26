import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CollaborationIntentDecisionV20261,
  CollaborationProgramRecord,
  IntentDecision,
} from '@contracts/types';
import {
  NextStep,
  type LightStructuredOutputV2,
} from '@foundry/contracts/types/collaboration';
import { nextPhaseAfterBriefComplete, programPhaseLabel } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
} from '../pipeline-v2/collaboration-pipeline-v2.types.js';
import type { CollaborationMainRoomIntentService } from '../pipeline-v2/main-room-intent.service.js';
import type { CollaborationMainRoomOrchestrationService } from '../pipeline-v2/main-room-orchestration.service.js';
import {
  lazyCollaborationMainRoomIntentService,
  lazyCollaborationMainRoomOrchestrationService,
} from '../pipeline-v2/pipeline-v2.forward-ref.js';
import { CollaborationProgramClientService } from './collaboration-program-client.service.js';
import {
  buildMergedBriefFromTurn,
  isBriefComplete,
  isDeliverableIntentText,
} from './deliverable-brief.extractor.js';
import { applyCommitmentGuard } from './commitment-guard.util.js';
import { classifyProgramTurn } from './program-turn.classifier.js';
import { CollaborationRoomModeSyncService } from '../collaboration-room-mode-sync.service.js';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';

@Injectable()
export class MainRoomProgramOrchestrator {
  private readonly logger = new Logger(MainRoomProgramOrchestrator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly programClient: CollaborationProgramClientService,
    private readonly directReply: DirectCollabReplyService,
    @Inject(forwardRef(lazyCollaborationMainRoomIntentService))
    private readonly intent: CollaborationMainRoomIntentService,
    @Inject(forwardRef(lazyCollaborationMainRoomOrchestrationService))
    private readonly orchestration: CollaborationMainRoomOrchestrationService,
    private readonly roomModeSync: CollaborationRoomModeSyncService,
  ) {}

  isEnabled(): boolean {
    return this.config.isCollabProgramSsotEnabled();
  }

  async run(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
    traceId: string;
  }): Promise<CollaborationPipelineV2RunResult | null> {
    if (!this.isEnabled()) return null;
    if (params.roomContext.roomType !== 'main') return null;

    const { input, roomContext, intentDecision2026, intentDecision2026_1, traceId } = params;
    let program = await this.programClient.getActive({
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId,
    });

    const turn = classifyProgramTurn({
      userText: input.contentText,
      confirmationIntent: input.confirmationIntent,
      userConfirmedExecution: input.userConfirmedExecution,
      userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
      activeProgram: program,
      mentionedAgentIds: input.mentionedAgentIds,
    });

    this.logger.log('main_room_program.turn', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      turn,
      programPhase: program?.phase ?? null,
    });

    if (turn === 'deliverable_intake' && !program) {
      const briefPatch = buildMergedBriefFromTurn({ userText: input.contentText });
      program = await this.programClient.createIntake({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
        sourceMessageId: input.messageId,
        brief: briefPatch,
        metadata: { traceId, turn },
      });
      program = await this.programClient.transition({
        companyId: input.companyId,
        programId: program.id,
        toPhase: 'aligning',
      });
      if (!isBriefComplete(program.brief)) {
        const missing = program.brief.missingFields.join('、') || '关键参数';
        const briefLabel = program.brief.title ?? program.brief.deliverableType;
        const askText = applyCommitmentGuard({
          phase: program.phase,
          proposedText: `收到。为启动「${briefLabel}」，还需补充：${missing}。请一并说明。`,
          briefSummary: program.brief.title ?? null,
        });
        await this.replyCeo({ input, text: askText, traceId, program, intentDecision2026_1 });
        return this.buildProgramResult(program, intentDecision2026, intentDecision2026_1, 'program_intake', {
          inlineReplyHandled: true,
        });
      }
      return this.advanceToPlanning({
        input,
        roomContext,
        program,
        intentDecision2026,
        intentDecision2026_1,
        traceId,
      });
    }

    if (turn === 'cancel' && program) {
      program = await this.programClient.transition({
        companyId: input.companyId,
        programId: program.id,
        toPhase: 'cancelled',
      });
      await this.replyCeo({
        input,
        text: '已取消当前交付计划。如需重新开始，请直接描述新的目标。',
        traceId,
        program,
        intentDecision2026_1,
      });
      return this.buildProgramResult(program, intentDecision2026, intentDecision2026_1, 'program_cancelled', {
        inlineReplyHandled: true,
      });
    }

    if ((turn === 'fill_brief' || turn === 'revise_scope') && program) {
      const merged = buildMergedBriefFromTurn({
        userText: input.contentText,
        prior: program.brief,
      });
      program = await this.programClient.transition({
        companyId: input.companyId,
        programId: program.id,
        toPhase: program.phase === 'intake' ? 'aligning' : program.phase,
        patch: { brief: merged, metadata: { lastMessageId: input.messageId } },
      });

      if (isBriefComplete(program.brief)) {
        return this.advanceToPlanning({
          input,
          roomContext,
          program,
          intentDecision2026,
          intentDecision2026_1,
          traceId,
        });
      }

      const missing = program.brief.missingFields.join('、') || '关键参数';
      const askText = applyCommitmentGuard({
        phase: program.phase,
        proposedText: `已记录。为启动「${program.brief.title ?? program.brief.deliverableType}」，还需补充：${missing}。请一并说明。`,
        briefSummary: program.brief.title ?? null,
      });
      await this.replyCeo({ input, text: askText, traceId, program, intentDecision2026_1 });
      return this.buildProgramResult(program, intentDecision2026, intentDecision2026_1, 'program_aligning', {
        inlineReplyHandled: true,
      });
    }

    if (turn === 'confirm' && program) {
      if (program.phase === 'pending_confirm') {
        program = await this.programClient.transition({
          companyId: input.companyId,
          programId: program.id,
          toPhase: 'ready_to_plan',
        });
      }
      if (['ready_to_plan', 'pending_confirm', 'aligning'].includes(program.phase)) {
        return this.advanceToPlanning({
          input,
          roomContext,
          program,
          intentDecision2026,
          intentDecision2026_1,
          traceId,
        });
      }
    }

    if (turn === 'complaint_gap' && program) {
      const gapText = this.buildComplaintGapReply(program);
      await this.replyCeo({
        input,
        text: applyCommitmentGuard({
          phase: program.phase,
          proposedText: gapText,
          briefSummary: program.brief.title ?? program.brief.deliverableType,
        }),
        traceId,
        program,
        intentDecision2026_1,
      });

      if (
        isBriefComplete(program.brief) &&
        ['aligning', 'ready_to_plan', 'pending_confirm'].includes(program.phase)
      ) {
        return this.advanceToPlanning({
          input,
          roomContext,
          program,
          intentDecision2026,
          intentDecision2026_1,
          traceId,
        });
      }
      return this.buildProgramResult(program, intentDecision2026, intentDecision2026_1, 'program_complaint', {
        inlineReplyHandled: true,
      });
    }

    if (turn === 'consult_director') {
      return null;
    }

    if (!program && isDeliverableIntentText(input.contentText)) {
      const briefPatch = buildMergedBriefFromTurn({ userText: input.contentText });
      program = await this.programClient.createIntake({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
        sourceMessageId: input.messageId,
        brief: briefPatch,
        metadata: { traceId, turn: 'deliverable_intake_fallback' },
      });
      program = await this.programClient.transition({
        companyId: input.companyId,
        programId: program.id,
        toPhase: 'aligning',
      });
      if (!isBriefComplete(program.brief)) {
        const missing = program.brief.missingFields.join('、') || '关键参数';
        const askText = applyCommitmentGuard({
          phase: program.phase,
          proposedText: `收到。为启动交付任务，还需补充：${missing}。请一并说明。`,
          briefSummary: program.brief.title ?? null,
        });
        await this.replyCeo({ input, text: askText, traceId, program, intentDecision2026_1 });
        return this.buildProgramResult(program, intentDecision2026, intentDecision2026_1, 'program_intake', {
          inlineReplyHandled: true,
        });
      }
      return this.advanceToPlanning({
        input,
        roomContext,
        program,
        intentDecision2026,
        intentDecision2026_1,
        traceId,
      });
    }

    return null;
  }

  private buildComplaintGapReply(program: CollaborationProgramRecord): string {
    const phaseLabel = programPhaseLabel(program.phase);
    const missing = program.brief.missingFields.filter(Boolean);
    if (program.phase === 'dept_executing' || program.phase === 'dispatching') {
      return `当前处于「${phaseLabel}」，部门已在执行链路中。你可以在右侧 Program 面板查看进展；若需加急请说明优先级。`;
    }
    if (missing.length > 0) {
      return `当前处于「${phaseLabel}」，尚未派发是因为还缺：${missing.join('、')}。补齐后系统会自动生成计划并下发。`;
    }
    if (program.phase === 'planning') {
      return `当前处于「${phaseLabel}」，正在生成跨部门执行计划，请稍候。`;
    }
    return `当前处于「${phaseLabel}」。我会继续推进到可派发状态；你也可以直接补充要求。`;
  }

  private async advanceToPlanning(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    program: CollaborationProgramRecord;
    intentDecision2026: CollaborationIntentDecision2026;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
    traceId: string;
  }): Promise<CollaborationPipelineV2RunResult> {
    let { program } = params;
    const confirmMode = this.config.getCollabProgramConfirmMode();
    if (program.phase === 'aligning' || program.phase === 'intake') {
      const next = nextPhaseAfterBriefComplete(confirmMode);
      program = await this.programClient.transition({
        companyId: params.input.companyId,
        programId: program.id,
        toPhase: next,
      });
      if (next === 'pending_confirm') {
        const confirmText = applyCommitmentGuard({
          phase: 'pending_confirm',
          proposedText: `参数已齐：${this.briefSummaryLine(program)}。请回复「确认执行」或点击 Program 卡片确认，我将生成执行计划并派发部门。`,
          briefSummary: this.briefSummaryLine(program),
        });
        await this.replyCeo({
          input: params.input,
          text: confirmText,
          traceId: params.traceId,
          program,
          intentDecision2026_1: params.intentDecision2026_1,
        });
        return this.buildProgramResult(
          program,
          params.intentDecision2026,
          params.intentDecision2026_1,
          'program_pending_confirm',
          { inlineReplyHandled: true },
        );
      }
    }

    program = await this.programClient.transition({
      companyId: params.input.companyId,
      programId: program.id,
      toPhase: 'planning',
    });

    const legacyIntent = this.intent.buildLegacyIntentDecisionFromUnifiedPipeline({
      input: params.input,
      layerDecision: {
        ...params.intentDecision2026,
        routingHints: {
          ...params.intentDecision2026.routingHints,
          shouldExecute: true,
          responseMode: 'execute_then_reply',
        },
      },
      unified: params.intentDecision2026_1,
      flags: { authorizedHeavyExecution: true },
    });

    const enrichedInput: CollaborationPipelineV2RunInput = {
      ...params.input,
      contentText: this.buildPlanningUserText(params.input.contentText, program),
      messageMetadata: {
        ...(params.input.messageMetadata ?? {}),
        collaborationProgramId: program.id,
        collaborationProgramPhase: program.phase,
        collaborationProgramBriefSummary: this.briefSummaryLine(program),
      },
    };

    program = await this.programClient.transition({
      companyId: params.input.companyId,
      programId: program.id,
      toPhase: 'dispatching',
    });

    await this.roomModeSync.syncToExecutionIfEnabled({
      companyId: params.input.companyId,
      roomId: params.input.roomId,
      changeReason: 'program_advance_to_planning',
    });

    const dispatchResult = await this.orchestration.runMainRoomDispatchPlanPath({
      input: enrichedInput,
      roomContext: params.roomContext,
      intentDecision: legacyIntent,
      intentDecision2026: params.intentDecision2026,
      intentDecision2026_1: params.intentDecision2026_1,
      traceId: params.traceId,
      autoFlush: true,
    });

    const failedRoutes = new Set([
      'dispatch_plan_failed',
      'dispatch_compile_failed',
      'dispatch_assign_failed',
    ]);
    if (failedRoutes.has(dispatchResult.routePath)) {
      program = await this.programClient.transition({
        companyId: params.input.companyId,
        programId: program.id,
        toPhase: 'planning',
        patch: {
          metadata: {
            dispatchRoutePath: dispatchResult.routePath,
            lastPlanningMessageId: params.input.messageId,
          },
        },
      });
      return {
        ...dispatchResult,
        output: {
          ...dispatchResult.output,
          payload: {
            ...(typeof dispatchResult.output?.payload === 'object' ? dispatchResult.output.payload : {}),
            collaborationProgram: program,
            inlineReplyHandled: false,
          },
        },
      };
    }

    program = await this.programClient.transition({
      companyId: params.input.companyId,
      programId: program.id,
      toPhase: 'dept_executing',
      patch: {
        metadata: {
          dispatchRoutePath: dispatchResult.routePath,
          lastPlanningMessageId: params.input.messageId,
        },
      },
    });

    return {
      ...dispatchResult,
      output: {
        ...dispatchResult.output,
        payload: {
          ...(typeof dispatchResult.output?.payload === 'object' ? dispatchResult.output.payload : {}),
          collaborationProgram: program,
        },
      },
    };
  }

  private briefSummaryLine(program: CollaborationProgramRecord): string {
    const b = program.brief;
    return [
      b.title ?? b.deliverableType,
      b.audience ? `受众${b.audience}` : null,
      b.timeframe ? `范围${b.timeframe}` : null,
      b.persona ? `画像${b.persona}` : null,
      b.purpose ? `目的${b.purpose}` : null,
    ]
      .filter(Boolean)
      .join('；');
  }

  private buildPlanningUserText(userText: string, program: CollaborationProgramRecord): string {
    const summary = this.briefSummaryLine(program);
    return `${String(userText ?? '').trim()}\n\n【Program 对齐摘要】\n${summary}`.slice(0, 8000);
  }

  private async replyCeo(params: {
    input: CollaborationPipelineV2RunInput;
    text: string;
    traceId: string;
    program: CollaborationProgramRecord;
    intentDecision2026_1: CollaborationIntentDecisionV20261;
  }): Promise<void> {
    const ceoId = String(params.input.ceoAgentId ?? '').trim();
    if (!ceoId) return;
    const output: LightStructuredOutputV2 = {
      version: 'v2',
      nextStep: NextStep.STRUCTURED_REPLY,
      finalText: params.text.slice(0, 8000),
      commitmentText: params.input.contentText.slice(0, 400),
      suggestedTasks: [],
      memoryReferences: [],
      metadata: {
        pipeline: 'v2',
        routePath: 'program_ssot',
        collaborationProgramId: params.program.id,
        collaborationProgramPhase: params.program.phase,
        traceId: params.traceId,
      },
    };
    await this.directReply.reply({
      companyId: params.input.companyId,
      roomId: params.input.roomId,
      agentId: ceoId,
      sourceMessageId: params.input.messageId,
      threadId: params.input.threadId ?? null,
      output,
      intentDecision2026_1: params.intentDecision2026_1,
    });
  }

  private buildProgramResult(
    program: CollaborationProgramRecord,
    intentDecision2026: CollaborationIntentDecision2026,
    intentDecision2026_1: CollaborationIntentDecisionV20261,
    routePath: string,
    options?: { inlineReplyHandled?: boolean },
  ): CollaborationPipelineV2RunResult {
    const legacyIntent = this.intent.buildLegacyIntentDecisionFromUnifiedPipeline({
      input: { companyId: program.companyId, roomId: program.roomId, contentText: '' } as CollaborationPipelineV2RunInput,
      layerDecision: intentDecision2026,
      unified: intentDecision2026_1,
      flags: { authorizedHeavyExecution: false },
    });
    return {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'program_ssot',
      intentDecision: legacyIntent,
      intentDecision2026_1,
      handledByV2: true,
      output: {
        status: 'ok',
        message: `Handled by collaboration program (${program.phase})`,
        payload: {
          collaborationProgram: program,
          routePath,
          ...(options?.inlineReplyHandled ? { inlineReplyHandled: true } : {}),
        },
      },
    };
  }
}
