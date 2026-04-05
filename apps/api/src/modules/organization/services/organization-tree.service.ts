import { Injectable } from '@nestjs/common';
import { OrganizationNode } from '../entities/organization-node.entity.js';
import { OrganizationTreeNodeDto } from '../dto/organization-tree.dto.js';

@Injectable()
export class OrganizationTreeService {
  buildTree(nodes: OrganizationNode[]): OrganizationTreeNodeDto[] {
    const sorted = [...nodes].sort((a, b) => a.order - b.order);
    const map = new Map<string, OrganizationTreeNodeDto>();
    const roots: OrganizationTreeNodeDto[] = [];

    for (const node of sorted) {
      map.set(node.id, {
        id: node.id,
        parentId: node.parentId,
        type: node.type,
        name: node.name,
        description: node.description,
        agentId: node.agentId,
        order: node.order,
        metadata: node.metadata,
        children: [],
      });
    }

    for (const node of sorted) {
      const current = map.get(node.id)!;
      if (!node.parentId) {
        roots.push(current);
        continue;
      }
      const parent = map.get(node.parentId);
      if (parent) {
        parent.children.push(current);
      } else {
        roots.push(current);
      }
    }

    return roots;
  }
}
