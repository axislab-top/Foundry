import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';
import {
  AgentsActiveDirectoryCacheService,
  type AgentDirectorySlice,
} from '../context/agents-active-directory-cache.service.js';
import type { IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { resolveSummonTargetsFromRoomNlCopy } from '../intent-summon-nl-resolve.util.js';
import { capMainRoomDirectAgentIds } from './main-room-audience-cap.util.js';
import { isDirectSummonCanonicalIntent } from './intent-direct-summon.util.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 主群召唤唯一解析入口：LLM 明示 UUID → 房内 NL 匹配 → 部门 slug + 组织节点结构化匹配。
 * 结果写回 `IntentDecision.routingHints`（供 mapRoute / 直连短路与 PostIntent 共享）。
 */
@Injectable()
export class SummonTargetResolverService {
  private readonly logger = new Logger(SummonTargetResolverService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly agentsDirectoryCache: AgentsActiveDirectoryCacheService,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * 在 `buildUnifiedIntentFromLayer` 之前调用，原地更新 `layerDecision`。
   */
  async enrichLayerDecisionForSummonTargets(params: {
    companyId: string;
    userText: string;
    roomContext: RoomContext;
    layerDecision: IntentDecision;
    ceoAgentId: string | null | undefined;
  }): Promise<{ resolutionTrace: string[] }> {
    const trace: string[] = [];
    const maxDirect = this.config.getCollabMainRoomMaxDirectTargets();
    const { companyId, userText, roomContext, layerDecision, ceoAgentId } = params;
    const rh = layerDecision.routingHints;
    const rawIds = (rh.targetAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
    const validUuids = rawIds.filter((id) => UUID_RE.test(id));
    const hadExplicitFlag = rh.explicitDirectTargets === true;

    /** Intent 层偶发只写 UUID、未置 explicitDirectTargets：直接收敛，避免重复 NL / agents 目录 RPC */
    if (rawIds.length > 0 && validUuids.length === rawIds.length) {
      rh.targetAgentIds = capMainRoomDirectAgentIds(validUuids, maxDirect);
      rh.summonProvenance = 'audience_llm_uuid';
      trace.push(hadExplicitFlag ? 'explicit_valid_uuid' : 'normalized_all_uuid_targets');
      return { resolutionTrace: trace };
    }

    if (rawIds.length > 0 && validUuids.length < rawIds.length) {
      delete rh.targetAgentIds;
      rh.explicitDirectTargets = false;
      trace.push('cleared_non_uuid_placeholders');
    }

    if (
      layerDecision.intentType !== 'audience_resolution' &&
      !isDirectSummonCanonicalIntent(layerDecision.intentType)
    ) {
      return { resolutionTrace: trace.length ? trace : ['skip_non_audience_routing'] };
    }

    const nl = capMainRoomDirectAgentIds(
      resolveSummonTargetsFromRoomNlCopy(userText, roomContext, ceoAgentId),
      maxDirect,
    );
    if (nl.length > 0) {
      rh.targetAgentIds = nl;
      rh.explicitDirectTargets = true;
      rh.summonProvenance = 'nl_room_directory';
      trace.push('nl_room_directory');
      this.logger.log('summon_target_resolver.nl_match', {
        companyId,
        roomId: roomContext.roomId,
        traceId: layerDecision.traceId,
        count: nl.length,
      });
      return { resolutionTrace: trace };
    }

    const slugAgents = await this.resolveByDepartmentSlugs({
      companyId,
      roomContext,
      layerDecision,
      maxDirect,
    });
    if (slugAgents.length > 0) {
      rh.targetAgentIds = slugAgents;
      rh.explicitDirectTargets = true;
      rh.summonProvenance = 'department_slug';
      trace.push('structured_department_slug');
      this.logger.log('summon_target_resolver.department_slug_match', {
        companyId,
        roomId: roomContext.roomId,
        traceId: layerDecision.traceId,
        slugs: layerDecision.targetDepartmentSlugs,
        count: slugAgents.length,
      });
      return { resolutionTrace: trace };
    }

    trace.push('unresolved');
    return { resolutionTrace: trace };
  }

  private async resolveByDepartmentSlugs(params: {
    companyId: string;
    roomContext: RoomContext;
    layerDecision: IntentDecision;
    maxDirect: number;
  }): Promise<string[]> {
    const { companyId, roomContext, layerDecision, maxDirect } = params;
    const slugs = (layerDecision.targetDepartmentSlugs ?? [])
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
      .slice(0, maxDirect);
    if (slugs.length === 0) return [];

    const roomAgentIds = new Set(
      (roomContext.memberDirectory ?? [])
        .filter((m) => m.memberType === 'agent')
        .map((m) => String(m.memberId).trim())
        .filter(Boolean),
    );
    if (roomAgentIds.size === 0) return [];

    let roster: AgentDirectorySlice[];
    try {
      roster = await this.agentsDirectoryCache.getActiveAgents(companyId, this.workerActor());
    } catch {
      return [];
    }

    const slugToDeptId = new Map<string, string>();
    for (const d of roomContext.orgSnapshot?.departments ?? []) {
      const slug = String(d.slug ?? '').trim().toLowerCase();
      if (slug) slugToDeptId.set(slug, String(d.id).trim());
    }

    const picked: string[] = [];
    for (const slug of slugs) {
      const deptId = slugToDeptId.get(slug.toLowerCase());
      if (!deptId) continue;

      const inDept = roster.filter(
        (a) =>
          roomAgentIds.has(a.id) &&
          String(a.organizationNodeId ?? '').trim() === deptId &&
          String(a.role ?? '').trim().toLowerCase() === 'director',
      );
      if (inDept.length === 1) {
        picked.push(inDept[0]!.id);
      }
    }

    return capMainRoomDirectAgentIds([...new Set(picked)], maxDirect);
  }
}
