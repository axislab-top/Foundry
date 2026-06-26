import { Injectable } from '@nestjs/common';

export interface PolicySnapshot {
  companyId: string;
  version: number;
  createdAt: number;
  createdBy: string;
  policyJson: Record<string, unknown>;
  reason?: string;
}

/**
 * Phase 5 MVP: policy version registry abstraction.
 *
 * Host apps should replace this with a durable store (DB + audit log).
 */
@Injectable()
export class PolicyVersionService {
  private readonly byCompany = new Map<string, PolicySnapshot[]>();

  getCurrentVersion(companyId: string): number {
    const list = this.byCompany.get(companyId) ?? [];
    return list.length ? list[list.length - 1]!.version : 1;
  }

  getSnapshot(companyId: string, version: number): PolicySnapshot | null {
    const list = this.byCompany.get(companyId) ?? [];
    return list.find((s) => s.version === version) ?? null;
  }

  list(companyId: string): PolicySnapshot[] {
    return [...(this.byCompany.get(companyId) ?? [])];
  }

  publishNewVersion(params: {
    companyId: string;
    createdBy: string;
    policyJson: Record<string, unknown>;
    reason?: string;
  }): PolicySnapshot {
    const prev = this.getCurrentVersion(params.companyId);
    const next = Math.max(prev + 1, 2);
    const snap: PolicySnapshot = {
      companyId: params.companyId,
      version: next,
      createdAt: Date.now(),
      createdBy: params.createdBy,
      policyJson: params.policyJson,
      reason: params.reason,
    };
    const list = this.byCompany.get(params.companyId) ?? [];
    list.push(snap);
    this.byCompany.set(params.companyId, list);
    return snap;
  }

  rollbackToVersion(params: { companyId: string; version: number }): PolicySnapshot | null {
    const snap = this.getSnapshot(params.companyId, params.version);
    if (!snap) return null;
    // In-memory MVP: rollback means "current version pointer" becomes target by truncation.
    const list = this.byCompany.get(params.companyId) ?? [];
    const idx = list.findIndex((s) => s.version === params.version);
    if (idx < 0) return null;
    this.byCompany.set(params.companyId, list.slice(0, idx + 1));
    return snap;
  }
}

