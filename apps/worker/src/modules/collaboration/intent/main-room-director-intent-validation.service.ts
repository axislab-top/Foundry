import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';
import {
  AgentsActiveDirectoryCacheService,
  type AgentDirectorySlice,
} from '../context/agents-active-directory-cache.service.js';
import type { IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { buildMainRoomDirectorAgentWhitelist } from './main-room-director-whitelist.util.js';
import { filterMainRoomAudienceRoutableAgentIds } from './main-room-audience-cap.util.js';
import { isUserInitiatedMainRoomDirectSummon } from './main-room-direct-summon-provenance.util.js';
import { IntentDirectorMemoryShadowService } from './intent-director-memory-shadow.service.js';
import { isDirectSummonCanonicalIntent } from './intent-direct-summon.util.js';

/**
 * 主群 Intent 层固定 `audience_resolution`；legacy 信封仍可能带 `direct_summon`。
 * 本服务仅在有直连/受众解析语义时做主管白名单校验。
 */

export type DirectorResolutionStatus = 'matched' | 'ambiguous' | 'none' | 'skipped';

export type DirectorResolutionPayload = {
  status: DirectorResolutionStatus;
  chosenAgentIds: string[];
  candidateIdsBeforeFilter: string[];
  partialGroupMatch?: boolean;
  droppedCandidateIds?: string[];
};

@Injectable()
export class MainRoomDirectorIntentValidationService {
  private readonly logger = new Logger(MainRoomDirectorIntentValidationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly agentsDirectoryCache: AgentsActiveDirectoryCacheService,
    private readonly memoryShadow: IntentDirectorMemoryShadowService,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * 就地更新 `layerDecision`：
   * - 在过滤前写入 `mainRoomAudienceHandoff`（听众解析 ∩ enrich 后的房内目标，**策略前**快照）；
   * - 白名单过滤后更新 `routingHints.targetAgentIds`（**仅策略允许直连**）与 `directorResolution`；
   * - `userFacingReply`：**仅本服务**做裁剪/清理；受众路由 LLM 永不产出用户可见句。
   */
  async applyMainRoomDirectorValidation(params: {
    companyId: string;
    roomContext: RoomContext;
    layerDecision: IntentDecision;
    ceoAgentId?: string | null;
    mentionedAgentIds?: string[];
    memoryHits?: ReadonlyArray<{ id?: string; content?: string }>;
    userText?: string;
  }): Promise<void> {
    const { companyId, roomContext, layerDecision, ceoAgentId, mentionedAgentIds, memoryHits, userText } = params;
    const it = layerDecision.intentType;
    if (it !== 'audience_resolution' && !isDirectSummonCanonicalIntent(it)) {
      layerDecision.directorResolution = { status: 'skipped', chosenAgentIds: [], candidateIdsBeforeFilter: [] };
      return;
    }

    let roster: AgentDirectorySlice[] = [];
    try {
      roster = await this.agentsDirectoryCache.getActiveAgents(companyId, this.workerActor());
    } catch {
      roster = [];
    }
    const directorWhitelist = buildMainRoomDirectorAgentWhitelist(roomContext, roster);
    const roomAgentIds = new Set(
      (roomContext.memberDirectory ?? [])
        .filter((m) => m.memberType === 'agent')
        .map((m) => String(m.memberId).trim())
        .filter(Boolean),
    );
    const ceo = String(ceoAgentId ?? '').trim();
    /** 房内配置的 CEO：与「部门主管白名单」分立，点名 CEO / CEO 回复须能命中。 */
    const ceoInRoom = Boolean(ceo && roomAgentIds.has(ceo));
    const mentionAllow = new Set(
      (mentionedAgentIds ?? [])
        .map((id) => String(id ?? '').trim())
        .filter((id) => Boolean(id) && (!ceo || id !== ceo) && roomAgentIds.has(id)),
    );

    const maxDirect = this.config.getCollabMainRoomMaxDirectTargets();
    const rawCap = Math.min(32, Math.max(8, maxDirect));
    const raw = (layerDecision.routingHints.targetAgentIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
      .slice(0, rawCap);
    const candidateIdsBeforeFilter = [...raw];

    if (raw.length > 0) {
      layerDecision.mainRoomAudienceHandoff = { audienceResolvedTargetAgentIds: [...raw] };
    } else {
      delete layerDecision.mainRoomAudienceHandoff;
    }

    const filteredResult = filterMainRoomAudienceRoutableAgentIds({
      rawIds: raw,
      directorWhitelist,
      mentionAllow,
      ceoInRoom,
      ceoId: ceo,
      roster,
      roomAgentIds,
      maxDirect,
      employeeNaturalEnabled: this.config.isCollabMainRoomAudienceEmployeeNaturalEnabled(),
      maxEmployeeNatural: this.config.getCollabMainRoomAudienceEmployeeNaturalMax(),
      minConfidenceForEmployee: this.config.getCollabMainRoomAudienceEmployeeNaturalMinConfidence(),
      audienceConfidence:
        typeof layerDecision.confidence === 'number' && Number.isFinite(layerDecision.confidence)
          ? layerDecision.confidence
          : 0,
    });
    const filtered = filteredResult.filtered;
    const droppedCandidateIds = filteredResult.droppedCandidateIds.slice(0, rawCap);
    const partialGroupMatch = filtered.length > 0 && droppedCandidateIds.length > 0;
    /** `direct_summon`：有房内在白名单内的目标即 matched；否则 none。 */
    const status: DirectorResolutionStatus = filtered.length === 0 ? 'none' : 'matched';

    const userInitiatedSummon =
      isDirectSummonCanonicalIntent(layerDecision.intentType) ||
      isUserInitiatedMainRoomDirectSummon({
        routableTargetIds: filtered,
        mentionedAgentIds,
        summonProvenance: layerDecision.routingHints.summonProvenance,
      }) ||
      (layerDecision.intentType === 'audience_resolution' &&
        filtered.length > 0 &&
        filteredResult.allowedEmployeeIds.length > 0 &&
        filtered.every(
          (id) =>
            filteredResult.allowedEmployeeIds.includes(id) ||
            mentionAllow.has(id) ||
            (ceoInRoom && id === ceo),
        ));

    if (filtered.length === 0) {
      layerDecision.routingHints.targetAgentIds = undefined;
      layerDecision.routingHints.explicitDirectTargets = false;
    } else if (userInitiatedSummon) {
      layerDecision.routingHints.targetAgentIds = filtered;
      layerDecision.routingHints.explicitDirectTargets = true;
      if (filtered.some((id) => mentionAllow.has(id))) {
        layerDecision.routingHints.summonProvenance = 'mention';
      }
    } else {
      // 受众 LLM 推断：保留 handoff 供 CEO replay 参考，不自动多人直聊
      layerDecision.routingHints.targetAgentIds = undefined;
      layerDecision.routingHints.explicitDirectTargets = false;
      layerDecision.routingHints.summonProvenance =
        layerDecision.routingHints.summonProvenance ?? 'audience_llm_uuid';
    }

    layerDecision.directorResolution = {
      status,
      chosenAgentIds: filtered,
      candidateIdsBeforeFilter,
      ...(partialGroupMatch ? { partialGroupMatch: true, droppedCandidateIds } : {}),
    };

    const isAudience = layerDecision.intentType === 'audience_resolution';
    const resolvedCount = candidateIdsBeforeFilter.length;
    const text = String(layerDecision.userFacingReply?.text ?? '').trim();

    if (isAudience && status === 'none') {
      if (resolvedCount > 0 || !text) {
        delete layerDecision.userFacingReply;
      }
    } else if (text.length > 8000) {
      layerDecision.userFacingReply = { text: text.slice(0, 8000) };
    }

    await this.memoryShadow.maybeLog({
      enabled: this.config.isMainRoomIntentDirectorMemoryShadowEnabled(),
      companyId,
      roomId: roomContext.roomId,
      traceId: layerDecision.traceId,
      userText: String(userText ?? '').trim(),
      memoryHits,
      directorWhitelist: [...directorWhitelist],
      resolutionStatus: status,
    });

    if (filteredResult.allowedEmployeeIds.length > 0) {
      this.logger.log('foundry.collaboration.main_room.audience_employee_natural', {
        companyId,
        roomId: roomContext.roomId,
        traceId: layerDecision.traceId,
        allowedEmployeeIds: filteredResult.allowedEmployeeIds,
        droppedEmployeeIds: filteredResult.droppedEmployeeIds,
        audienceConfidence: layerDecision.confidence,
      });
    }

    this.logger.log('main_room.director_intent.validation', {
      companyId,
      roomId: roomContext.roomId,
      traceId: layerDecision.traceId,
      status,
      chosenCount: filtered.length,
      rawCount: raw.length,
      audienceResolvedCount: resolvedCount || undefined,
      partialGroupMatch: partialGroupMatch || undefined,
      employeeNaturalAllowed: filteredResult.allowedEmployeeIds.length
        ? filteredResult.allowedEmployeeIds
        : undefined,
      employeeNaturalDropped: filteredResult.droppedEmployeeIds.length
        ? filteredResult.droppedEmployeeIds
        : undefined,
      audienceConfidence: layerDecision.confidence,
    });
  }
}
