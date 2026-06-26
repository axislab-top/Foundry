import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { CapabilityRole, FactsQueryType, FactsRequester } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';

type DepartmentSharingContext = {
  role: string | null;
  departmentSlug: string | null;
  departmentOrganizationNodeId?: string | null;
  allowDeptSharedMemory: boolean;
};

@Injectable()
export class CapabilityPolicyService {
  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private normalizeRole(role: string | null | undefined): CapabilityRole {
    const r = String(role ?? '').trim().toLowerCase();
    if (r === 'ceo') return 'ceo';
    if (r.includes('director')) return 'director';
    if (r.includes('employee') || r.includes('member') || r.includes('rep')) return 'employee';
    if (r === 'director') return 'director';
    return 'unknown';
  }

  async resolveRequester(requester: FactsRequester): Promise<FactsRequester> {
    const agentId = String(requester?.agentId ?? '').trim();
    if (!agentId) return requester;
    const role = requester?.role ?? 'unknown';
    const departmentSlug = (requester?.departmentSlug ?? '').trim();
    if (role !== 'unknown' && departmentSlug) return requester;
    try {
      const ctx = await firstValueFrom(
        this.apiRpc
          .send<DepartmentSharingContext>('agents.departmentSharingContext', {
            companyId: (requester as any).companyId,
            actor: this.workerActor(),
            id: agentId,
          } as any)
          .pipe(timeout(2000)),
      );
      const normalizedRole = requester.role !== 'unknown' ? requester.role : this.normalizeRole(ctx?.role);
      const slug = departmentSlug || (typeof ctx?.departmentSlug === 'string' ? ctx.departmentSlug.trim() : '');
      return {
        ...requester,
        role: normalizedRole,
        departmentSlug: slug || null,
      };
    } catch {
      return requester;
    }
  }

  allowedFactsQueryTypes(role: CapabilityRole): FactsQueryType[] {
    if (role === 'ceo') {
      return ['company_people', 'room_members', 'role_presence', 'org_structure', 'department_roster', 'node_roster'];
    }
    if (role === 'director') {
      return ['room_members', 'role_presence', 'org_structure', 'department_roster', 'node_roster'];
    }
    if (role === 'employee') return ['room_members', 'role_presence', 'department_roster'];
    return ['room_members'];
  }

  async allowedMemoryNamespaces(params: {
    companyId: string;
    roomId?: string | null;
    requester: FactsRequester;
    includeConversationState?: boolean;
  }): Promise<string[]> {
    const role = params.requester.role;
    const agentId = String(params.requester.agentId ?? '').trim();
    const slug = typeof params.requester.departmentSlug === 'string' ? params.requester.departmentSlug.trim() : '';

    if (role === 'ceo') {
      const base = [
        `company:${params.companyId}:ceo:layer:L1`,
        `company:${params.companyId}:ceo:layer:L2`,
        `company:${params.companyId}:ceo:layer:L3`,
      ];
      if (params.includeConversationState && params.roomId) {
        base.push(`company:${params.companyId}:ceo:room:${params.roomId}:state`);
      }
      return base;
    }

    const namespaces: string[] = [];
    if (agentId) namespaces.push(`agent:${agentId}`);

    // Best-effort: only add department namespace if allowed by department sharing context.
    if (slug) {
      try {
        const ctx = await firstValueFrom(
          this.apiRpc
            .send<DepartmentSharingContext>('agents.departmentSharingContext', {
              companyId: params.companyId,
              actor: this.workerActor(),
              id: agentId,
            } as any)
            .pipe(timeout(2000)),
        );
        if (Boolean(ctx?.allowDeptSharedMemory)) namespaces.push(`department:${slug}`);
      } catch {
        // keep strict isolation
      }
    }
    return namespaces.length ? namespaces : agentId ? [`agent:${agentId}`] : [];
  }
}

