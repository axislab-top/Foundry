import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';

import type { CollaborationProgramRecord, IntentDecision } from '@contracts/types';

import type { CollaborationIntentDecisionV20261 } from '@contracts/types';

import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';

import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';

import { ConfigService } from '../../../common/config/config.service.js';

import { CollaborationProgramClientService } from '../program/collaboration-program-client.service.js';

import type { CollaborationMainRoomOrchestrationService } from '../pipeline-v2/main-room-orchestration.service.js';

import { lazyCollaborationMainRoomOrchestrationService } from '../pipeline-v2/pipeline-v2.forward-ref.js';

import type { CollaborationMainRoomIntentService } from '../pipeline-v2/main-room-intent.service.js';

import { lazyCollaborationMainRoomIntentService } from '../pipeline-v2/pipeline-v2.forward-ref.js';

import { CollaborationRoomModeSyncService } from '../collaboration-room-mode-sync.service.js';

import {

  briefPatchFromAspects,

  buildGoalUnderstanding,

  type CollaborationOrchestrateToolResult,

  type CollaborationTurnToolContext,

} from './collaboration-turn-tool.types.js';

/** Inline replacement for deleted `CeoV2OrchestrationService.buildLegacyIntentDecisionForMainRoomPlanning`. */
function buildLegacyIntentDecisionForDispatchPlan(params: {
  input: CollaborationPipelineV2RunInput;
  intentDecision: CollaborationIntentDecision2026;
  intentDecision2026_1?: CollaborationIntentDecisionV20261;
}): IntentDecision {
  const suggestedDepartments = params.intentDecision.targetDepartmentSlugs.slice(0, 12);
  const tid = String(params.intentDecision.traceId ?? params.input.messageId).trim();
  return {
    schemaVersion: '1.0',
    intentType: params.intentDecision.intentType as IntentDecision['intentType'],
    targetMode: 'ceo_layer',
    targetType: 'system',
    targetIds: [],
    targetLayer: 'orchestration',
    confidence: params.intentDecision.confidence,
    messageCategory: 'chat',
    responseMode: params.intentDecision.routingHints.responseMode as IntentDecision['responseMode'],
    shouldReply: true,
    shouldExecute: params.intentDecision.routingHints.shouldExecute,
    routingHints: {
      suggestedDepartments,
      requiresParallelism: params.intentDecision.routingHints.requiresParallelism,
      riskLevel: params.intentDecision.routingHints.riskLevel as IntentDecision['routingHints']['riskLevel'],
    },
    explanation: params.intentDecision.explanation,
    traceId: tid,
    roomId: params.input.roomId,
    requestedBy: params.input.humanSenderId ?? 'human',
    classifierSource: 'hybrid',
    llmUsed: true,
    evidence: {},
    metadata: {
      routePath: 'dispatch_plan',
      source: 'main_room_dispatch_plan_v2',
      intentDecision2026: params.intentDecision,
      ...(params.intentDecision2026_1
        ? {
            classifier: 'intent_layer_unified_v2026_1',
            intentDecision2026_1: params.intentDecision2026_1 as unknown as Record<string, unknown>,
          }
        : {}),
    },
  };
}

@Injectable()

export class CollaborationOrchestrateToolHandler {

  private readonly logger = new Logger(CollaborationOrchestrateToolHandler.name);



  constructor(

    private readonly config: ConfigService,

    private readonly programClient: CollaborationProgramClientService,

    private readonly roomModeSync: CollaborationRoomModeSyncService,

    @Inject(forwardRef(lazyCollaborationMainRoomOrchestrationService))

    private readonly orchestration: CollaborationMainRoomOrchestrationService,

    @Inject(forwardRef(lazyCollaborationMainRoomIntentService))

    private readonly intent: CollaborationMainRoomIntentService,

  ) {}



  async getActiveProgram(ctx: CollaborationTurnToolContext): Promise<CollaborationProgramRecord | null> {

    return await this.programClient.getActive({

      companyId: ctx.companyId,

      roomId: ctx.roomId,

      threadId: ctx.threadId,

    });

  }



  private async ensureExecutionMode(ctx: CollaborationTurnToolContext): Promise<void> {

    const mode = String(ctx.collaborationMode ?? ctx.roomContext.collaborationMode ?? '').trim();

    if (mode === 'execution') return;

    await this.roomModeSync.syncToExecutionIfEnabled({

      companyId: ctx.companyId,

      roomId: ctx.roomId,

      changeReason: 'collaboration_turn_orchestrate',

    });

    ctx.collaborationMode = 'execution';

    ctx.roomContext = { ...ctx.roomContext, collaborationMode: 'execution' };

  }



  async orchestrate(

    ctx: CollaborationTurnToolContext,

    args: Record<string, unknown>,

  ): Promise<CollaborationOrchestrateToolResult> {

    const goalSummary = String(args.goalSummary ?? '').trim();

    if (!goalSummary) {

      return { ok: false, error: 'GOAL_SUMMARY_REQUIRED' };

    }

    if (goalSummary.length < 8) {

      return { ok: false, error: 'GOAL_SUMMARY_TOO_SHORT' };

    }



    await this.ensureExecutionMode(ctx);



    const autoFlush = args.autoFlush !== false;

    const aspects =

      args.aspects && typeof args.aspects === 'object' && !Array.isArray(args.aspects)

        ? (args.aspects as Record<string, string>)

        : undefined;

    const goalUnderstanding = buildGoalUnderstanding({

      goalSummary,

      aspects,

      deliverableKind: aspects?.deliverableType ?? aspects?.deliverable_kind ?? null,

    });

    const briefPatch = briefPatchFromAspects(aspects);



    let program = await this.getActiveProgram(ctx);

    if (!program) {

      program = await this.programClient.createIntake({

        companyId: ctx.companyId,

        roomId: ctx.roomId,

        threadId: ctx.threadId,

        sourceMessageId: ctx.messageId,

        brief: briefPatch,

        metadata: { traceId: ctx.traceId, source: 'collaboration_turn_orchestrate' },

      });

    }



    try {

      const toPhase =

        program.phase === 'planning' ||

        program.phase === 'dispatching' ||

        program.phase === 'dept_executing' ||

        program.phase === 'supervising'

          ? program.phase

          : 'planning';

      program = await this.programClient.transition({

        companyId: ctx.companyId,

        programId: program.id,

        toPhase: toPhase as import('@contracts/types').CollaborationProgramPhase,

        patch: {

          brief: briefPatch,

          goalUnderstanding,

          metadata: { lastOrchestrateMessageId: ctx.messageId, traceId: ctx.traceId },

        },

      });

    } catch (e: unknown) {

      const err = e instanceof Error ? e.message : String(e);

      this.logger.warn('collaboration_turn.orchestrate.program_transition_failed', {

        companyId: ctx.companyId,

        roomId: ctx.roomId,

        messageId: ctx.messageId,

        err,

      });

      return { ok: false, error: `PROGRAM_TRANSITION_FAILED:${err.slice(0, 200)}` };

    }



    const enrichedInput = {

      ...ctx.input,

      contentText: goalSummary,

      messageMetadata: {

        ...(ctx.input.messageMetadata ?? {}),

        collaborationProgramGoalSummary: goalSummary,

        collaborationProgramBriefSummary: goalSummary,

      },

    };



    const legacyIntent = buildLegacyIntentDecisionForDispatchPlan({

      input: enrichedInput,

      intentDecision: ctx.intentDecision2026,

      intentDecision2026_1: ctx.intentDecision2026_1,

    });



    const dispatchResult = await this.orchestration.runMainRoomDispatchPlanPath({

      input: enrichedInput,

      roomContext: ctx.roomContext,

      intentDecision: legacyIntent,

      intentDecision2026: ctx.intentDecision2026,

      intentDecision2026_1: ctx.intentDecision2026_1,

      traceId: ctx.traceId,

      autoFlush,

    });



    const routePath = dispatchResult.routePath;

    // Dispatch plan path removed — always fail
    ctx.dispatchFollowupAck = '';
    return { ok: false, error: 'DISPATCH_FOLLOWUP_FAILED', routePath };

  }

}


