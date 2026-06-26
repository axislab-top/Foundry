/**
 * 2026.1：管线 `IntentDecision` → Unified DTO。
 *
 * 主群受众 Intent 只做「找谁」：
 * - 有房内直连目标 → `routingHints.targetAgentIds` 等
 * - 否则 CEO 线（经 Intent→replay；是否进战略/编排/监督由 replay 委托与治理链决定，不由本映射推断 routePath）
 * - `userFacingReply` / `intentSelfReply` 若存在：**仅服务端 enrich**（如主管策略），受众路由 LLM 不产出。
 */

import { randomUUID } from 'node:crypto';
import type {
  CollaborationIntentDecisionV20261,
  CollaborationIntentCanonical,
  CollaborationIntentRiskLevel,
  CollaborationDirectorResolution2026,
  CollaborationUserFacingReply2026,
  CollaborationIntentSelfReply2026,
  CollaborationMainRoomAudienceHandoff2026,
} from '@contracts/types';

export function buildCollaborationIntentDecisionV20261(params: {
  traceId: string;
  roomId: string;
  /** 受众层置信度；默认取 `layer.confidence`。 */
  audienceConfidence?: number;
  strategyConfidence?: number;
  layer: {
    intentType: CollaborationIntentCanonical;
    confidence: number;
    explanation: string;
    routingHints: {
      riskLevel: CollaborationIntentRiskLevel;
      requiresParallelism: boolean;
      shouldExecute: boolean;
    };
    targetDepartmentSlugs: string[];
    targetAgentIds?: string[];
    explicitDirectTargets?: boolean;
    summonAgentsMissingFromRoom?: string[];
    userFacingReply?: CollaborationUserFacingReply2026;
    mainRoomAudienceHandoff?: CollaborationMainRoomAudienceHandoff2026;
    directorResolution?: CollaborationDirectorResolution2026;
    intentSelfReply?: CollaborationIntentSelfReply2026;
  };
  hasValidDirectAgentTargets: boolean;
}): CollaborationIntentDecisionV20261 {
  const traceNorm = String(params.traceId ?? '').trim();
  const traceId = traceNorm || randomUUID();
  const schemaVersion: CollaborationIntentDecisionV20261['schemaVersion'] =
    params.layer.userFacingReply ||
    params.layer.mainRoomAudienceHandoff ||
    params.layer.directorResolution ||
    params.layer.intentSelfReply
      ? '2026.2'
      : '2026.1';
  const audienceConfidence = params.audienceConfidence ?? params.layer.confidence;
  return {
    schemaVersion,
    intentType: params.layer.intentType,
    confidence: params.layer.confidence,
    audienceConfidence,
    ...(params.strategyConfidence !== undefined
      ? { strategyConfidence: params.strategyConfidence }
      : {}),
    routingHints: {
      riskLevel: params.layer.routingHints.riskLevel,
      requiresParallelism: params.layer.routingHints.requiresParallelism,
      shouldExecute: params.layer.routingHints.shouldExecute,
      suggestedDepartmentSlugs: params.layer.targetDepartmentSlugs.slice(0, 12),
      ...(params.layer.targetAgentIds !== undefined ? { targetAgentIds: params.layer.targetAgentIds } : {}),
      ...(params.layer.explicitDirectTargets !== undefined
        ? { explicitDirectTargets: params.layer.explicitDirectTargets }
        : {}),
      ...(params.layer.summonAgentsMissingFromRoom !== undefined
        ? { summonAgentsMissingFromRoom: params.layer.summonAgentsMissingFromRoom }
        : {}),
    },
    explanation: params.layer.explanation,
    traceId,
    roomId: params.roomId,
    ...(params.layer.userFacingReply ? { userFacingReply: params.layer.userFacingReply } : {}),
    ...(params.layer.mainRoomAudienceHandoff
      ? { mainRoomAudienceHandoff: params.layer.mainRoomAudienceHandoff }
      : {}),
    ...(params.layer.directorResolution ? { directorResolution: params.layer.directorResolution } : {}),
    ...(params.layer.intentSelfReply ? { intentSelfReply: params.layer.intentSelfReply } : {}),
  };
}
