import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import {
  companyNamespace,
  departmentNamespaceLegacy,
  resolveDepartmentMemoryNamespace,
  sessionNamespace,
} from '../utils/memory-namespace.js';

export interface MemoryActor {
  id: string;
  roles?: string[];
  permissions?: string[];
  organizationNodeIds?: string[];
  /**
   * 由上层检索服务按房间成员关系注入；
   * 仅用于控制 session:<roomId> 命名空间可见范围。
   */
  roomIds?: string[];
}

const PRIVILEGED_ROLES = new Set(
  ['admin', 'owner', 'company_admin', 'superadmin'].map((s) => s.toLowerCase()),
);

const SENSITIVE_READ_PERMS = new Set(['memory.sensitive.read', 'memory.admin']);
const COMPANY_FULL_PERMS = new Set(['memory:company:full', 'memory:company:readwrite']);
const COMPANY_FULL_ROLES = new Set(['ceo', 'system']);

@Injectable()
export class MemoryAccessService {
  constructor(
    @InjectRepository(OrganizationNode)
    private readonly orgNodesRepo: Repository<OrganizationNode>,
  ) {}

  private hasCompanyFullAccess(actor?: MemoryActor): boolean {
    if (!actor) return false;
    const byRole = (actor.roles ?? []).some((r) => COMPANY_FULL_ROLES.has(String(r).toLowerCase()));
    if (byRole) return true;
    return (actor.permissions ?? []).some((p) => COMPANY_FULL_PERMS.has(p));
  }

  isPrivileged(actor?: MemoryActor): boolean {
    if (!actor?.roles?.length) return false;
    return actor.roles.some((r) => PRIVILEGED_ROLES.has(String(r).toLowerCase()));
  }

  canReadSensitive(actor?: MemoryActor): boolean {
    if (this.hasCompanyFullAccess(actor)) return true;
    if (this.isPrivileged(actor)) return true;
    if (!actor?.permissions?.length) return false;
    return actor.permissions.some((p) => SENSITIVE_READ_PERMS.has(p));
  }

  /**
   * 将用户请求的命名空间限制在其可见范围内（仍受 company RLS 约束）
   */
  async resolveSearchNamespaces(
    requested: string[] | undefined,
    actor: MemoryActor | undefined,
  ): Promise<string[] | undefined> {
    if (!requested?.length) {
      if (this.isPrivileged(actor)) return undefined;
      const ns = new Set<string>([companyNamespace()]);
      await this.addDepartmentNamespacesForActor(ns, actor);
      return [...ns];
    }
    const list = await this.expandDefaultAllowList(actor);
    // Privileged actors expand to ['*']; must match namespaceAllowedForActor: '*' means any namespace.
    if (list.includes('*')) {
      return requested;
    }
    const allowed = new Set(list);
    for (const ns of requested) {
      if (!allowed.has(ns)) {
        throw new ForbiddenException({
          code: 'MEMORY_NAMESPACE_FORBIDDEN',
          message: `无权检索记忆命名空间: ${ns}`,
        });
      }
    }
    return requested;
  }

  async assertStoreNamespace(namespace: string, actor: MemoryActor | undefined): Promise<void> {
    if (this.isPrivileged(actor)) return;
    if (namespace === companyNamespace() && this.hasCompanyFullAccess(actor)) return;
    if (namespace === companyNamespace()) return;
    if (namespace.startsWith('department:')) {
      const slug = namespace.slice('department:'.length);
      const ok = await this.actorMayAccessDepartmentSlug(actor, slug);
      if (ok) return;
      throw new ForbiddenException({
        code: 'MEMORY_STORE_FORBIDDEN',
        message: '仅管理部门可向对应部门命名空间写入记忆',
      });
    }
    if (namespace.startsWith('dept:')) {
      const id = namespace.slice('dept:'.length);
      if (actor?.organizationNodeIds?.includes(id)) return;
      throw new ForbiddenException({
        code: 'MEMORY_STORE_FORBIDDEN',
        message: '仅管理部门可向对应部门命名空间写入记忆',
      });
    }
    if (namespace.startsWith('agent:')) {
      throw new ForbiddenException({
        code: 'MEMORY_STORE_FORBIDDEN',
        message: 'Agent 命名空间记忆由系统自动写入',
      });
    }
    if (namespace.startsWith('session:')) {
      throw new ForbiddenException({
        code: 'MEMORY_STORE_FORBIDDEN',
        message: '会话命名空间由系统管理',
      });
    }
  }

  private async actorMayAccessDepartmentSlug(actor: MemoryActor | undefined, slug: string): Promise<boolean> {
    const ids = actor?.organizationNodeIds ?? [];
    if (!ids.length) return false;
    const nodes = await this.orgNodesRepo.findBy({ id: In(ids) });
    return nodes.some((n) => n.metadata?.platformDepartmentSlug === slug);
  }

  private async addDepartmentNamespacesForActor(ns: Set<string>, actor: MemoryActor | undefined): Promise<void> {
    const ids = actor?.organizationNodeIds ?? [];
    if (!ids.length) return;
    const nodes = await this.orgNodesRepo.findBy({ id: In(ids) });
    for (const n of nodes) {
      ns.add(
        resolveDepartmentMemoryNamespace({
          organizationNodeId: n.id,
          platformDepartmentSlug:
            typeof n.metadata?.platformDepartmentSlug === 'string' ? n.metadata.platformDepartmentSlug : null,
        }),
      );
      ns.add(departmentNamespaceLegacy(n.id));
    }
  }

  private async expandDefaultAllowList(actor?: MemoryActor): Promise<string[]> {
    if (this.isPrivileged(actor)) {
      return ['*'];
    }
    const ns = new Set<string>([companyNamespace()]);
    await this.addDepartmentNamespacesForActor(ns, actor);
    for (const roomId of actor?.roomIds ?? []) {
      ns.add(sessionNamespace(roomId));
    }
    return [...ns];
  }

  async namespaceAllowedForActor(namespace: string, actor?: MemoryActor): Promise<boolean> {
    const list = await this.expandDefaultAllowList(actor);
    if (list.includes('*')) return true;
    return list.includes(namespace);
  }
}
