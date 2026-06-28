import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PolicyVersion } from '../entities/policy-version.entity.js';
import { PolicyAuditService } from './policy-audit.service.js';

@Injectable()
export class PolicyVersionService {
  constructor(
    @InjectRepository(PolicyVersion)
    private readonly repo: Repository<PolicyVersion>,
    private readonly audit: PolicyAuditService,
  ) {}

  async getActive(companyId: string, policyKey: string): Promise<PolicyVersion | null> {
    return await this.repo.findOne({ where: { companyId, policyKey, isActive: true } });
  }

  async list(companyId: string, policyKey: string, limit = 50): Promise<PolicyVersion[]> {
    return await this.repo.find({
      where: { companyId, policyKey },
      order: { version: 'DESC' as any },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async publishNewVersion(params: {
    companyId: string;
    policyKey: string;
    value: Record<string, unknown>;
    actorId: string | null;
    activate?: boolean;
  }): Promise<PolicyVersion> {
    const latest = await this.repo.findOne({
      where: { companyId: params.companyId, policyKey: params.policyKey },
      order: { version: 'DESC' as any },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    const row = this.repo.create({
      companyId: params.companyId,
      policyKey: params.policyKey,
      version: nextVersion,
      value: params.value,
      isActive: false,
      activatedAt: null,
      deactivatedAt: null,
      createdBy: params.actorId,
    });
    const saved = await this.repo.save(row);
    await this.audit.append({
      companyId: params.companyId,
      policyKey: params.policyKey,
      policyVersion: saved.version,
      eventType: 'published',
      actorId: params.actorId,
    });
    if (params.activate) {
      await this.activateVersion({
        companyId: params.companyId,
        policyKey: params.policyKey,
        version: saved.version,
        actorId: params.actorId,
      });
    }
    return saved;
  }

  async activateVersion(params: {
    companyId: string;
    policyKey: string;
    version: number;
    actorId: string | null;
  }): Promise<PolicyVersion> {
    const target = await this.repo.findOne({
      where: { companyId: params.companyId, policyKey: params.policyKey, version: params.version },
    });
    if (!target) {
      throw Object.assign(new Error('policy version not found'), { status: 404 });
    }
    const now = new Date();
    await this.repo.update(
      { companyId: params.companyId, policyKey: params.policyKey, isActive: true },
      { isActive: false, deactivatedAt: now },
    );
    target.isActive = true;
    target.activatedAt = now;
    target.deactivatedAt = null;
    const saved = await this.repo.save(target);
    await this.audit.append({
      companyId: params.companyId,
      policyKey: params.policyKey,
      policyVersion: saved.version,
      eventType: 'rollback',
      actorId: params.actorId,
      payload: { action: 'activate' },
    });
    return saved;
  }

  async recordUsedForApproval(params: {
    companyId: string;
    policyKey: string;
    policyVersion: number;
    actorId: string | null;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.audit.append({
      companyId: params.companyId,
      policyKey: params.policyKey,
      policyVersion: params.policyVersion,
      eventType: 'used_for_approval',
      actorId: params.actorId,
      payload: params.payload,
    });
  }
}

