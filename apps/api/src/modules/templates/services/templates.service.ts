import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { TemplateContentPayload } from '@contracts/events';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { QueryTemplatesDto } from '../dto/query-templates.dto.js';
import type { TemplatePreviewDto } from '../dto/template-preview.dto.js';
import { CompanyTemplate } from '../entities/company-template.entity.js';
import { TemplateAgentMapping } from '../entities/template-agent-mapping.entity.js';
import { TemplateContent } from '../entities/template-content.entity.js';

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(CompanyTemplate)
    private readonly templatesRepo: Repository<CompanyTemplate>,
    @InjectRepository(TemplateContent)
    private readonly contentsRepo: Repository<TemplateContent>,
    @InjectRepository(TemplateAgentMapping)
    private readonly mappingsRepo: Repository<TemplateAgentMapping>,
  ) {}

  async findAll(query: QueryTemplatesDto): Promise<PaginatedResult<CompanyTemplate>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.templatesRepo
      .createQueryBuilder('t')
      .where('t.is_published = :pub', { pub: true });

    if (query.industry) {
      qb.andWhere('t.industry = :industry', { industry: query.industry });
    }
    if (query.search) {
      qb.andWhere('(t.name ILIKE :s OR t.description ILIKE :s OR t.slug ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    const sortCol =
      query.sortBy === 'name'
        ? 't.name'
        : query.sortBy === 'created_at'
          ? 't.created_at'
          : 't.usage_count';
    qb.orderBy(sortCol, query.sortOrder ?? 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findOne(id: string): Promise<CompanyTemplate> {
    const t = await this.templatesRepo.findOne({
      where: { id, isPublished: true },
    });
    if (!t) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '模板不存在或未上架',
      });
    }
    return t;
  }

  async getPreview(id: string): Promise<TemplatePreviewDto> {
    const template = await this.templatesRepo.findOne({
      where: { id, isPublished: true },
    });
    if (!template) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '模板不存在或未上架',
      });
    }

    const row = await this.contentsRepo.findOne({ where: { templateId: id } });
    const payload = this.parseContent(row?.content);

    const nodes = payload.organization?.nodes ?? [];
    const agents = payload.agents ?? [];

    const mappings = await this.mappingsRepo.find({
      where: { templateId: id },
      relations: ['marketplaceAgent'],
      order: { sortOrder: 'ASC' },
    });

    return {
      id: template.id,
      slug: template.slug,
      name: template.name,
      description: template.description,
      industry: template.industry,
      scale: template.scale,
      templateType: template.templateType,
      previewImageUrl: template.previewImageUrl,
      priceCents: template.priceCents,
      currency: template.currency,
      version: template.version,
      usageCount: template.usageCount,
      ratingAvg: template.ratingAvg,
      estimatedMonthlyCostHint:
        template.priceCents > 0 ? `自 ${template.priceCents / 100} ${template.currency}` : '免费起步',
      organizationSummary: {
        nodeCount: nodes.length,
        titles: nodes.map((n) => n.title).slice(0, 12),
      },
      agentSummaries: agents.map((a) => ({
        name: a.name,
        role: a.role,
        expertise: a.expertise,
      })),
      linkedMarketplaceAgents: mappings.map((m) => ({
        id: m.marketplaceAgent.id,
        slug: m.marketplaceAgent.slug,
        name: m.marketplaceAgent.name,
        roleHint: m.roleHint,
        sortOrder: m.sortOrder,
      })),
    };
  }

  async incrementUsage(templateId: string): Promise<void> {
    await this.templatesRepo.increment({ id: templateId }, 'usageCount', 1);
  }

  private parseContent(raw: Record<string, unknown> | undefined): TemplateContentPayload {
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    return raw as unknown as TemplateContentPayload;
  }
}
