import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  companyNamespace,
  departmentNamespace,
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

@Injectable()
export class MemoryAccessService {
  isPrivileged(actor?: MemoryActor): boolean {
    if (!actor?.roles?.length) return false;
    return actor.roles.some((r) => PRIVILEGED_ROLES.has(String(r).toLowerCase()));
  }

  canReadSensitive(actor?: MemoryActor): boolean {
    if (this.isPrivileged(actor)) return true;
    if (!actor?.permissions?.length) return false;
    return actor.permissions.some((p) => SENSITIVE_READ_PERMS.has(p));
  }

  /**
   * 将用户请求的命名空间限制在其可见范围内（仍受 company RLS 约束）
   */
  resolveSearchNamespaces(
    requested: string[] | undefined,
    actor: MemoryActor | undefined,
  ): string[] | undefined {
    if (!requested?.length) {
      if (this.isPrivileged(actor)) return undefined;
      const ns = new Set<string>([companyNamespace()]);
      for (const id of actor?.organizationNodeIds ?? []) {
        ns.add(departmentNamespace(id));
      }
      return [...ns];
    }
    const allowed = new Set(this.expandDefaultAllowList(actor));
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

  assertStoreNamespace(namespace: string, actor: MemoryActor | undefined): void {
    if (this.isPrivileged(actor)) return;
    if (namespace === companyNamespace()) return;
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

  private expandDefaultAllowList(actor?: MemoryActor): string[] {
    if (this.isPrivileged(actor)) {
      return ['*'];
    }
    const ns = new Set<string>([companyNamespace()]);
    for (const id of actor?.organizationNodeIds ?? []) {
      ns.add(departmentNamespace(id));
    }
    for (const roomId of actor?.roomIds ?? []) {
      ns.add(sessionNamespace(roomId));
    }
    return [...ns];
  }

  namespaceAllowedForActor(namespace: string, actor?: MemoryActor): boolean {
    const list = this.expandDefaultAllowList(actor);
    if (list.includes('*')) return true;
    return list.includes(namespace);
  }
}
