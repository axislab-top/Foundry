import { Injectable } from '@nestjs/common';
import { MemoryRetrieverService } from './memory-retriever.service.js';
import type { MemoryActor } from './memory-access.service.js';
import { resolveDepartmentMemoryNamespace } from '../utils/memory-namespace.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';

@Injectable()
export class MemoryKnowledgeService {
  constructor(
    private readonly retriever: MemoryRetrieverService,
    @InjectRepository(OrganizationNode)
    private readonly orgNodesRepo: Repository<OrganizationNode>,
  ) {}

  /** 部门节点知识摘要：基于部门命名空间的 RAG 片段拼成短摘要 */
  async getDepartmentKnowledgeSummary(params: {
    companyId: string;
    organizationNodeId: string;
    nodeName: string;
    actor?: MemoryActor;
  }): Promise<{ summary: string; hits: number }> {
    const node = await this.orgNodesRepo.findOne({ where: { id: params.organizationNodeId } });
    const slug =
      node && typeof node.metadata?.platformDepartmentSlug === 'string'
        ? node.metadata.platformDepartmentSlug
        : null;
    const ns = resolveDepartmentMemoryNamespace({
      organizationNodeId: params.organizationNodeId,
      platformDepartmentSlug: slug,
    });
    const query = `${params.nodeName} 部门 知识库 要点`;
    const hits = await this.retriever.search(query, {
      companyId: params.companyId,
      namespaces: [ns],
      topK: 5,
      actor: params.actor,
    });
    if (!hits.length) {
      return { summary: '', hits: 0 };
    }
    const text = hits
      .map((h, i) => `【${i + 1}】（相关度 ${h.score.toFixed(3)}）${h.content.slice(0, 400)}`)
      .join('\n');
    return { summary: text.slice(0, 8000), hits: hits.length };
  }
}
