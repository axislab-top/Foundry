import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { TemplateContentPayload, TemplateImportedEvent } from '@contracts/events';
import { CompaniesService } from '../../companies/companies.service.js';
import { CompanyTemplate } from '../entities/company-template.entity.js';
import { TemplateContent } from '../entities/template-content.entity.js';
import { TemplatesService } from './templates.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class TemplateImporterService {
  private readonly logger = new Logger(TemplateImporterService.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly templatesService: TemplatesService,
    @InjectRepository(CompanyTemplate)
    private readonly templatesRepo: Repository<CompanyTemplate>,
    @InjectRepository(TemplateContent)
    private readonly contentsRepo: Repository<TemplateContent>,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * 基于模板创建新公司并发布 template.imported（重载初始化由 Worker 异步完成）。
   */
  async importCompanyTemplate(
    templateId: string,
    actor: Actor,
    options?: { companyName?: string },
  ): Promise<{ companyId: string; templateId: string }> {
    const template = await this.templatesRepo.findOne({
      where: { id: templateId, isPublished: true },
    });
    if (!template) {
      throw new BadRequestException({ message: '模板不存在或未上架' });
    }

    if (template.priceCents > 0) {
      throw new UnprocessableEntityException({
        message: '付费模板需先完成计费集成后再开放',
      });
    }

    const row = await this.contentsRepo.findOne({ where: { templateId } });
    const content = (row?.content ?? {}) as unknown as TemplateContentPayload;
    const defaults = content.defaults ?? {};

    const name = options?.companyName?.trim() || `${template.name}（来自模板）`;
    const company = await this.companiesService.create(
      {
        name,
        industry: template.industry ?? undefined,
        scale: (template.scale as 'small' | 'medium' | 'large' | undefined) ?? undefined,
        goal: defaults.goal,
        initialBudget: defaults.initialBudget,
      },
      actor,
    );

    await this.templatesService.incrementUsage(templateId);

    await this.publishImported(template, company.id, actor.id, content);

    return { companyId: company.id, templateId: template.id };
  }

  private async publishImported(
    template: CompanyTemplate,
    companyId: string,
    importedBy: string,
    content: TemplateContentPayload,
  ): Promise<void> {
    try {
      const event: TemplateImportedEvent = {
        eventId: randomUUID(),
        eventType: 'template.imported',
        aggregateId: template.id,
        aggregateType: 'template',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          templateId: template.id,
          templateSlug: template.slug,
          templateVersion: template.version,
          companyId,
          importedBy,
          content,
          importedAt: new Date().toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'template.imported',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.error('Failed to publish template.imported', {
        templateId: template.id,
        companyId,
        error: e?.message,
      });
    }
  }
}
