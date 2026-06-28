import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';
import type { MemoryActor } from './memory-access.service.js';
import type { MemorySourceType } from '../entities/memory-entry.entity.js';
import { EventDeduplicatorService } from './event-deduplicator.service.js';
import { MemoryGraphService } from './memory-graph.service.js';

export interface GuardMemoryInput {
  companyId: string;
  namespace: string;
  content: string;
  sourceType: MemorySourceType;
  actor?: MemoryActor;
  metadata?: Record<string, unknown> | null;
  cycleDepth?: number;
  isSensitive?: boolean;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  suggestedAction?: 'drop' | 'shortTermOnly';
  lineageHash?: string;
}

@Injectable()
export class MemoryGovernanceGuardService {
  constructor(
    private readonly deduplicator: EventDeduplicatorService,
    private readonly config: ConfigService,
    private readonly graph: MemoryGraphService,
  ) {}

  async guard(storeDto: GuardMemoryInput): Promise<GuardResult> {
    const maxCycleDepth = 4;
    const cycleDepth = Number(storeDto.cycleDepth ?? 0);
    if (cycleDepth >= maxCycleDepth) {
      return { allowed: false, reason: 'cycle_depth_exceeded', suggestedAction: 'drop' };
    }

    if (storeDto.content.trim().length < 3) {
      return { allowed: false, reason: 'content_too_short', suggestedAction: 'drop' };
    }

    const mcpGate = storeDto.metadata?.mcpGate;
    if (mcpGate === 'required' && storeDto.metadata?.mcpApproved !== true) {
      return { allowed: false, reason: 'mcp_gate_unapproved', suggestedAction: 'shortTermOnly' };
    }

    // Namespace policy for sensitive writes in broad scopes.
    if (
      storeDto.isSensitive &&
      storeDto.namespace === 'company' &&
      !(storeDto.actor?.permissions ?? []).includes('memory.sensitive.write.company')
    ) {
      return { allowed: false, reason: 'namespace_sensitive_policy', suggestedAction: 'shortTermOnly' };
    }

    // Simple budget guard by payload size (protect against accidental huge fan-out writes).
    const maxBytes = 64_000;
    if (Buffer.byteLength(storeDto.content, 'utf8') > maxBytes) {
      return { allowed: false, reason: 'budget_entry_too_large', suggestedAction: 'shortTermOnly' };
    }

    if (this.config.isApprovalGateEnabled() && storeDto.isSensitive && !storeDto.metadata?.approvalId) {
      return { allowed: false, reason: 'approval_required', suggestedAction: 'shortTermOnly' };
    }

    const lineageHash = this.deduplicator.buildLineageHash([
      storeDto.companyId,
      storeDto.namespace,
      storeDto.sourceType,
      String(storeDto.metadata?.sourceMessageId ?? ''),
      storeDto.content,
    ]);

    const duplicateEvent = await this.deduplicator.isDuplicateEvent({
      companyId: storeDto.companyId,
      eventType: 'memory.write.lineage',
      idempotencyKey: lineageHash,
    });
    if (duplicateEvent) {
      return { allowed: false, reason: 'duplicate_lineage', suggestedAction: 'drop', lineageHash };
    }

    const nearDup = await this.deduplicator.hasNearDuplicate({
      companyId: storeDto.companyId,
      namespace: storeDto.namespace,
      content: storeDto.content,
      sourceType: storeDto.sourceType,
    });
    if (nearDup) {
      return { allowed: false, reason: 'near_duplicate', suggestedAction: 'drop', lineageHash };
    }

    // Temporal Graph V2: lineage 防环（仅在需要时触发，避免影响常规检索/写入性能）
    if (this.config.get<boolean>('MEMORY_GRAPH_V2_ENABLED', false)) {
      const toEntryId = typeof (storeDto.metadata as any)?.toEntryId === 'string' ? String((storeDto.metadata as any).toEntryId) : '';
      const fromEntryId = typeof (storeDto.metadata as any)?.fromEntryId === 'string' ? String((storeDto.metadata as any).fromEntryId) : '';
      if (toEntryId && fromEntryId) {
        const lineage = await this.graph.getLineage(storeDto.companyId, toEntryId, 6);
        if (lineage.nodes.includes(fromEntryId)) {
          return { allowed: false, reason: 'lineage_cycle_detected', suggestedAction: 'drop', lineageHash };
        }
      }
    }

    return { allowed: true, lineageHash };
  }
}

