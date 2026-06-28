import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMockRepositoryProvider } from '../../../../test/utils/test-helpers.js';
import { MessagingService } from '@service/messaging';
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompaniesService } from '../../companies/companies.service.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';
import { CollaborationBootstrapService } from '../../collaboration/services/collaboration-bootstrap.service.js';
import { MemoryService } from '../../memory/services/memory.service.js';
import { CompanyTemplate } from '../entities/company-template.entity.js';
import { TemplateContent } from '../entities/template-content.entity.js';
import { TemplatesService } from './templates.service.js';
import { TemplateImporterService } from './template-importer.service.js';

describe('TemplateImporterService', () => {
  const actor = { id: 'u-1', roles: ['admin'] };

  function makeTemplate() {
    return {
      id: 'tpl-1',
      slug: 'tech-saas-startup-v1',
      name: 'Tech SaaS Startup',
      industry: 'Tech',
      scale: 'small',
      version: '1.0.0',
      isPublished: true,
      priceCents: 0,
    } as any as CompanyTemplate;
  }

  it('normalizes departmentPlacements before create', async () => {
    const templatesRepo = getMockRepositoryProvider<CompanyTemplate>(CompanyTemplate);
    const contentsRepo = getMockRepositoryProvider<TemplateContent>(TemplateContent);
    const companiesService = {
      create: jest.fn().mockResolvedValue({ id: 'c-1' }),
      updateHeartbeatConfig: jest.fn().mockResolvedValue({}),
    } as any as CompaniesService;
    const memoryService = {
      storeEntry: jest.fn().mockResolvedValue({}),
    } as any as MemoryService;
    const templatesService = {
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    } as any as TemplatesService;
    const rooms = { findMainRoom: jest.fn().mockResolvedValue({ id: 'room-main' }) } as any as ChatRoomService;
    const messages = { appendAgentMessage: jest.fn().mockResolvedValue({ id: 'm1' }) } as any as ChatMessageService;
    const collaborationBootstrap = { ensureMainRoomForCompany: jest.fn().mockResolvedValue(undefined) } as any as CollaborationBootstrapService;
    const agentsRepo = getMockRepositoryProvider<Agent>(Agent);
    const messaging = { publish: jest.fn().mockResolvedValue(undefined) } as any as MessagingService;
    agentsRepo.useValue.findOne.mockResolvedValue({ id: 'ceo-1' });

    templatesRepo.useValue.findOne.mockResolvedValue(makeTemplate());
    contentsRepo.useValue.findOne.mockResolvedValue({
      templateId: 'tpl-1',
      content: {
        departmentPlacements: [
          { name: '  Marketing  ', headAgentSlug: ' mkt-director ', memberAgentSlugs: [' writer ', 'writer', ''] },
          { name: '   ', headAgentSlug: 'ignored', memberAgentSlugs: ['x'] },
        ],
      },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplateImporterService,
        { provide: CompaniesService, useValue: companiesService },
        { provide: MemoryService, useValue: memoryService },
        { provide: ChatRoomService, useValue: rooms },
        { provide: ChatMessageService, useValue: messages },
        { provide: CollaborationBootstrapService, useValue: collaborationBootstrap },
        { provide: TemplatesService, useValue: templatesService },
        { provide: MessagingService, useValue: messaging },
        { provide: getRepositoryToken(CompanyTemplate), useValue: templatesRepo.useValue },
        { provide: getRepositoryToken(TemplateContent), useValue: contentsRepo.useValue },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo.useValue },
      ],
    }).compile();

    const svc = moduleRef.get(TemplateImporterService);
    const res = await svc.importCompanyTemplate('tpl-1', actor);

    expect(companiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentPlacements: [
          {
            name: 'Marketing',
            headAgentSlug: 'mkt-director',
            memberAgentSlugs: ['writer'],
          },
        ],
      }),
      actor,
    );
    expect(messages.appendAgentMessage).toHaveBeenCalledWith(
      'c-1',
      'room-main',
      'ceo-1',
      '公司已初始化，Heartbeat 已开启，我将每日报告。',
      'system',
      expect.objectContaining({ kind: 'bootstrap_greeting' }),
    );
    expect(res.mainRoomId).toBe('room-main');
  });

  it('uses option heartbeat overrides before template defaults', async () => {
    const templatesRepo = getMockRepositoryProvider<CompanyTemplate>(CompanyTemplate);
    const contentsRepo = getMockRepositoryProvider<TemplateContent>(TemplateContent);
    const companiesService = {
      create: jest.fn().mockResolvedValue({ id: 'c-2' }),
      updateHeartbeatConfig: jest.fn().mockResolvedValue({}),
    } as any as CompaniesService;
    const memoryService = {
      storeEntry: jest.fn().mockResolvedValue({}),
    } as any as MemoryService;
    const templatesService = {
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    } as any as TemplatesService;
    const rooms = { findMainRoom: jest.fn().mockResolvedValue({ id: 'room-main' }) } as any as ChatRoomService;
    const messages = { appendAgentMessage: jest.fn().mockResolvedValue({ id: 'm1' }) } as any as ChatMessageService;
    const collaborationBootstrap = { ensureMainRoomForCompany: jest.fn().mockResolvedValue(undefined) } as any as CollaborationBootstrapService;
    const agentsRepo = getMockRepositoryProvider<Agent>(Agent);
    const messaging = { publish: jest.fn().mockResolvedValue(undefined) } as any as MessagingService;
    agentsRepo.useValue.findOne.mockResolvedValue({ id: 'ceo-1' });

    templatesRepo.useValue.findOne.mockResolvedValue(makeTemplate());
    contentsRepo.useValue.findOne.mockResolvedValue({
      templateId: 'tpl-1',
      content: {
        heartbeat: {
          enabled: true,
          frequency: 'weekly',
          metadata: { excludedDirectorAgentIds: ['d-from-template'] },
        },
      },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplateImporterService,
        { provide: CompaniesService, useValue: companiesService },
        { provide: MemoryService, useValue: memoryService },
        { provide: ChatRoomService, useValue: rooms },
        { provide: ChatMessageService, useValue: messages },
        { provide: CollaborationBootstrapService, useValue: collaborationBootstrap },
        { provide: TemplatesService, useValue: templatesService },
        { provide: MessagingService, useValue: messaging },
        { provide: getRepositoryToken(CompanyTemplate), useValue: templatesRepo.useValue },
        { provide: getRepositoryToken(TemplateContent), useValue: contentsRepo.useValue },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo.useValue },
      ],
    }).compile();

    const svc = moduleRef.get(TemplateImporterService);
    await svc.importCompanyTemplate('tpl-1', actor, {
      heartbeatEnabled: false,
      heartbeatFrequency: 'daily',
      excludedDirectorAgentIds: ['d-1', 'd-2'],
    });

    expect(companiesService.updateHeartbeatConfig).toHaveBeenCalledWith(
      'c-2',
      {
        enabled: false,
        frequency: 'daily',
        metadata: { excludedDirectorAgentIds: ['d-1', 'd-2'] },
      },
      actor,
    );
  });

  it('continues when one memory seed store fails', async () => {
    const templatesRepo = getMockRepositoryProvider<CompanyTemplate>(CompanyTemplate);
    const contentsRepo = getMockRepositoryProvider<TemplateContent>(TemplateContent);
    const companiesService = {
      create: jest.fn().mockResolvedValue({ id: 'c-3' }),
      updateHeartbeatConfig: jest.fn().mockResolvedValue({}),
    } as any as CompaniesService;
    const memoryService = {
      storeEntry: jest
        .fn()
        .mockRejectedValueOnce(new Error('memory down'))
        .mockResolvedValueOnce({}),
    } as any as MemoryService;
    const templatesService = {
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    } as any as TemplatesService;
    const rooms = { findMainRoom: jest.fn().mockResolvedValue({ id: 'room-main' }) } as any as ChatRoomService;
    const messages = { appendAgentMessage: jest.fn().mockResolvedValue({ id: 'm1' }) } as any as ChatMessageService;
    const collaborationBootstrap = { ensureMainRoomForCompany: jest.fn().mockResolvedValue(undefined) } as any as CollaborationBootstrapService;
    const agentsRepo = getMockRepositoryProvider<Agent>(Agent);
    const messaging = { publish: jest.fn().mockResolvedValue(undefined) } as any as MessagingService;
    agentsRepo.useValue.findOne.mockResolvedValue({ id: 'ceo-1' });

    templatesRepo.useValue.findOne.mockResolvedValue(makeTemplate());
    contentsRepo.useValue.findOne.mockResolvedValue({
      templateId: 'tpl-1',
      content: {
        memorySeeds: [
          { content: 'seed-a', namespace: 'company:bootstrap', tags: ['a'] },
          { content: 'seed-b', namespace: 'company:bootstrap', tags: ['b'] },
        ],
      },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplateImporterService,
        { provide: CompaniesService, useValue: companiesService },
        { provide: MemoryService, useValue: memoryService },
        { provide: ChatRoomService, useValue: rooms },
        { provide: ChatMessageService, useValue: messages },
        { provide: CollaborationBootstrapService, useValue: collaborationBootstrap },
        { provide: TemplatesService, useValue: templatesService },
        { provide: MessagingService, useValue: messaging },
        { provide: getRepositoryToken(CompanyTemplate), useValue: templatesRepo.useValue },
        { provide: getRepositoryToken(TemplateContent), useValue: contentsRepo.useValue },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo.useValue },
      ],
    }).compile();

    const svc = moduleRef.get(TemplateImporterService);
    await expect(svc.importCompanyTemplate('tpl-1', actor)).resolves.toEqual({
      companyId: 'c-3',
      templateId: 'tpl-1',
      mainRoomId: 'room-main',
    });
    expect(memoryService.storeEntry).toHaveBeenCalledTimes(2);
    expect(templatesService.incrementUsage).toHaveBeenCalledWith('tpl-1');
  });
});

