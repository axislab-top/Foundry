import type { CollaborationPipelineV2RunInput } from './collaboration-pipeline-v2.types.js';
import type { PlanningContractFailure, PlanningResult } from '@contracts/types';
import { migrateLegacyPlanningResultToStrategicPhases } from '@contracts/types';
// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- inlined from deleted ceo-v2-planning.schema
const CEO_V2_STRATEGIC_PHASE_OUTCOME_MAX_CHARS = 560;
import { capabilitiesForAssignablePool } from '@foundry/contracts/types/department-assignment';
import {
  resolveAssignableDepartmentSlugs,
  type AssignableDepartmentPolicy,
} from '../ceo/v2/resolve-assignable-departments.js';
import { sanitizeStrategyUserVisibleText } from '../strategy-planning-profile.util.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  PlanningResult as CollaborationPlanningResult2026,
  RiskLevel,
  RoomContext,
} from '../contracts/collaboration-2026.contracts.js';

export function buildStrategyContractFailedFastFinalText(failure: PlanningContractFailure): string {
  if (failure.code === 'readiness_blocked') {
    const parts = [failure.detail?.trim(), failure.reason?.trim()].filter(Boolean);
    const joined = parts.join(' ').trim();
    return (joined || '当前前置条件未就绪，暂无法生成战略目标契约。').slice(0, 800);
  }
  if (failure.code === 'planning_exception') {
    return '规划服务出现异常，请稍后重试或与管理员联系。'.slice(0, 800);
  }
  const first = failure.validationIssues?.[0]?.message?.trim();
  const suffix = first ? ` 详情（节选）：${first.slice(0, 240)}` : '';
  return `战略目标契约未通过校验（${failure.code}）。请缩小需求范围、补充可量化指标，或稍后重试。${suffix}`.slice(0, 800);
}

export function buildCollaborationPlanningResult2026FromCeoV2(params: {
  ceoV2: PlanningResult;
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
}): CollaborationPlanningResult2026 {
  const { ceoV2, input, roomContext } = params;
  const rawLevel = ceoV2.riskAssessment?.level ?? 'medium';
  const level: RiskLevel =
    rawLevel === 'low' || rawLevel === 'medium' || rawLevel === 'high' || rawLevel === 'critical' ? rawLevel : 'medium';
  const factors = (ceoV2.riskAssessment?.factors ?? []).map((f) => String(f).trim()).filter(Boolean);

  const cleanGoal = sanitizeStrategyUserVisibleText(String(ceoV2.goal ?? '').trim(), { maxLen: 800 });

  const strategicPhases = (() => {
    const direct = ceoV2.strategicPhases;
    if (Array.isArray(direct) && direct.length) {
      return direct.slice(0, 8).map((ph, i) => ({
        phaseId: String(ph.phaseId ?? `p${i + 1}`).trim() || `p${i + 1}`,
        title: sanitizeStrategyUserVisibleText(String(ph.title ?? '').trim(), { maxLen: 120 }),
        outcome: sanitizeStrategyUserVisibleText(String(ph.outcome ?? '').trim(), {
          maxLen: CEO_V2_STRATEGIC_PHASE_OUTCOME_MAX_CHARS,
        }),
        deadline: ph.deadline ? String(ph.deadline) : undefined,
      }));
    }
    const migrated = migrateLegacyPlanningResultToStrategicPhases(ceoV2 as unknown as Record<string, unknown>);
    return migrated
      ? migrated.slice(0, 8).map((ph, i) => ({
          phaseId: ph.phaseId || `p${i + 1}`,
          title: sanitizeStrategyUserVisibleText(ph.title, { maxLen: 120 }),
          outcome: sanitizeStrategyUserVisibleText(ph.outcome, {
            maxLen: CEO_V2_STRATEGIC_PHASE_OUTCOME_MAX_CHARS,
          }),
          deadline: ph.deadline,
        }))
      : [
          {
            phaseId: 'p1',
            title: 'Primary',
            outcome: sanitizeStrategyUserVisibleText(cleanGoal, {
              maxLen: CEO_V2_STRATEGIC_PHASE_OUTCOME_MAX_CHARS,
            }),
            deadline: ceoV2.timeline?.targetEndAt ?? '',
          },
        ];
  })();

  const risks: CollaborationPlanningResult2026['risks'] = factors.length
    ? factors.map((reason) => ({ level, reason: reason.slice(0, 180) }))
    : [
        {
          level,
          reason: `战略风险等级为 ${level}；L1 契约未返回可展示的分项说明。`,
        },
      ];

  const topRisk = risks.reduce<RiskLevel | null>((acc, r) => {
    const rank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    if (!acc) return r.level;
    return rank[r.level] > rank[acc] ? r.level : acc;
  }, null);

  return {
    traceId: String(ceoV2.traceId ?? ceoV2.planAnchorMessageId ?? input.messageId).trim(),
    planAnchorMessageId: ceoV2.planAnchorMessageId ?? ceoV2.traceId,
    turnMessageId: ceoV2.turnMessageId ?? input.messageId,
    routingRootMessageId: ceoV2.routingRootMessageId ?? input.routingRootMessageId ?? input.messageId,
    ...(input.runId ? { runId: input.runId } : {}),
    roomId: input.roomId,
    roomType: roomContext.roomType,
    strategyGoal: cleanGoal,
    strategicPhases,
    constraints: [],
    resourceNeeds: (() => {
      const et = Math.floor(Number(ceoV2.resourceNeeds.estimatedTokens));
      const cu = Number(ceoV2.resourceNeeds.estimatedCostUsd);
      return {
        estimatedTokens: Number.isFinite(et) ? Math.min(2_000_000, Math.max(1000, et)) : 1000,
        estimatedCostUsd: Number.isFinite(cu) ? Math.min(10_000, Math.max(0, cu)) : 0,
      };
    })(),
    ...((): { timeline?: { startAt: string; targetEndAt: string } } => {
      const startAt = String(ceoV2.timeline.startAt ?? '').trim();
      const targetEndAt = String(ceoV2.timeline.targetEndAt ?? '').trim();
      if (!startAt || !targetEndAt) return {};
      return { timeline: { startAt, targetEndAt } };
    })(),
    risks,
    needsApproval: ceoV2.needsHumanApproval === true || ceoV2.approvalFlag === true,
    approvalReason: ceoV2.approvalReason,
    ceoStructuredContract: ceoV2.ceoStructuredContract ?? '2026.pr4',
    planDigest: {
      goal: cleanGoal.trim().slice(0, 280),
      topRiskLevel: topRisk,
      strategicPhaseCount: strategicPhases.length,
      constraintCount: 0,
    },
  };
}

export function toLegacyPlanningResultForMainFlow(params: {
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  intentDecision: CollaborationIntentDecision2026;
  planning: CollaborationPlanningResult2026;
  assignableDepartmentPolicy: AssignableDepartmentPolicy;
}) {
  const orgSlugs = params.roomContext.orgSnapshot.departments.map((d) => d.slug);
  const resolved = resolveAssignableDepartmentSlugs({
    orgSlugs,
    intentSlugs: params.intentDecision.targetDepartmentSlugs ?? [],
    policy: params.assignableDepartmentPolicy,
  });
  const defaultDeadline = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  const phasesSrc =
    params.planning.strategicPhases?.length > 0
      ? params.planning.strategicPhases
      : [
          {
            phaseId: 'p1',
            title: 'Primary Goal',
            outcome: params.planning.strategyGoal,
            deadline: defaultDeadline,
          },
        ];
  const strategicPhases = phasesSrc.slice(0, 8).map((item, index) => ({
    phaseId: String(item.phaseId ?? `p${index + 1}`).trim() || `p${index + 1}`,
    title: String(item.title ?? `阶段 ${index + 1}`).trim().slice(0, 120),
    outcome: String(item.outcome ?? 'deliver')
      .trim()
      .slice(0, CEO_V2_STRATEGIC_PHASE_OUTCOME_MAX_CHARS),
    deadline: item.deadline ? String(item.deadline) : defaultDeadline,
  }));

  const rn = params.planning.resourceNeeds;
  const resourceNeeds =
    rn && Number.isFinite(rn.estimatedTokens) && Number.isFinite(rn.estimatedCostUsd)
      ? {
          estimatedTokens: Math.min(2_000_000, Math.max(1000, Math.floor(Number(rn.estimatedTokens)))),
          estimatedCostUsd: Math.min(10_000, Math.max(0, Number(rn.estimatedCostUsd))),
        }
      : {
          estimatedTokens: 1000,
          estimatedCostUsd: 0,
        };

  const tls = params.planning.timeline;
  const deadlineTimes = strategicPhases
    .map((x) => x.deadline)
    .map((d) => ({ d, t: Date.parse(String(d)) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);

  let timeline: { startAt: string; targetEndAt: string };
  if (
    tls?.startAt &&
    tls?.targetEndAt &&
    String(tls.startAt).trim().length > 0 &&
    String(tls.targetEndAt).trim().length > 0
  ) {
    timeline = { startAt: String(tls.startAt).trim(), targetEndAt: String(tls.targetEndAt).trim() };
  } else if (deadlineTimes.length > 0) {
    timeline = {
      startAt: new Date(deadlineTimes[0].t).toISOString(),
      targetEndAt: new Date(deadlineTimes[deadlineTimes.length - 1].t).toISOString(),
    };
  } else {
    timeline = {
      startAt: new Date().toISOString(),
      targetEndAt: strategicPhases.find((x) => x.deadline)?.deadline ?? defaultDeadline,
    };
  }

  const strategyEconomicsProvenance = {
    resourceNeeds:
      rn && Number.isFinite(rn.estimatedTokens) && Number.isFinite(rn.estimatedCostUsd)
        ? ('planning2026_l1' as const)
        : ('pre_upgrade_minimal' as const),
    timeline:
      tls?.startAt &&
      tls?.targetEndAt &&
      String(tls.startAt).trim().length > 0 &&
      String(tls.targetEndAt).trim().length > 0
        ? ('planning2026_l1' as const)
        : deadlineTimes.length > 0
          ? ('derived_from_phase_deadlines' as const)
          : ('synthetic_window' as const),
  };

  return {
    schemaVersion: '2.1' as const,
    planId: `${params.planning.traceId}:strategy`,
    goal: params.planning.strategyGoal.slice(0, 800),
    strategicPhases,
    resourceNeeds,
    riskAssessment: {
      level: params.planning.risks[0]?.level ?? params.intentDecision.routingHints.riskLevel,
      factors: params.planning.risks.map((r) => r.reason).filter(Boolean).slice(0, 8),
    },
    timeline,
    approvalFlag: params.planning.needsApproval,
    needsHumanApproval: params.planning.needsApproval,
    approvalReason: params.planning.approvalReason,
    traceId: params.planning.traceId,
    planAnchorMessageId: params.planning.traceId,
    turnMessageId: params.input.messageId,
    routingRootMessageId: params.input.routingRootMessageId ?? params.input.messageId,
    ...(params.input.runId ? { runId: params.input.runId } : {}),
    metadata: {
      companyId: params.input.companyId,
      roomId: params.input.roomId,
      messageId: params.input.messageId,
      routingRootMessageId: params.input.routingRootMessageId ?? params.input.messageId,
      ...(params.input.runId ? { runId: params.input.runId } : {}),
      ceoAgentId: params.input.ceoAgentId,
      planner: 'strategy_planning_service',
      planning2026: params.planning,
      strategyEconomicsProvenance,
      roomType: params.roomContext.roomType,
      assignableDepartmentSlugs: resolved.assignableDepartmentSlugs,
      departmentCapabilities: capabilitiesForAssignablePool(
        params.roomContext.orgSnapshot.departments.map((d) => ({
          slug: d.slug,
          name: d.name,
          organizationNodeId: d.id,
          platformDepartmentSlug: d.platformDepartmentSlug ?? null,
          responsibilitySummary: d.responsibilitySummary,
          taskTypeTags: d.taskTypeTags ?? [],
          excludesTaskTypeTags: d.excludesTaskTypeTags,
        })),
        resolved.assignableDepartmentSlugs,
      ),
      intentDepartmentHints: resolved.intentDepartmentHints,
      assignableResolvePolicy: resolved.assignableResolvePolicy,
      ...(resolved.droppedIntentSlugs.length ? { droppedIntentSlugs: resolved.droppedIntentSlugs } : {}),
      ...(resolved.usedEmptyOrgFallback ? { assignableSource: 'empty_org_fallback' as const } : {}),
    },
  };
}
