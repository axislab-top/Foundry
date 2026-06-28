import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MemoryService } from './memory.service.js';
import { companyNamespace } from '../utils/memory-namespace.js';
import { CacheService } from '../../../common/cache/cache.service.js';

type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  industry_code: string | null;
  scale: string | null;
  goal: string | null;
  description: string | null;
  timezone: string | null;
  default_language: string | null;
  updated_at: string | Date | null;
};

type OrgNodeRow = {
  id: string;
  parent_id: string | null;
  type: string;
  name: string;
  description: string | null;
};

export type CompanyProfileStructured = {
  companyId: string;
  name: string;
  industry?: string | null;
  industryCode?: string | null;
  scale?: string | null;
  goal?: string | null;
  description?: string | null;
  timezone?: string | null;
  defaultLanguage?: string | null;
  org?: {
    departmentCount: number;
    departmentsTop: Array<{ id: string; name: string; description?: string | null }>;
  };
  generatedAt: string;
  sourceUpdatedAt?: string | null;
  version: 1;
};

export type CompanyProfileSection = 'overview' | 'org';

@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger(CompanyProfileService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly memory: MemoryService,
    private readonly cache: CacheService,
  ) {}

  private buildText(structured: CompanyProfileStructured): string {
    const lines: string[] = [];
    lines.push(`公司名称：${structured.name}`);
    if (structured.industry) lines.push(`行业：${structured.industry}`);
    if (structured.scale) lines.push(`规模：${structured.scale}`);
    if (structured.timezone) lines.push(`时区：${structured.timezone}`);
    if (structured.defaultLanguage) lines.push(`默认语言：${structured.defaultLanguage}`);
    if (structured.goal) lines.push(`使命/目标：${structured.goal}`);
    if (structured.description) lines.push(`简介：${structured.description}`);
    if (structured.org) {
      lines.push(`组织：部门数 ${structured.org.departmentCount}`);
      if (structured.org.departmentsTop.length) {
        lines.push(
          `部门（Top ${structured.org.departmentsTop.length}）：${structured.org.departmentsTop
            .map((d) => d.name)
            .join('、')}`,
        );
      }
    }
    lines.push(`生成时间：${structured.generatedAt}`);
    return lines.join('\n');
  }

  private buildSectionText(structured: CompanyProfileStructured, section: CompanyProfileSection): string {
    if (section === 'org') {
      const lines: string[] = [];
      lines.push(`公司名称：${structured.name}`);
      if (structured.org) {
        lines.push(`组织：部门数 ${structured.org.departmentCount}`);
        if (structured.org.departmentsTop.length) {
          for (const d of structured.org.departmentsTop) {
            const desc = d.description?.trim();
            lines.push(`- 部门 ${d.name}${desc ? `：${desc}` : ''}（id=${d.id}）`);
          }
        }
      } else {
        lines.push('组织：暂无组织节点数据');
      }
      lines.push(`生成时间：${structured.generatedAt}`);
      return lines.join('\n');
    }

    // overview (default)
    const lines: string[] = [];
    lines.push(`公司名称：${structured.name}`);
    if (structured.industry) lines.push(`行业：${structured.industry}`);
    if (structured.scale) lines.push(`规模：${structured.scale}`);
    if (structured.timezone) lines.push(`时区：${structured.timezone}`);
    if (structured.defaultLanguage) lines.push(`默认语言：${structured.defaultLanguage}`);
    if (structured.goal) lines.push(`使命/目标：${structured.goal}`);
    if (structured.description) lines.push(`简介：${structured.description}`);
    lines.push(`生成时间：${structured.generatedAt}`);
    return lines.join('\n');
  }

  private async fetchCompany(companyId: string): Promise<CompanyRow> {
    const rows = await this.dataSource.query(
      `
      SELECT
        id,
        name,
        industry,
        industry_code,
        scale,
        goal,
        description,
        timezone,
        default_language,
        updated_at
      FROM companies
      WHERE id = $1
      LIMIT 1
      `,
      [companyId],
    );
    const row = rows?.[0] as CompanyRow | undefined;
    if (!row) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: '公司不存在，无法同步公司档案',
      });
    }
    return row;
  }

  private async fetchOrgNodes(companyId: string): Promise<OrgNodeRow[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        id,
        parent_id,
        type,
        name,
        description
      FROM organization_nodes
      WHERE company_id = $1
      ORDER BY order_no ASC, created_at ASC
      `,
      [companyId],
    );
    return (rows ?? []) as OrgNodeRow[];
  }

  private buildStructured(params: {
    company: CompanyRow;
    orgNodes: OrgNodeRow[];
    generatedAt: string;
  }): CompanyProfileStructured {
    const depts = params.orgNodes.filter((n) => n.type === 'department');
    const departmentsTop = depts.slice(0, 12).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
    }));
    const updatedAt =
      params.company.updated_at instanceof Date
        ? params.company.updated_at.toISOString()
        : typeof params.company.updated_at === 'string'
          ? params.company.updated_at
          : null;
    return {
      companyId: params.company.id,
      name: params.company.name,
      industry: params.company.industry,
      industryCode: params.company.industry_code,
      scale: params.company.scale,
      goal: params.company.goal,
      description: params.company.description,
      timezone: params.company.timezone,
      defaultLanguage: params.company.default_language,
      org: {
        departmentCount: depts.length,
        departmentsTop,
      },
      generatedAt: params.generatedAt,
      sourceUpdatedAt: updatedAt,
      version: 1,
    };
  }

  private async deletePreviousProfiles(companyId: string): Promise<void> {
    await this.dataSource.query(
      `
      DELETE FROM memory_entries me
      USING memory_collections mc
      WHERE
        me.company_id = $1
        AND me.collection_id = mc.id
        AND mc.namespace = $2
        AND me.source_type = 'manual'
        AND (me.metadata->>'kind') = 'company_profile'
      `,
      [companyId, companyNamespace()],
    );
  }

  async syncCompanyProfile(params: {
    companyId: string;
    trigger: string;
  }): Promise<{ generatedAt: string; skipped?: true; reason?: 'cooldown'; lockTtlSec?: number }> {
    const lockKey = `company-profile-sync-lock:${params.companyId}`;
    // Atomic on Redis adapter (incr); best-effort on memory adapter (default impl).
    const n = await this.cache.increment(lockKey, 1);
    if (n === 1) {
      // First winner sets TTL. Do NOT extend TTL on subsequent calls.
      await this.cache.expire(lockKey, 30);
    } else {
      const lockTtlSec = await this.cache.ttl(lockKey).catch(() => -2);
      this.logger.log('company profile sync skipped (cooldown)', {
        companyId: params.companyId,
        trigger: params.trigger,
        lockTtlSec,
      });
      return {
        generatedAt: new Date().toISOString(),
        skipped: true,
        reason: 'cooldown',
        lockTtlSec: Number.isFinite(lockTtlSec) ? lockTtlSec : undefined,
      };
    }

    const generatedAt = new Date().toISOString();
    const company = await this.fetchCompany(params.companyId);
    const orgNodes = await this.fetchOrgNodes(params.companyId);
    const structured = this.buildStructured({ company, orgNodes, generatedAt });
    const textOverview = this.buildSectionText(structured, 'overview');
    const textOrg = this.buildSectionText(structured, 'org');

    await this.deletePreviousProfiles(params.companyId);

    await this.memory.storeEntry({
      companyId: params.companyId,
      namespace: companyNamespace(),
      collectionLabel: 'CompanyProfile',
      content: textOverview,
      sourceType: 'manual',
      metadata: {
        kind: 'company_profile',
        section: 'overview',
        format: 'text',
        version: structured.version,
        generatedAt,
        sourceUpdatedAt: structured.sourceUpdatedAt,
        trigger: params.trigger,
      },
      skipAccessCheck: true,
    });
    await this.memory.storeEntry({
      companyId: params.companyId,
      namespace: companyNamespace(),
      collectionLabel: 'CompanyProfile',
      content: textOrg,
      sourceType: 'manual',
      metadata: {
        kind: 'company_profile',
        section: 'org',
        format: 'text',
        version: structured.version,
        generatedAt,
        sourceUpdatedAt: structured.sourceUpdatedAt,
        trigger: params.trigger,
      },
      skipAccessCheck: true,
    });

    await this.memory.storeEntry({
      companyId: params.companyId,
      namespace: companyNamespace(),
      collectionLabel: 'CompanyProfile',
      content: JSON.stringify(structured),
      sourceType: 'manual',
      metadata: {
        kind: 'company_profile',
        section: 'overview',
        format: 'json',
        version: structured.version,
        generatedAt,
        sourceUpdatedAt: structured.sourceUpdatedAt,
        trigger: params.trigger,
      },
      skipAccessCheck: true,
    });

    this.logger.log('company profile synced to memory', {
      companyId: params.companyId,
      generatedAt,
      deptCount: structured.org?.departmentCount ?? 0,
    });
    return { generatedAt };
  }

  async getLatestCompanyProfile(params: {
    companyId: string;
    section?: string | null;
  }): Promise<{ text: string | null; structured: CompanyProfileStructured | null; generatedAt: string | null }> {
    const section = (params.section ?? '').trim() || null;
    const rows = await this.dataSource.query(
      `
      SELECT me.content, me.metadata, me.created_at
      FROM memory_entries me
      INNER JOIN memory_collections mc ON mc.id = me.collection_id
      WHERE
        me.company_id = $1
        AND mc.namespace = $2
        AND me.source_type = 'manual'
        AND (me.metadata->>'kind') = 'company_profile'
        ${section ? `AND (me.metadata->>'section') = $3` : ''}
      ORDER BY me.created_at DESC
      LIMIT 20
      `,
      section ? [params.companyId, companyNamespace(), section] : [params.companyId, companyNamespace()],
    );
    const list = (rows ?? []) as Array<{ content: string; metadata: any; created_at: string | Date }>;
    const txt = list.find((r) => (r?.metadata?.format ?? '') === 'text') ?? null;
    const js = list.find((r) => (r?.metadata?.format ?? '') === 'json') ?? null;
    const generatedAt =
      (txt?.metadata?.generatedAt as string | undefined) ??
      (js?.metadata?.generatedAt as string | undefined) ??
      null;
    let structured: CompanyProfileStructured | null = null;
    if (js?.content) {
      try {
        structured = JSON.parse(js.content) as CompanyProfileStructured;
      } catch {
        structured = null;
      }
    }
    return { text: txt?.content ?? null, structured, generatedAt };
  }
}

