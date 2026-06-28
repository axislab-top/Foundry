import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MentionAliasConfig } from '@foundry/collaboration-core';
import { CompanyHeartbeatConfig } from '../../companies/entities/company-heartbeat-config.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';

const META_KEY = 'collaborationMentionAliases';

@Injectable()
export class MentionAliasesService {
  constructor(
    @InjectRepository(CompanyHeartbeatConfig)
    private readonly heartbeatRepo: Repository<CompanyHeartbeatConfig>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
  ) {}

  private async assertOwnerOrAdmin(companyId: string, actorId: string, roles?: string[]) {
    if (roles?.includes('admin')) return;
    const m = await this.membershipsRepo.findOne({ where: { companyId, userId: actorId, isActive: true } });
    if (!m || !['owner', 'admin'].includes(m.role)) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '仅公司 Owner/Admin 可管理提及别名' });
    }
  }

  private async getOrCreate(companyId: string) {
    let row = await this.heartbeatRepo.findOne({ where: { companyId } });
    if (!row) {
      row = this.heartbeatRepo.create({ companyId, enabled: true, frequency: 'daily', metadata: {} });
      row = await this.heartbeatRepo.save(row);
    }
    return row;
  }

  async list(companyId: string): Promise<MentionAliasConfig[]> {
    const row = await this.getOrCreate(companyId);
    const aliases = row.metadata?.[META_KEY];
    return Array.isArray(aliases) ? (aliases as MentionAliasConfig[]) : [];
  }

  async upsert(
    companyId: string,
    actor: { id: string; roles?: string[] },
    alias: MentionAliasConfig,
  ): Promise<MentionAliasConfig[]> {
    await this.assertOwnerOrAdmin(companyId, actor.id, actor.roles);
    const row = await this.getOrCreate(companyId);
    const curr = await this.list(companyId);
    const key = alias.label.trim().toLowerCase();
    const next = curr.filter((a) => a.label.trim().toLowerCase() !== key);
    next.push(alias);
    row.metadata = { ...(row.metadata ?? {}), [META_KEY]: next };
    await this.heartbeatRepo.save(row);
    return next;
  }

  async remove(
    companyId: string,
    actor: { id: string; roles?: string[] },
    label: string,
  ): Promise<MentionAliasConfig[]> {
    await this.assertOwnerOrAdmin(companyId, actor.id, actor.roles);
    const row = await this.getOrCreate(companyId);
    const key = label.trim().toLowerCase();
    const curr = await this.list(companyId);
    const next = curr.filter((a) => a.label.trim().toLowerCase() !== key);
    row.metadata = { ...(row.metadata ?? {}), [META_KEY]: next };
    await this.heartbeatRepo.save(row);
    return next;
  }
}
