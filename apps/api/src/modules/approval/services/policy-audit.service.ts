import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PolicyAuditLog } from '../entities/policy-audit-log.entity.js';

@Injectable()
export class PolicyAuditService {
  constructor(
    @InjectRepository(PolicyAuditLog)
    private readonly repo: Repository<PolicyAuditLog>,
  ) {}

  async append(params: {
    companyId: string;
    policyKey: string;
    policyVersion: number;
    eventType: 'published' | 'rollback' | 'used_for_approval';
    actorId: string | null;
    payload?: Record<string, unknown>;
  }): Promise<PolicyAuditLog> {
    const row = this.repo.create({
      companyId: params.companyId,
      policyKey: params.policyKey,
      policyVersion: params.policyVersion,
      eventType: params.eventType,
      actorId: params.actorId,
      payload: params.payload ?? null,
    });
    return await this.repo.save(row);
  }

  async list(companyId: string, limit = 200): Promise<PolicyAuditLog[]> {
    return await this.repo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}

