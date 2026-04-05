import { BadRequestException, Injectable } from '@nestjs/common';
import { companyNamespace } from '../utils/memory-namespace.js';
import type { MemorySearchFilters } from './memory-retriever.service.js';
import type {
  MemoryAgentRoleHint,
  MemoryRoutedScope,
} from '../dto/routed-search-memory.dto.js';

export interface RoutedMemorySearchPlan {
  useHierarchy: boolean;
  filters: MemorySearchFilters;
  scope: MemoryRoutedScope;
  notes: string[];
}

/**
 * 将「自然语言公司知识查询」意图映射为命名空间与检索策略（分层 Hybrid + ACL 由 MemoryAccessService 执行）。
 */
@Injectable()
export class MemoryQueryRouterService {
  plan(input: {
    scope?: MemoryRoutedScope;
    agentRole?: MemoryAgentRoleHint;
    agentId?: string;
    primaryOrganizationNodeId?: string;
    roomId?: string;
    /** SearchMemoryDto 中已有字段，原样透传 */
    baseFilters: MemorySearchFilters;
  }): RoutedMemorySearchPlan {
    const notes: string[] = [];
    const scope = input.scope ?? this.defaultScope(input.agentRole);
    notes.push(`scope=${scope}${input.scope ? '' : ` (default for role=${input.agentRole ?? 'unknown'})`}`);

    if (scope === 'personal') {
      if (!input.agentId?.trim()) {
        throw new BadRequestException({
          code: 'MEMORY_ROUTER_AGENT_ID_REQUIRED',
          message: 'scope=personal 时必须提供 agentId',
        });
      }
      return {
        useHierarchy: false,
        scope,
        notes,
        filters: {
          ...input.baseFilters,
          namespaces: undefined,
          agentId: input.agentId.trim(),
          organizationNodeId: undefined,
          roomId: undefined,
        },
      };
    }

    if (scope === 'department') {
      const nodeId = input.primaryOrganizationNodeId?.trim();
      if (!nodeId) {
        throw new BadRequestException({
          code: 'MEMORY_ROUTER_DEPT_ID_REQUIRED',
          message: 'scope=department 时必须提供 primaryOrganizationNodeId',
        });
      }
      return {
        useHierarchy: false,
        scope,
        notes,
        filters: {
          ...input.baseFilters,
          namespaces: undefined,
          organizationNodeId: nodeId,
          agentId: undefined,
          roomId: undefined,
        },
      };
    }

    if (scope === 'company') {
      return {
        useHierarchy: false,
        scope,
        notes: [...notes, 'namespaces=company only'],
        filters: {
          ...input.baseFilters,
          namespaces: [companyNamespace()],
          agentId: undefined,
          organizationNodeId: undefined,
          roomId: undefined,
        },
      };
    }

    // hierarchy: session → agent → dept → company（与 retrieveWithHierarchy 一致）
    return {
      useHierarchy: true,
      scope,
      notes: [
        ...notes,
        'strategy=retrieveWithHierarchy(session→agent→dept→company)',
      ],
      filters: {
        ...input.baseFilters,
        namespaces: undefined,
        agentId: input.agentId?.trim() || undefined,
        organizationNodeId: input.primaryOrganizationNodeId?.trim() || undefined,
      },
    };
  }

  private defaultScope(role?: MemoryAgentRoleHint): MemoryRoutedScope {
    switch (role) {
      case 'ceo':
      case 'board_member':
        return 'hierarchy';
      case 'director':
        return 'department';
      case 'executor':
        return 'hierarchy';
      default:
        return 'hierarchy';
    }
  }
}
