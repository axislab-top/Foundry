import type {
  CollaborationReplayDecisionKind,
  CollaborationReplayExecutionHint,
} from '@contracts/events';

export type MainRoomReplaySsotAuthorizationOutcome =
  | 'authorized'
  | 'propose'
  | 'light_reply'
  | 'bypass';

export type MainRoomReplaySsotRouteBypass =
  | 'dispatch_plan_heavy'
  | 'explicit_directed'
  | 'direct_summon_unresolved'
  | null;

export type MainRoomReplaySsotMapperInput = {
  authorizationOutcome: MainRoomReplaySsotAuthorizationOutcome;
  discussionMode: boolean;
  messageMetadata?: Record<string, unknown>;
  draftGoalSummary?: string | null;
  routeBypass?: MainRoomReplaySsotRouteBypass;
};

export type MainRoomReplaySsotMapperResult = {
  replayDecisionKind: CollaborationReplayDecisionKind;
  requiresUserConfirmation: boolean;
  summary: string;
  rationale: string[];
  executionHint?: CollaborationReplayExecutionHint;
};

function readExplicitTaskSpec(metadata: Record<string, unknown>): Record<string, unknown> {
  const raw = metadata.taskSpecDraft ?? metadata.taskSpec;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** 与 API TaskIntentCandidateService.evaluateReadiness 必填项对齐。 */
export function isExplicitTaskSpecReadyForConfirm(metadata: Record<string, unknown>): boolean {
  const spec = readExplicitTaskSpec(metadata);
  if (Object.keys(spec).length === 0) return false;
  const title = typeof spec.title === 'string' ? spec.title.trim() : '';
  const description = typeof spec.description === 'string' ? spec.description.trim() : '';
  const expectedOutput = typeof spec.expectedOutput === 'string' ? spec.expectedOutput.trim() : '';
  const assigneeType = spec.assigneeType;
  const assigneeId = typeof spec.assigneeId === 'string' ? spec.assigneeId.trim() : '';
  const ownerOk =
    assigneeType !== 'unassigned' && assigneeType !== undefined && assigneeId.length > 0;
  return Boolean(title && description && expectedOutput && ownerOk);
}

function buildExecutionHint(metadata: Record<string, unknown>): CollaborationReplayExecutionHint | undefined {
  const spec = readExplicitTaskSpec(metadata);
  if (Object.keys(spec).length === 0) return undefined;
  return {
    taskLike: true,
    expectedOutput: typeof spec.expectedOutput === 'string' ? spec.expectedOutput : undefined,
    acceptanceCriteria: stringArray(spec.acceptanceCriteria),
    deadlineHint: typeof spec.dueDate === 'string' ? spec.dueDate : undefined,
  };
}

export function mapAuthorizationToReplaySsotResult(
  input: MainRoomReplaySsotMapperInput,
): MainRoomReplaySsotMapperResult {
  const metadata = input.messageMetadata ?? {};
  const explicitSpec = readExplicitTaskSpec(metadata);
  const hasExplicitTaskSpec = Object.keys(explicitSpec).length > 0;
  const executionHint = hasExplicitTaskSpec ? buildExecutionHint(metadata) : undefined;

  if (input.authorizationOutcome === 'propose') {
    return {
      replayDecisionKind: 'propose_execution',
      requiresUserConfirmation: true,
      summary: input.draftGoalSummary?.trim()
        ? `建议执行：${input.draftGoalSummary.trim().slice(0, 200)}`
        : 'CEO 建议进入执行，等待用户确认。',
      rationale: ['worker_replay_ssot', 'replay_authorization_propose'],
      executionHint: executionHint ?? { taskLike: true },
    };
  }

  if (input.authorizationOutcome === 'authorized') {
    if (hasExplicitTaskSpec) {
      const ready = isExplicitTaskSpecReadyForConfirm(metadata);
      return {
        replayDecisionKind: ready ? 'confirm_execution' : 'prepare_task_draft',
        requiresUserConfirmation: !ready,
        summary: ready
          ? '主群显式任务规格已就绪，进入执行入口。'
          : '收到显式任务规格，进入执行入口准备任务草稿。',
        rationale: ready
          ? ['worker_replay_ssot', 'explicit_task_spec_ready', 'replay_authorization_authorized']
          : ['worker_replay_ssot', 'explicit_task_spec_present', 'replay_authorization_authorized'],
        executionHint,
      };
    }
    return {
      replayDecisionKind: 'confirm_execution',
      requiresUserConfirmation: false,
      summary: '用户已授权执行，进入 CEO 重栈编排。',
      rationale: ['worker_replay_ssot', 'replay_authorization_authorized'],
      executionHint: { taskLike: true },
    };
  }

  if (input.authorizationOutcome === 'bypass') {
    if (input.routeBypass === 'dispatch_plan_heavy') {
      return {
        replayDecisionKind: 'confirm_execution',
        requiresUserConfirmation: false,
        summary: 'Dispatch Plan 确定性路由授权进入部门下发。',
        rationale: ['worker_replay_ssot', `route_bypass_${input.routeBypass}`],
        executionHint: { taskLike: true },
      };
    }
    return {
      replayDecisionKind: 'continue_conversation',
      requiresUserConfirmation: false,
      summary:
        input.routeBypass === 'explicit_directed'
          ? '主群房内直连主管，Replay 决策为保持对话。'
          : '主群路由 bypass，保持对话状态。',
      rationale: ['worker_replay_ssot', `route_bypass_${input.routeBypass ?? 'unknown'}`],
    };
  }

  if (input.discussionMode) {
    return {
      replayDecisionKind: 'start_discussion',
      requiresUserConfirmation: false,
      summary: '讨论模式下 CEO 轻答，进入讨论流程。',
      rationale: ['worker_replay_ssot', 'replay_authorization_light_reply', 'discussion_mode'],
    };
  }

  return {
    replayDecisionKind: 'continue_conversation',
    requiresUserConfirmation: false,
    summary: '保持对话状态，等待更多上下文或显式执行入口。',
    rationale: ['worker_replay_ssot', 'replay_authorization_light_reply'],
  };
}

export function readAudienceTargets(metadata: Record<string, unknown>): {
  targetAgentIds: string[];
  targetDepartmentSlugs: string[];
} {
  const audience =
    metadata.audienceDecision && typeof metadata.audienceDecision === 'object' && !Array.isArray(metadata.audienceDecision)
      ? (metadata.audienceDecision as Record<string, unknown>)
      : {};
  return {
    targetAgentIds: stringArray(audience.targetAgentIds),
    targetDepartmentSlugs: stringArray(audience.targetDepartmentSlugs),
  };
}
