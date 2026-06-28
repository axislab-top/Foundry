import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { CompanyToolsetSetting } from '../entities/company-toolset-setting.entity.js';

const MAX_TOOLSETS = 32;
const MAX_TOOLSET_NAME_LEN = 64;
const TOOLSET_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function normalizeToolsetNames(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,;\s]+/g) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const name = String(item ?? '').trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    if (!TOOLSET_NAME_RE.test(name)) {
      throw new BadRequestException(`Invalid toolset name: ${name.slice(0, 80)}`);
    }
    seen.add(name);
    out.push(name);
    if (out.length >= MAX_TOOLSETS) break;
  }
  return out;
}

@Injectable()
export class CompanyToolsetSettingsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    @InjectRepository(CompanyToolsetSetting)
    private readonly settingsRepo: Repository<CompanyToolsetSetting>,
  ) {}

  getByCompanyId(companyId: string): Promise<CompanyToolsetSetting | null> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      return this.settingsRepo.findOne({ where: { companyId } });
    });
  }

  /** Worker / runtime: company DB row only (env fallback handled on worker). */
  resolveEnabledToolsetsForCompany(companyId: string): Promise<string[]> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const row = await this.settingsRepo.findOne({ where: { companyId } });
      return normalizeToolsetNames(row?.enabledToolsets ?? []);
    });
  }

  upsert(companyId: string, params: { enabledToolsets?: unknown }): Promise<CompanyToolsetSetting> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const enabledToolsets = normalizeToolsetNames(params.enabledToolsets ?? []);
      const existing = await this.settingsRepo.findOne({ where: { companyId } });
      return this.settingsRepo.save(
        this.settingsRepo.create({
          ...(existing ?? { companyId }),
          companyId,
          enabledToolsets,
        }),
      );
    });
  }

  remove(companyId: string): Promise<{ ok: true }> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.settingsRepo.delete({ companyId });
      return { ok: true as const };
    });
  }
}
