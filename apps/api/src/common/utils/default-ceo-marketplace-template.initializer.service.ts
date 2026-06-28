import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceAgent } from '../../modules/templates/entities/marketplace-agent.entity.js';

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

/**
 * 启动时确保存在 CEO 商城模板（slug=ceo）。
 *
 * 该模板用于新建公司时的 CEO 三层配置初始化与技能同步流程的“模板来源”。
 * 若生产环境需要严格治理，可将 DEFAULT_CEO_TEMPLATE_SEED=false 并在发布前通过后台写入完整模板。
 */
@Injectable()
export class DefaultCeoMarketplaceTemplateInitializerService implements OnModuleInit {
  private readonly logger = new Logger(DefaultCeoMarketplaceTemplateInitializerService.name);

  constructor(
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
  ) {}

  async onModuleInit(): Promise<void> {
    const shouldSeed = readBooleanEnv('DEFAULT_CEO_TEMPLATE_SEED', true);
    if (!shouldSeed) {
      this.logger.log('CEO marketplace template seeding disabled');
      return;
    }

    const existing = await this.marketplaceAgentsRepo.findOne({ where: { slug: 'ceo' } as any });
    if (existing) {
      // Ensure it is usable for bootstrap in dev/test by default.
      if (!existing.isPublished) {
        existing.isPublished = true;
        await this.marketplaceAgentsRepo.save(existing);
        this.logger.warn('CEO marketplace template existed but unpublished; auto-published', {
          id: existing.id,
        });
      }
      return;
    }

    const created = (await this.marketplaceAgentsRepo.save(
      this.marketplaceAgentsRepo.create({
        slug: 'ceo',
        name: 'CEO',
        description: '默认 CEO 商城模板（系统自动创建）。',
        expertise: '公司战略与跨部门协调',
        systemPrompt: '你是公司的 CEO，负责目标拆解、优先级管理与跨部门协同。',
        boundModelName: null,
        ceoLayerConfig: {},
        recommendedSkills: null,
        recommendedSkillVersionIds: null,
        skillTags: ['ceo', 'management'],
        isPublished: true,
        agentCategory: 'ceo',
        departmentRoles: [],
        iconUrl: null,
        metadata: { systemSeed: true },
      } as any),
    )) as unknown as MarketplaceAgent;

    this.logger.warn('Seeded default CEO marketplace template (slug=ceo)', { id: created.id });
  }
}

