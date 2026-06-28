import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';

export interface RolePersonalityProfile {
  behaviorStyle: string;
  responsibilityLevel: 'low' | 'medium' | 'high';
  departmentCultureBias: string;
}

@Injectable()
export class RolePersonalityEngine {
  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())));
  }

  async loadRoleProfile(params: {
    companyId: string;
    departmentSlug: string;
    role: 'supervisor' | 'employee';
    roleId?: string;
  }): Promise<RolePersonalityProfile> {
    const ns = `company:${params.companyId}:role_personality:${params.departmentSlug}:${params.role}`;
    const row = await this.rpc<Array<{ content?: string }>>('memory.search', {
      companyId: params.companyId,
      actor: this.actor(),
      query: `${params.departmentSlug} ${params.role} behaviorStyle responsibilityLevel departmentCultureBias`,
      topK: 1,
      namespace: ns,
    }).catch(() => []);
    const raw = String(row?.[0]?.content ?? '').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<RolePersonalityProfile>;
        return {
          behaviorStyle: String(parsed.behaviorStyle ?? 'structured').slice(0, 80),
          responsibilityLevel:
            parsed.responsibilityLevel === 'low' || parsed.responsibilityLevel === 'medium' || parsed.responsibilityLevel === 'high'
              ? parsed.responsibilityLevel
              : 'high',
          departmentCultureBias: String(parsed.departmentCultureBias ?? 'execution-first').slice(0, 120),
        };
      } catch {
        // ignore parse errors and use defaults
      }
    }
    return {
      behaviorStyle: params.role === 'supervisor' ? 'structured-governance' : 'concise-delivery',
      responsibilityLevel: params.role === 'supervisor' ? 'high' : 'medium',
      departmentCultureBias: params.role === 'supervisor' ? 'risk-aware' : 'execution-first',
    };
  }

  async persistRoleProfile(params: {
    companyId: string;
    departmentSlug: string;
    role: 'supervisor' | 'employee';
    profile: RolePersonalityProfile;
    source: string;
  }): Promise<void> {
    const ns = `company:${params.companyId}:role_personality:${params.departmentSlug}:${params.role}`;
    await this.rpc('memory.entries.store', {
      companyId: params.companyId,
      actor: this.actor(),
      data: {
        namespace: ns,
        collectionLabel: `role_personality:${params.departmentSlug}:${params.role}`,
        sourceType: 'summary',
        content: JSON.stringify(params.profile),
        metadata: {
          source: params.source,
          role: params.role,
          departmentSlug: params.departmentSlug,
          updatedAt: new Date().toISOString(),
        },
      },
    }).catch(() => undefined);
  }
}

