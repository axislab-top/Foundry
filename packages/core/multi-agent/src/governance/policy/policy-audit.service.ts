import { Injectable } from '@nestjs/common';

export interface PolicyAuditEntry {
  companyId: string;
  policyVersion: number;
  eventType: 'published' | 'rollback' | 'used_for_approval';
  occurredAt: number;
  actorId: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Phase 5 MVP: in-memory audit trail for policy lifecycle events.
 * Host apps should persist and secure this log.
 */
@Injectable()
export class PolicyAuditService {
  private readonly entries: PolicyAuditEntry[] = [];

  append(entry: PolicyAuditEntry): void {
    this.entries.push(entry);
  }

  list(companyId: string, limit = 200): PolicyAuditEntry[] {
    const out = this.entries.filter((e) => e.companyId === companyId);
    return out.slice(Math.max(0, out.length - Math.min(limit, 200)));
  }
}

