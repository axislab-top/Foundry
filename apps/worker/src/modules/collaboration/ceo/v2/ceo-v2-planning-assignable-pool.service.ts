import { Injectable, Logger } from '@nestjs/common';
import type { PlanningResult } from '@contracts/types';
import { ConfigService } from '../../../../common/config/config.service.js';
import { RoomContextService } from '../../context/room-context.service.js';
import { capabilitiesForAssignablePool } from '@foundry/contracts/types/department-assignment';
import { resolveAssignableDepartmentSlugs } from './resolve-assignable-departments.js';

export interface EnrichPlanningAssignablePoolParams {
  companyId: string;
  roomId: string;
  intentSlugs?: string[];
  /** 默认 true：metadata 已有非空池时跳过 RPC */
  skipIfPresent?: boolean;
}

/**
 * 在 Orchestration `distribute` 前解析可指派部门池（组织快照 + 意图 hint）。
 * HTTP Pipeline 与 Temporal Activity 共用，避免双入口落到 `operations` 占位池。
 */
@Injectable()
export class CeoV2PlanningAssignablePoolService {
  private readonly logger = new Logger(CeoV2PlanningAssignablePoolService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly roomContextService: RoomContextService,
  ) {}

  async enrichPlanning(
    planning: PlanningResult,
    params: EnrichPlanningAssignablePoolParams,
  ): Promise<PlanningResult> {
    const meta = (planning.metadata ?? {}) as Record<string, unknown>;
    const existing = Array.isArray(meta.assignableDepartmentSlugs)
      ? (meta.assignableDepartmentSlugs as unknown[]).map((s) => String(s ?? '').trim()).filter(Boolean)
      : [];
    const existingCaps = Array.isArray(meta.departmentCapabilities) ? meta.departmentCapabilities : [];
    if (params.skipIfPresent !== false && existing.length > 0 && existingCaps.length > 0) {
      return planning;
    }

    const companyId = String(params.companyId || meta.companyId || '').trim();
    const roomId = String(params.roomId || meta.roomId || '').trim();
    if (!companyId || !roomId) {
      this.logger.warn('ceo_v2.assignable_pool.missing_room_context', {
        planId: planning.planId,
        hasCompanyId: Boolean(companyId),
        hasRoomId: Boolean(roomId),
      });
      return planning;
    }

    try {
      const roomContext = await this.roomContextService.buildRoomContext({ companyId, roomId });
      const orgSlugs = roomContext.orgSnapshot.departments.map((d) => d.slug);
      const policy = this.config.getCollabAssignableDepartmentPolicy();
      const resolved = resolveAssignableDepartmentSlugs({
        orgSlugs,
        intentSlugs: params.intentSlugs ?? [],
        policy,
      });
      const departmentCapabilities = capabilitiesForAssignablePool(
        roomContext.orgSnapshot.departments.map((d) => ({
          slug: d.slug,
          name: d.name,
          organizationNodeId: d.id,
          platformDepartmentSlug: d.platformDepartmentSlug ?? null,
          responsibilitySummary: d.responsibilitySummary,
          taskTypeTags: d.taskTypeTags ?? [],
          excludesTaskTypeTags: d.excludesTaskTypeTags,
          capabilitiesSource: d.capabilitiesSource as
            | import('@foundry/contracts/types/department-assignment').DepartmentCapabilitiesSource
            | undefined,
        })),
        resolved.assignableDepartmentSlugs,
      );
      this.logger.log('ceo_v2.assignable_pool_resolved', {
        companyId,
        roomId,
        planId: planning.planId,
        assignable_slugs_count: resolved.assignableDepartmentSlugs.length,
        assignableResolvePolicy: resolved.assignableResolvePolicy,
        intent_hints_filtered: resolved.intentDepartmentHints.length,
        dropped_intent_count: resolved.droppedIntentSlugs.length,
      });
      return {
        ...planning,
        metadata: {
          ...meta,
          companyId: meta.companyId ?? companyId,
          roomId: meta.roomId ?? roomId,
          assignableDepartmentSlugs: resolved.assignableDepartmentSlugs,
          departmentCapabilities,
          intentDepartmentHints: resolved.intentDepartmentHints,
          assignableResolvePolicy: resolved.assignableResolvePolicy,
          ...(resolved.droppedIntentSlugs.length ? { droppedIntentSlugs: resolved.droppedIntentSlugs } : {}),
          ...(resolved.usedEmptyOrgFallback ? { assignableSource: 'empty_org_fallback' as const } : {}),
        },
      };
    } catch (err: unknown) {
      this.logger.warn('ceo_v2.assignable_pool_resolve_failed', {
        companyId,
        roomId,
        planId: planning.planId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ...planning,
        metadata: {
          ...meta,
          assignablePoolResolveFailed: true,
        },
      };
    }
  }
}
