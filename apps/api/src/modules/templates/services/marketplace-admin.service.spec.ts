import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getMockRepositoryProvider } from '../../../../test/utils/test-helpers.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../../llm-keys/entities/llm-key-daily-usage.entity.js';
import { LlmModel } from '../../llm-models/entities/llm-model.entity.js';
import { MarketplaceAgentKeyBinding } from '../entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceAgent } from '../entities/marketplace-agent.entity.js';
import { PlatformDepartment } from '../entities/platform-department.entity.js';
import { Skill } from '../../skills/entities/skill.entity.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { SkillBindingValidatorService } from '../../skills/services/skill-binding-validator.service.js';
import { RecommendedSkillsValidator } from '../validators/recommended-skills.validator.js';
import { MarketplaceBindingsCacheService } from '../marketplace-bindings-cache.service.js';
import { MarketplaceAdminService } from './marketplace-admin.service.js';
import { MarketplaceSkillVersionService } from './marketplace-skill-version.service.js';
import { CeoLayerConfigService } from '../../companies/services/ceo-layer-config.service.js';

describe('MarketplaceAdminService', () => {
  it('create should require departmentRoles for department_head category', async () => {
    const agentsProvider = getMockRepositoryProvider<MarketplaceAgent>(MarketplaceAgent);
    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const skillsProvider = getMockRepositoryProvider<Skill>(Skill);
    const embeddingProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    const platformDeptProvider = getMockRepositoryProvider<PlatformDepartment>(PlatformDepartment);

    agentsProvider.useValue.exists = jest.fn().mockResolvedValue(false);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceAdminService,
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        agentsProvider,
        bindingsProvider,
        llmKeysProvider,
        dailyProvider,
        skillsProvider,
        embeddingProvider,
        platformDeptProvider,
        {
          provide: RecommendedSkillsValidator,
          useValue: { assertAllGlobalSkillsExist: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MessagingService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConfigService,
          useValue: {
            getMarketplaceBindingNotifyMaxCompanies: () => 500,
            getAgentMarketplaceConfigStaleHours: () => 72,
          },
        },
        {
          provide: MarketplaceBindingsCacheService,
          useValue: { invalidate: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: TenantContextService,
          useValue: { runWithCompanyId: jest.fn((_cid: string, fn: () => Promise<unknown>) => fn()) },
        },
        {
          provide: SkillBindingValidatorService,
          useValue: {
            validateSkillsBelongToCompany: jest.fn().mockResolvedValue(undefined),
            evaluateHighRiskSkillBindingApprovalGate: jest.fn().mockResolvedValue({ status: 'allowed' }),
          },
        },
        {
          provide: MarketplaceSkillVersionService,
          useValue: { emitAfterRecommendedVersionPinsChanged: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CeoLayerConfigService,
          useValue: { propagateMarketplaceCeoTemplateToAllCompanies: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    const svc = moduleRef.get(MarketplaceAdminService);
    await expect(
      svc.create({
        name: 'Ops Head',
        agentCategory: 'department_head',
        departmentRoles: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create should persist boundModelName when it exists in chat model library', async () => {
    const agentsProvider = getMockRepositoryProvider<MarketplaceAgent>(MarketplaceAgent);
    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const skillsProvider = getMockRepositoryProvider<Skill>(Skill);
    const embeddingProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    const platformDeptProvider = getMockRepositoryProvider<PlatformDepartment>(PlatformDepartment);

    agentsProvider.useValue.exists = jest.fn().mockResolvedValue(false);
    embeddingProvider.useValue.findOne.mockResolvedValue({
      id: 'm1',
      modelName: 'gpt-4o',
      modelType: 'chat',
      isActive: true,
    });
    agentsProvider.useValue.create.mockImplementation((row: Partial<MarketplaceAgent>) => row);
    agentsProvider.useValue.save.mockImplementation(async (row: Partial<MarketplaceAgent>) => ({
      id: 'new-agent',
      slug: 'support-bot',
      ...row,
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceAdminService,
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        agentsProvider,
        bindingsProvider,
        llmKeysProvider,
        dailyProvider,
        skillsProvider,
        embeddingProvider,
        platformDeptProvider,
        {
          provide: RecommendedSkillsValidator,
          useValue: { assertAllGlobalSkillsExist: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MessagingService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConfigService,
          useValue: {
            getMarketplaceBindingNotifyMaxCompanies: () => 500,
            getAgentMarketplaceConfigStaleHours: () => 72,
          },
        },
        {
          provide: MarketplaceBindingsCacheService,
          useValue: { invalidate: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: TenantContextService,
          useValue: { runWithCompanyId: jest.fn((_cid: string, fn: () => Promise<unknown>) => fn()) },
        },
        {
          provide: SkillBindingValidatorService,
          useValue: {
            validateSkillsBelongToCompany: jest.fn().mockResolvedValue(undefined),
            evaluateHighRiskSkillBindingApprovalGate: jest.fn().mockResolvedValue({ status: 'allowed' }),
          },
        },
        {
          provide: MarketplaceSkillVersionService,
          useValue: { emitAfterRecommendedVersionPinsChanged: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CeoLayerConfigService,
          useValue: { propagateMarketplaceCeoTemplateToAllCompanies: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    const svc = moduleRef.get(MarketplaceAdminService);
    const created = await svc.create({
      name: 'Support Bot',
      agentCategory: 'employee',
      boundModelName: 'gpt-4o',
    });

    expect(created.slug).toBe('support-bot');
    expect(agentsProvider.useValue.create).toHaveBeenCalledWith(
      expect.objectContaining({ boundModelName: 'gpt-4o' }),
    );
  });

  it('update should reject keyBindings with mismatched model', async () => {
    const agentsProvider = getMockRepositoryProvider<MarketplaceAgent>(MarketplaceAgent);
    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const skillsProvider = getMockRepositoryProvider<Skill>(Skill);
    const embeddingProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    const platformDeptProvider = getMockRepositoryProvider<PlatformDepartment>(PlatformDepartment);
    platformDeptProvider.useValue.findOne.mockResolvedValue(null);

    const manager = {
      getRepository: (cls: any) => {
        if (cls === MarketplaceAgent) return agentsProvider.useValue;
        if (cls === MarketplaceAgentKeyBinding) return bindingsProvider.useValue;
        if (cls === LlmKey) return llmKeysProvider.useValue;
        if (cls === LlmModel) return embeddingProvider.useValue;
        if (cls === PlatformDepartment) return platformDeptProvider.useValue;
        throw new Error('unknown repo');
      },
    } as any;

    const dataSourceMock = {
      transaction: async (fn: any) => await fn(manager),
    } as any as DataSource;

    const agentRow: Partial<MarketplaceAgent> = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      boundModelName: 'gpt-4o',
      name: 'A',
      slug: 'a',
      pricingModel: 'free',
      priceCents: 0,
      isPublished: false,
    };

    agentsProvider.useValue.findOne.mockResolvedValue(agentRow as any);
    agentsProvider.useValue.save.mockImplementation(async (x: any) => x);

    llmKeysProvider.useValue.find.mockResolvedValue([
      { id: 'k1', modelName: 'gpt-4o-mini', provider: 'openai', dailyQuotaTokens: '100', isActive: true } as any,
      { id: 'k2', modelName: 'gpt-4o', provider: 'openai', dailyQuotaTokens: '100', isActive: true } as any,
    ]);
    bindingsProvider.useValue.find.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceAdminService,
        { provide: DataSource, useValue: dataSourceMock },
        agentsProvider,
        bindingsProvider,
        llmKeysProvider,
        dailyProvider,
        skillsProvider,
        embeddingProvider,
        platformDeptProvider,
        {
          provide: RecommendedSkillsValidator,
          useValue: { assertAllGlobalSkillsExist: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MessagingService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConfigService,
          useValue: {
            getMarketplaceBindingNotifyMaxCompanies: () => 500,
            getAgentMarketplaceConfigStaleHours: () => 72,
          },
        },
        {
          provide: MarketplaceBindingsCacheService,
          useValue: { invalidate: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: TenantContextService,
          useValue: { runWithCompanyId: jest.fn((_cid: string, fn: () => Promise<unknown>) => fn()) },
        },
        {
          provide: SkillBindingValidatorService,
          useValue: {
            validateSkillsBelongToCompany: jest.fn().mockResolvedValue(undefined),
            evaluateHighRiskSkillBindingApprovalGate: jest.fn().mockResolvedValue({ status: 'allowed' }),
          },
        },
        {
          provide: MarketplaceSkillVersionService,
          useValue: { emitAfterRecommendedVersionPinsChanged: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CeoLayerConfigService,
          useValue: { propagateMarketplaceCeoTemplateToAllCompanies: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    const svc = moduleRef.get(MarketplaceAdminService);
    await expect(
      svc.update(agentRow.id!, {
        boundModelName: 'gpt-4o',
        keyBindings: [
          { llmKeyId: 'k1', sortOrder: 0 },
          { llmKeyId: 'k2', sortOrder: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update should sync ceo layer modelName from keyBindings and trigger propagation', async () => {
    const agentsProvider = getMockRepositoryProvider<MarketplaceAgent>(MarketplaceAgent);
    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const dailyProvider = getMockRepositoryProvider<LlmKeyDailyUsage>(LlmKeyDailyUsage);
    const skillsProvider = getMockRepositoryProvider<Skill>(Skill);
    const embeddingProvider = getMockRepositoryProvider<LlmModel>(LlmModel);
    const platformDeptProvider = getMockRepositoryProvider<PlatformDepartment>(PlatformDepartment);
    platformDeptProvider.useValue.findOne.mockResolvedValue(null);

    const manager = {
      getRepository: (cls: any) => {
        if (cls === MarketplaceAgent) return agentsProvider.useValue;
        if (cls === MarketplaceAgentKeyBinding) return bindingsProvider.useValue;
        if (cls === LlmKey) return llmKeysProvider.useValue;
        if (cls === LlmModel) return embeddingProvider.useValue;
        if (cls === PlatformDepartment) return platformDeptProvider.useValue;
        throw new Error('unknown repo');
      },
    } as any;

    const dataSourceMock = {
      transaction: async (fn: any) => await fn(manager),
      query: jest.fn().mockResolvedValue([]),
    } as any as DataSource;

    const agentRow: Partial<MarketplaceAgent> = {
      id: 'ceo-template',
      boundModelName: null,
      name: 'CEO',
      slug: 'ceo',
      pricingModel: 'free',
      priceCents: 0,
      isPublished: true,
      ceoLayerConfig: {
        strategy: { skillIds: ['s1'] },
        orchestration: { skillIds: ['s2'] },
        supervision: { skillIds: ['s3'] },
      },
      recommendedSkillVersionIds: [],
    };

    agentsProvider.useValue.findOne.mockResolvedValue(agentRow as any);
    agentsProvider.useValue.save.mockImplementation(async (x: any) => x);
    bindingsProvider.useValue.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { llmKeyId: 'k1', sortOrder: 0, ceoLayer: 'strategy' },
        { llmKeyId: 'k2', sortOrder: 0, ceoLayer: 'orchestration' },
        { llmKeyId: 'k3', sortOrder: 0, ceoLayer: 'supervision' },
      ]);
    bindingsProvider.useValue.delete.mockResolvedValue({ affected: 1 });
    bindingsProvider.useValue.create.mockImplementation((x: any) => x);
    bindingsProvider.useValue.save.mockResolvedValue(undefined);

    llmKeysProvider.useValue.find.mockResolvedValue([
      { id: 'k1', modelName: 'model-classifier', provider: 'openai', dailyQuotaTokens: '100', isActive: true } as any,
      { id: 'k2', modelName: 'model-light', provider: 'openai', dailyQuotaTokens: '100', isActive: true } as any,
      { id: 'k3', modelName: 'model-heavy', provider: 'openai', dailyQuotaTokens: '100', isActive: true } as any,
    ]);

    const ceoLayerConfigService = {
      propagateMarketplaceCeoTemplateToAllCompanies: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceAdminService,
        { provide: DataSource, useValue: dataSourceMock },
        agentsProvider,
        bindingsProvider,
        llmKeysProvider,
        dailyProvider,
        skillsProvider,
        embeddingProvider,
        platformDeptProvider,
        {
          provide: RecommendedSkillsValidator,
          useValue: { assertAllGlobalSkillsExist: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MessagingService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConfigService,
          useValue: {
            getMarketplaceBindingNotifyMaxCompanies: () => 500,
            getAgentMarketplaceConfigStaleHours: () => 72,
          },
        },
        {
          provide: MarketplaceBindingsCacheService,
          useValue: { invalidate: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: TenantContextService,
          useValue: { runWithCompanyId: jest.fn((_cid: string, fn: () => Promise<unknown>) => fn()) },
        },
        {
          provide: SkillBindingValidatorService,
          useValue: {
            validateSkillsBelongToCompany: jest.fn().mockResolvedValue(undefined),
            evaluateHighRiskSkillBindingApprovalGate: jest.fn().mockResolvedValue({ status: 'allowed' }),
          },
        },
        {
          provide: MarketplaceSkillVersionService,
          useValue: { emitAfterRecommendedVersionPinsChanged: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CeoLayerConfigService,
          useValue: ceoLayerConfigService,
        },
      ],
    }).compile();

    const svc = moduleRef.get(MarketplaceAdminService);
    await svc.update(agentRow.id!, {
      keyBindings: [
        { llmKeyId: 'k1', sortOrder: 0, ceoLayer: 'strategy' },
        { llmKeyId: 'k2', sortOrder: 0, ceoLayer: 'orchestration' },
        { llmKeyId: 'k3', sortOrder: 0, ceoLayer: 'supervision' },
      ],
    });

    expect(ceoLayerConfigService.propagateMarketplaceCeoTemplateToAllCompanies).toHaveBeenCalledTimes(1);
    const latestSaved = agentsProvider.useValue.save.mock.calls.at(-1)?.[0] as any;
    expect(latestSaved.ceoLayerConfig.strategy.modelName).toBe('model-classifier');
    expect(latestSaved.ceoLayerConfig.orchestration.modelName).toBe('model-light');
    expect(latestSaved.ceoLayerConfig.supervision.modelName).toBe('model-heavy');
    expect(latestSaved.ceoLayerConfig.strategy.keyIds).toEqual(['k1']);
    expect(latestSaved.ceoLayerConfig.orchestration.keyIds).toEqual(['k2']);
    expect(latestSaved.ceoLayerConfig.supervision.keyIds).toEqual(['k3']);
  });
});

