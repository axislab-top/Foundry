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
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompaniesService } from '../../companies/companies.service.js';
import type { DepartmentPlacementDto } from '../../companies/dto/department-placement.dto.js';
import type { CompanyHeartbeatFrequency } from '../../companies/entities/company-heartbeat-config.entity.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';
import { CollaborationBootstrapService } from '../../collaboration/services/collaboration-bootstrap.service.js';
import { MemoryService } from '../../memory/services/memory.service.js';
import { CompanyTemplate } from '../entities/company-template.entity.js';
import { TemplateContent } from '../entities/template-content.entity.js';
import { TemplatesService } from './templates.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

type ExtendedTemplateContentPayload = TemplateContentPayload & {
  heartbeat?: {
    enabled?: boolean;
    frequency?: CompanyHeartbeatFrequency;
    metadata?: { excludedDirectorAgentIds?: string[] };
  };
  departmentPlacements?: Array<{
    name: string;
    headAgentSlug?: string | null;
    memberAgentSlugs?: string[];
  }>;
};

@Injectable()
export class TemplateImporterService {
  private readonly logger = new Logger(TemplateImporterService.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly memoryService: MemoryService,
    private readonly rooms: ChatRoomService,
    private readonly messages: ChatMessageService,
    private readonly collaborationBootstrap: CollaborationBootstrapService,
    private readonly templatesService: TemplatesService,
    @InjectRepository(CompanyTemplate)
    private readonly templatesRepo: Repository<CompanyTemplate>,
    @InjectRepository(TemplateContent)
    private readonly contentsRepo: Repository<TemplateContent>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * 基于模板创建新公司并发布 template.imported（重载初始化由 Worker 异步完成）。
   */
  async importCompanyTemplate(
    templateId: string,
    actor: Actor,
    options?: {
      companyName?: string;
      industry?: string;
      heartbeatEnabled?: boolean;
      heartbeatFrequency?: CompanyHeartbeatFrequency;
      excludedDirectorAgentIds?: string[];
    },
  ): Promise<{ companyId: string; templateId: string; mainRoomId: string | null }> {
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
    const content = (row?.content ?? {}) as ExtendedTemplateContentPayload;
    const defaults = content.defaults ?? {};
    const placements = this.normalizeDepartmentPlacements(content.departmentPlacements);

    const name = options?.companyName?.trim() || `${template.name}（来自模板）`;
    const company = await this.companiesService.create(
      {
        name,
        industry: options?.industry?.trim() || template.industry || undefined,
        scale: (template.scale as 'small' | 'medium' | 'large' | undefined) ?? undefined,
        goal: defaults.goal,
        initialBudget: defaults.initialBudget,
        departmentPlacements: placements,
      },
      actor,
    );

    const heartbeatEnabled = options?.heartbeatEnabled ?? content.heartbeat?.enabled;
    const heartbeatFrequency = options?.heartbeatFrequency ?? content.heartbeat?.frequency;
    const excludedDirectorAgentIds = options?.excludedDirectorAgentIds?.length
      ? options.excludedDirectorAgentIds
      : content.heartbeat?.metadata?.excludedDirectorAgentIds;

    if (
      heartbeatEnabled !== undefined ||
      heartbeatFrequency !== undefined ||
      excludedDirectorAgentIds !== undefined
    ) {
      await this.companiesService.updateHeartbeatConfig(
        company.id,
        {
          enabled: heartbeatEnabled,
          frequency: heartbeatFrequency,
          metadata: excludedDirectorAgentIds ? { excludedDirectorAgentIds } : undefined,
        },
        actor,
      );
    }

    await this.seedInitialMemory(company.id, actor, content);
    const mainRoomId = await this.ensureMainRoomAndCeoGreeting(company.id, actor.id, name);
    await this.templatesService.incrementUsage(templateId);

    await this.publishImported(template, company.id, actor.id, content);

    return { companyId: company.id, templateId: template.id, mainRoomId };
  }

  private async ensureMainRoomAndCeoGreeting(
    companyId: string,
    actorUserId: string,
    companyName: string,
  ): Promise<string | null> {
    try {
      await this.collaborationBootstrap.ensureMainRoomForCompany(companyId, actorUserId, companyName);
      await this.collaborationBootstrap.ensureDepartmentRoomsForCompany(
        companyId,
        actorUserId,
      );
      const main = await this.rooms.findMainRoom(companyId);
      if (!main) {
        return null;
      }
      const ceo = await this.agentsRepo.findOne({
        where: { companyId, role: 'ceo', status: 'active' },
      });
      if (!ceo) {
        return main.id;
      }
      await this.messages.appendAgentMessage(
        companyId,
        main.id,
        ceo.id,
        '公司已初始化，Heartbeat 已开启，我将每日报告。',
        'system',
        { source: 'template_import', kind: 'bootstrap_greeting' },
      );
      return main.id;
    } catch (e: unknown) {
      this.logger.warn('failed to prepare main room greeting', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private normalizeDepartmentPlacements(
    placements: ExtendedTemplateContentPayload['departmentPlacements'],
  ): DepartmentPlacementDto[] | undefined {
    if (!Array.isArray(placements) || placements.length === 0) {
      return undefined;
    }
    const normalized: DepartmentPlacementDto[] = [];
    for (const p of placements) {
      const name = String(p?.name ?? '').trim();
      if (!name) {
        continue;
      }
      const headAgentSlug = p?.headAgentSlug ? String(p.headAgentSlug).trim() : null;
      const members: string[] = Array.isArray(p?.memberAgentSlugs)
        ? [...new Set(p.memberAgentSlugs.map((s) => String(s ?? '').trim()).filter(Boolean))]
        : [];
      normalized.push({
        name,
        headAgentSlug: headAgentSlug || null,
        memberAgentSlugs: members,
      });
    }
    return normalized.length > 0 ? normalized : undefined;
  }

  private async seedInitialMemory(
    companyId: string,
    actor: Actor,
    content: TemplateContentPayload,
  ): Promise<void> {
    const seeds = Array.isArray(content.memorySeeds) ? content.memorySeeds : [];
    for (const seed of seeds) {
      if (!seed || typeof seed !== 'object') {
        continue;
      }
      const raw = seed as Record<string, unknown>;
      const text = String(raw.content ?? '').trim();
      if (!text) {
        continue;
      }
      const namespace = String(raw.namespace ?? 'company:bootstrap').trim() || 'company:bootstrap';
      const collectionLabel = String(raw.collectionLabel ?? 'Template Memory Seeds').trim();
      try {
        await this.memoryService.storeEntry({
          companyId,
          namespace,
          collectionLabel: collectionLabel || 'Template Memory Seeds',
          content: text,
          sourceType: 'summary',
          metadata: {
            seedType: 'template_import',
            templateSeedCategory: raw.category ?? null,
            templateSeedTags: Array.isArray(raw.tags) ? raw.tags : [],
            importedBy: actor.id,
          },
          actor,
        });
      } catch (e: unknown) {
        this.logger.warn('template memory seed store failed', {
          companyId,
          namespace,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
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
