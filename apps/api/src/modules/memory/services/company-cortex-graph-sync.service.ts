import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '../../../common/config/config.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import type { MemoryEdgeType } from '../entities/memory-edge.entity.js';
import type { MemoryActor } from './memory-access.service.js';
import { MemoryGraphRolloutService } from './memory-graph-rollout.service.js';
import { MemoryGraphService } from './memory-graph.service.js';
import { MemoryService } from './memory.service.js';
import { agentNamespace } from '../utils/memory-namespace.js';

/**
 * 与 {@link MemoryGraphService} 解耦：避免 `memory-graph` ↔ `memory.service` 静态 import 环
 *（`MemoryGovernanceGuard` 依赖 `MemoryGraphService` 时会在 ESM 下触发 TDZ）。
 */
@Injectable()
export class CompanyCortexGraphSyncService {
  private readonly logger = new Logger(CompanyCortexGraphSyncService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Agent) private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNode) private readonly orgNodesRepo: Repository<OrganizationNode>,
    private readonly config: ConfigService,
    private readonly rollout: MemoryGraphRolloutService,
    private readonly memory: MemoryService,
    private readonly graph: MemoryGraphService,
  ) {}

  /**
   * Phase3：组织树 + 活跃 Agent → CEO L1 记忆 + related_to 边（幂等指纹跳过）。
   */
  async syncCompanyCortexFromFacts(params: {
    companyId: string;
    actor: MemoryActor;
  }): Promise<{
    skipped: boolean;
    skippedReason?: 'disabled' | 'rollout' | 'unchanged';
    hubEntryId?: string;
    edgesCreated?: number;
    fingerprint?: string;
  }> {
    const companyId = String(params.companyId ?? '').trim();
    if (!companyId) return { skipped: true, skippedReason: 'disabled' };
    if (!this.config.isMemoryGraphV2Enabled()) return { skipped: true, skippedReason: 'disabled' };
    if (!(await this.rollout.isMemoryGraphV2Effective(companyId))) {
      return { skipped: true, skippedReason: 'rollout' };
    }

    const [agents, orgNodes] = await Promise.all([
      this.agentsRepo.find({
        where: { companyId, status: 'active' } as any,
        select: ['id', 'name', 'role', 'organizationNodeId', 'metadata'] as any,
        take: 800,
      }),
      this.orgNodesRepo.find({
        where: { companyId } as any,
        select: ['id', 'name', 'type', 'parentId'] as any,
        take: 2000,
      }),
    ]);

    const agentIds = agents.map((a) => String(a.id)).filter(Boolean).sort();
    const nodeIds = orgNodes.map((n) => String(n.id)).filter(Boolean).sort();
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ agentIds, nodeIds }))
      .digest('hex');

    const ceoNs = `company:${companyId}:ceo:layer:L1`;
    const prev = await this.dataSource.query(
      `
      SELECT me.id, me.metadata
      FROM memory_entries me
      INNER JOIN memory_collections mc ON mc.id = me.collection_id
      WHERE mc.company_id = $1::uuid AND mc.namespace = $2
        AND (me.metadata->>'kind') = 'company_cortex_facts_sync'
      ORDER BY me.created_at DESC
      LIMIT 1
      `,
      [companyId, ceoNs],
    );
    const prevRow = Array.isArray(prev) && prev[0] ? (prev[0] as { id?: string; metadata?: Record<string, unknown> }) : null;
    const prevFp =
      prevRow?.metadata && typeof prevRow.metadata === 'object'
        ? String((prevRow.metadata as Record<string, unknown>)['fingerprint'] ?? '').trim()
        : '';
    if (prevFp && prevFp === fingerprint && prevRow?.id) {
      return { skipped: true, skippedReason: 'unchanged', hubEntryId: String(prevRow.id), fingerprint };
    }

    const orgLines = orgNodes
      .slice(0, 80)
      .map((n) => `- ${String(n.name ?? '').trim() || n.id} (${String(n.type ?? '')})`)
      .join('\n');
    const agentLines = agents
      .slice(0, 200)
      .map((a) => {
        const slug =
          typeof (a.metadata as any)?.departmentSlug === 'string' ? String((a.metadata as any).departmentSlug) : '';
        const bits = [String(a.name ?? '').trim() || a.id, a.role ? `role=${a.role}` : '', slug ? `dept=${slug}` : ''].filter(
          Boolean,
        );
        return `- ${bits.join(' · ')}`;
      })
      .join('\n');

    const content = [
      '【Company Cortex · 由组织与人员事实同步】',
      '回答公司概况、人员编制类问题时以此块为权威摘要；实时会话成员仍以 room 上下文为准。',
      `同步指纹 fingerprint=${fingerprint}`,
      `活跃 Agent 数：${agents.length}；组织节点数：${orgNodes.length}`,
      '',
      '### 组织节点（节选）',
      orgLines || '(无节点)',
      '',
      '### 活跃 Agent（节选）',
      agentLines || '(无活跃 Agent)',
    ].join('\n');

    const stored = await this.memory.storeEntry({
      companyId,
      namespace: ceoNs,
      collectionLabel: 'CEO Company Cortex (facts sync)',
      content,
      sourceType: 'manual',
      sourceRef: null,
      metadata: {
        kind: 'company_cortex_facts_sync',
        fingerprint,
        agentCount: agents.length,
        orgNodeCount: orgNodes.length,
      },
      skipAccessCheck: true,
      actor: params.actor,
    });
    if (!stored?.id) {
      this.logger.warn('syncCompanyCortexFromFacts storeEntry returned null', { companyId });
      return { skipped: true, skippedReason: 'disabled', fingerprint };
    }
    const hubEntryId = String(stored.id);

    let edgesCreated = 0;
    for (const aid of agentIds) {
      const ns = agentNamespace(aid);
      const leafRows = await this.dataSource.query(
        `
        SELECT me.id
        FROM memory_entries me
        INNER JOIN memory_collections mc ON mc.id = me.collection_id
        WHERE mc.company_id = $1::uuid AND mc.namespace = $2
        ORDER BY me.created_at DESC
        LIMIT 1
        `,
        [companyId, ns],
      );
      const leafId =
        Array.isArray(leafRows) && leafRows[0] ? String((leafRows[0] as { id?: string }).id ?? '').trim() : '';
      if (!leafId || leafId === hubEntryId) continue;
      const r = await this.graph.addEdge({
        companyId,
        fromEntryId: leafId,
        toEntryId: hubEntryId,
        edgeType: 'related_to' as MemoryEdgeType,
        metadata: { kind: 'company_cortex_link', agentId: aid },
      });
      if (r.created) edgesCreated += 1;
    }

    this.logger.log('foundry.memory.graph.syncCompanyCortexFromFacts', {
      companyId,
      hubEntryId,
      edgesCreated,
      fingerprint,
    });

    return { skipped: false, hubEntryId, edgesCreated, fingerprint };
  }
}
