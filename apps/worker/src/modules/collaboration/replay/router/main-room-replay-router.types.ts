import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { ConfigService } from '../../../../common/config/config.service.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
  MainRoomReplayFactLayerMode,
  MainRoomReplayLlmContextPack,
} from '../../pipeline-v2/collaboration-pipeline-v2.types.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  RoomContext,
} from '../../contracts/collaboration-2026.contracts.js';
import type { MainRoomReplayExecutionDelegateDecision } from '../../main-room-replay-execution-delegate.service.js';
import type { MainRoomStrategyDraftPayload } from '../../main-room-strategy-draft-session.service.js';
import type { CollaborationProgramRecord, MainRoomDispatchPlanSessionPayload } from '@contracts/types';
import type { MainRoomReplayFactLayerDiagnostics } from '../../main-room-ceo-grounding.service.js';
import type { ContextGroundingToolPolicy, ContextGroundingPlan } from '../../context/context-grounding-plan.js';
import type { MainRoomHeavyPipelineKind } from '../../pipeline-v2/main-room-heavy-pipeline-entry.util.js';
import type { MainRoomCeoAlignmentSessionPayload } from '../../main-room-ceo-alignment-session.service.js';
import type { CeoAlignmentMetadata } from '@foundry/contracts/types/ceo-alignment';
import type { MainRoomReplaySsotPublisherService } from '../main-room-replay-ssot-publisher.service.js';

export class MainRoomReplayRoutingError extends Error {
  readonly code: 'direct_summon_missing_surface';

  constructor(code: MainRoomReplayRoutingError['code'], message: string) {
    super(message);
    this.name = 'MainRoomReplayRoutingError';
    this.code = code;
  }
}

export type MainRoomReplayExecutionPorts = {
  evaluateDelegate: (params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    threadId?: string | null;
    userText: string;
    ceoAgentId?: string | null;
    humanSenderId?: string | null;
    messageCategory?: string | null;
    existingDraft: MainRoomStrategyDraftPayload | null;
    replayFactLayerSerialized: string;
    replayFactLayerDiagnostics: MainRoomReplayFactLayerDiagnostics;
    collaborationMode?: string | null;
    toolPolicy?: ContextGroundingToolPolicy | null;
    groundingPlan?: ContextGroundingPlan | null;
    intentType?: string | null;
    intentShouldExecute?: boolean;
  }) => Promise<MainRoomReplayExecutionDelegateDecision>;
  isPeerIntroSessionActive: (params: { companyId: string; roomId: string }) => Promise<boolean>;
  endPeerIntroSession: (params: { companyId: string; roomId: string }) => Promise<void>;
  getDraft: (params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }) => Promise<MainRoomStrategyDraftPayload | null>;
  setDraft: (params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    draftGoalSummary: string;
    sourceMessageId?: string;
  }) => Promise<void>;
  clearDraft: (params: { companyId: string; roomId: string; threadId?: string | null }) => Promise<void>;
};

export type MainRoomReplayAlignmentPorts = {
  confirmGateEnabled: () => boolean;
  defaultAuthorizeExecution: () => boolean;
  programConfirmMode: () => 'auto' | 'always';
  naturalLightReplyEnabled: () => boolean;
  getSession: (params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }) => Promise<MainRoomCeoAlignmentSessionPayload | null>;
  setProposed: (params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    draftGoalSummary: string;
    proposedHeavyPipelineKind: MainRoomHeavyPipelineKind;
    sourceMessageId?: string;
  }) => Promise<void>;
  clearSession: (params: { companyId: string; roomId: string; threadId?: string | null }) => Promise<void>;
  markAuthorized: (params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    authorizationMessageId: string;
    draftGoalSummary?: string | null;
    proposedHeavyPipelineKind?: MainRoomHeavyPipelineKind;
  }) => Promise<void>;
  patchAlignment: (params: {
    companyId: string;
    messageId: string;
    alignment: CeoAlignmentMetadata;
  }) => Promise<void>;
};

export type MainRoomExplicitDirectedParams = {
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  intentDecision2026: CollaborationIntentDecision2026;
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  traceId: string;
  authorizedHeavyExecution: boolean;
};

export type MainRoomReplayUserFacingCopyParams = MainRoomExplicitDirectedParams & {
  finalText: string;
  fastReplySource: string;
  ceoAlignment?: CeoAlignmentMetadata;
};

export type MainRoomReplayRouterHandlers = {
  executeExplicitDirectedPath: (p: MainRoomExplicitDirectedParams) => Promise<CollaborationPipelineV2RunResult>;
  executeReplayUserFacingCopy: (p: MainRoomReplayUserFacingCopyParams) => Promise<CollaborationPipelineV2RunResult>;
};

export type MainRoomAskDiscussionSurfaceParams = {
  companyId: string;
  roomId: string;
  messageId: string;
  traceId: string;
  threadId?: string | null;
  userText: string;
  ceoAgentId?: string | null;
  humanSenderId?: string | null;
  replayLlmContextPack: MainRoomReplayLlmContextPack;
  orgSnapshotPromptBlock?: string | null;
};

export type MainRoomReplayRouterDeps = {
  logger?: IntentReplayLogger;
  config: Pick<
    ConfigService,
    | 'getCollabMainRoomMaxDirectTargets'
    | 'shouldUseCeoDispatchPlanPath'
    | 'isCollabProgramSsotEnabled'
    | 'isCollabMainRoomReplyBeforeHeavyEnabled'
    | 'isCollabWorkIntentCompilerEnabled'
    | 'getCollabDispatchConfirmMode'
  >;
  handlers: MainRoomReplayRouterHandlers;
  replayExecution: MainRoomReplayExecutionPorts;
  alignment: MainRoomReplayAlignmentPorts;
  generateAskDiscussionSurface?: (p: MainRoomAskDiscussionSurfaceParams) => Promise<string | null>;
  generateExecutionNaturalLightReply?: (p: MainRoomAskDiscussionSurfaceParams) => Promise<string | null>;
  /** 阶段 2.1：重编排前的即时自然接话（带接话约束 prompt）。 */
  generateReplyBeforeHeavy?: (p: MainRoomAskDiscussionSurfaceParams) => Promise<string | null>;
  dispatchPlan?: {
    getSession: (p: {
      companyId: string;
      roomId: string;
      threadId?: string | null;
    }) => Promise<MainRoomDispatchPlanSessionPayload | null>;
  };
  replayStrategyDraftPatchFromSummary?: (p: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    humanUserId: string;
    draftGoalSummary: string;
  }) => Promise<void>;
  grounding: {
    buildReplayDelegateFactLayer: (p: {
      companyId: string;
      roomContext: RoomContext;
      ceoAgentId: string | null;
      userText: string;
      traceId: string;
      threadId?: string | null;
      pack: MainRoomReplayLlmContextPack;
      factLayerMode?: MainRoomReplayFactLayerMode;
    }) => Promise<{ serialized: string; diagnostics: MainRoomReplayFactLayerDiagnostics }>;
  };
  ssotPublisher?: Pick<MainRoomReplaySsotPublisherService, 'isEnabled' | 'publishDelegateCompleted'>;
  roomModeSync?: {
    syncToExecutionIfEnabled: (p: {
      companyId: string;
      roomId: string;
      changeReason: string;
    }) => Promise<void>;
  };
  program?: {
    getActive: (p: {
      companyId: string;
      roomId: string;
      threadId?: string | null;
    }) => Promise<CollaborationProgramRecord | null>;
  };
  programLifecycle?: {
    isEnabled: () => boolean;
    syncWorkCommand: (p: {
      companyId: string;
      roomId: string;
      threadId?: string | null;
      sourceMessageId: string;
      traceId?: string | null;
      command: any;
      existingProgram?: CollaborationProgramRecord | null;
    }) => Promise<CollaborationProgramRecord | null>;
  };
  orchestrationPause?: {
    pauseActiveOrchestration: (p: {
      companyId: string;
      roomId: string;
      threadId?: string | null;
      messageId: string;
      traceId: string;
      userText?: string | null;
      confirmationIntent?: string | null;
    }) => Promise<{ attempted: boolean; ok: boolean; revoke: boolean }>;
  };
};

export type IntentReplayLogger = { log: (msg: string, meta?: Record<string, unknown>) => void };

export type MainRoomPostIntentDispatch =
  | { kind: 'explicit_directed' }
  | { kind: 'direct_summon_unresolved_surface' }
  | { kind: 'ceo_replay_delegate'; entry: 'only_ceo_summon' | 'default_ceo_line' };
