import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { getMockRepositoryProvider } from '../../../../test/utils/test-helpers.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgentKeyBinding } from '../entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceService } from './marketplace.service.js';
import { AgentPurchaseService } from './agent-purchase.service.js';

describe('AgentPurchaseService', () => {
  it('purchase should insert reference-only assignment and omit key fields from event', async () => {
    const marketplaceService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'm1',
        pricingModel: 'free',
        priceCents: 0,
        boundModelName: 'gpt-4o',
      }),
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    } as any as MarketplaceService;

    const messaging = { publish: jest.fn().mockResolvedValue(undefined) } as any as MessagingService;

    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const assignmentsProvider = getMockRepositoryProvider<CompanyMarketplaceAgentKeyAssignment>(CompanyMarketplaceAgentKeyAssignment);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    assignmentsProvider.useValue.createQueryBuilder = jest.fn(() => insertChain);

    const manager = {
      getRepository: (cls: any) => {
        if (cls === CompanyMarketplaceAgentKeyAssignment) return assignmentsProvider.useValue;
        if (cls === MarketplaceAgentKeyBinding) return bindingsProvider.useValue;
        if (cls === LlmKey) return llmKeysProvider.useValue;
        throw new Error('unknown repo');
      },
    } as any;

    const dataSourceMock = {
      transaction: async (fn: any) => await fn(manager),
    } as any as DataSource;

    bindingsProvider.useValue.find.mockResolvedValue([{ llmKeyId: 'k1', sortOrder: 0, embeddingModelId: null } as any]);
    (llmKeysProvider.useValue.findByIds ?? llmKeysProvider.useValue.find).mockResolvedValue([
      { id: 'k1', modelName: 'gpt-4o', isActive: true } as any,
    ]);

    assignmentsProvider.useValue.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        companyId: 'c1',
        marketplaceAgentId: 'm1',
        assignedLlmKeyId: null,
        preferredLlmKeyId: null,
      } as any);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentPurchaseService,
        { provide: DataSource, useValue: dataSourceMock },
        { provide: MarketplaceService, useValue: marketplaceService },
        { provide: MessagingService, useValue: messaging },
        bindingsProvider,
        assignmentsProvider,
        llmKeysProvider,
        { provide: getRepositoryToken(MarketplaceAgentKeyBinding), useValue: bindingsProvider.useValue },
        { provide: getRepositoryToken(CompanyMarketplaceAgentKeyAssignment), useValue: assignmentsProvider.useValue },
        { provide: getRepositoryToken(LlmKey), useValue: llmKeysProvider.useValue },
      ],
    }).compile();

    const svc = moduleRef.get(AgentPurchaseService);
    await svc.purchase('m1', 'c1', { id: 'u1', roles: ['admin'] }, 'n1');

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'c1',
        marketplaceAgentId: 'm1',
        assignedLlmKeyId: null,
        preferredLlmKeyId: null,
      }),
    );
    const published = messaging.publish.mock.calls[0][0] as { data?: Record<string, unknown> };
    expect(published?.data?.assignedLlmKeyId).toBeUndefined();
    expect(published?.data?.assignedModelName).toBeUndefined();
    expect(marketplaceService.incrementUsage).toHaveBeenCalledWith('m1');
  });

  it('purchase should not increment usage when publish fails (legacy tolerant path)', async () => {
    const marketplaceService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'm1',
        pricingModel: 'free',
        priceCents: 0,
        boundModelName: 'gpt-4o',
      }),
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    } as any as MarketplaceService;
    const messaging = { publish: jest.fn().mockRejectedValue(new Error('mq down')) } as any as MessagingService;

    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const assignmentsProvider = getMockRepositoryProvider<CompanyMarketplaceAgentKeyAssignment>(CompanyMarketplaceAgentKeyAssignment);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const manager = {
      getRepository: (cls: any) => {
        if (cls === CompanyMarketplaceAgentKeyAssignment) return assignmentsProvider.useValue;
        if (cls === MarketplaceAgentKeyBinding) return bindingsProvider.useValue;
        if (cls === LlmKey) return llmKeysProvider.useValue;
        throw new Error('unknown repo');
      },
    } as any;
    const dataSourceMock = { transaction: async (fn: any) => await fn(manager) } as any as DataSource;

    bindingsProvider.useValue.find.mockResolvedValue([{ llmKeyId: 'k1', sortOrder: 0 } as any]);
    (llmKeysProvider.useValue.findByIds ?? llmKeysProvider.useValue.find).mockResolvedValue([
      { id: 'k1', modelName: 'gpt-4o', isActive: true } as any,
    ]);
    assignmentsProvider.useValue.findOne.mockResolvedValue({
      assignedLlmKeyId: 'k1',
    } as any);
    llmKeysProvider.useValue.findOne.mockResolvedValue({ id: 'k1', modelName: 'gpt-4o' } as any);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentPurchaseService,
        { provide: DataSource, useValue: dataSourceMock },
        { provide: MarketplaceService, useValue: marketplaceService },
        { provide: MessagingService, useValue: messaging },
        bindingsProvider,
        assignmentsProvider,
        llmKeysProvider,
        { provide: getRepositoryToken(MarketplaceAgentKeyBinding), useValue: bindingsProvider.useValue },
        { provide: getRepositoryToken(CompanyMarketplaceAgentKeyAssignment), useValue: assignmentsProvider.useValue },
        { provide: getRepositoryToken(LlmKey), useValue: llmKeysProvider.useValue },
      ],
    }).compile();

    const svc = moduleRef.get(AgentPurchaseService);
    const res = await svc.purchase('m1', 'c1', { id: 'u1', roles: ['admin'] }, 'n1');
    expect(res.eventId).toBeUndefined();
    expect(marketplaceService.incrementUsage).not.toHaveBeenCalled();
  });

  it('purchase should throw when requireEventPublished and publish fails', async () => {
    const marketplaceService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'm1',
        pricingModel: 'free',
        priceCents: 0,
        boundModelName: 'gpt-4o',
      }),
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    } as any as MarketplaceService;
    const messaging = { publish: jest.fn().mockRejectedValue(new Error('mq down')) } as any as MessagingService;

    const bindingsProvider = getMockRepositoryProvider<MarketplaceAgentKeyBinding>(MarketplaceAgentKeyBinding);
    const assignmentsProvider = getMockRepositoryProvider<CompanyMarketplaceAgentKeyAssignment>(CompanyMarketplaceAgentKeyAssignment);
    const llmKeysProvider = getMockRepositoryProvider<LlmKey>(LlmKey);
    const manager = {
      getRepository: (cls: any) => {
        if (cls === CompanyMarketplaceAgentKeyAssignment) return assignmentsProvider.useValue;
        if (cls === MarketplaceAgentKeyBinding) return bindingsProvider.useValue;
        if (cls === LlmKey) return llmKeysProvider.useValue;
        throw new Error('unknown repo');
      },
    } as any;
    const dataSourceMock = { transaction: async (fn: any) => await fn(manager) } as any as DataSource;

    bindingsProvider.useValue.find.mockResolvedValue([{ llmKeyId: 'k1', sortOrder: 0 } as any]);
    (llmKeysProvider.useValue.findByIds ?? llmKeysProvider.useValue.find).mockResolvedValue([
      { id: 'k1', modelName: 'gpt-4o', isActive: true } as any,
    ]);
    assignmentsProvider.useValue.findOne.mockResolvedValue({
      assignedLlmKeyId: 'k1',
    } as any);
    llmKeysProvider.useValue.findOne.mockResolvedValue({ id: 'k1', modelName: 'gpt-4o' } as any);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentPurchaseService,
        { provide: DataSource, useValue: dataSourceMock },
        { provide: MarketplaceService, useValue: marketplaceService },
        { provide: MessagingService, useValue: messaging },
        bindingsProvider,
        assignmentsProvider,
        llmKeysProvider,
        { provide: getRepositoryToken(MarketplaceAgentKeyBinding), useValue: bindingsProvider.useValue },
        { provide: getRepositoryToken(CompanyMarketplaceAgentKeyAssignment), useValue: assignmentsProvider.useValue },
        { provide: getRepositoryToken(LlmKey), useValue: llmKeysProvider.useValue },
      ],
    }).compile();

    const svc = moduleRef.get(AgentPurchaseService);
    await expect(
      svc.purchase('m1', 'c1', { id: 'u1', roles: ['admin'] }, 'n1', { requireEventPublished: true }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(marketplaceService.incrementUsage).not.toHaveBeenCalled();
  });

  it('purchase should reject when organizationNodeId is missing', async () => {
    const marketplaceService = {
      findOne: jest.fn(),
      incrementUsage: jest.fn(),
    } as any as MarketplaceService;
    const messaging = { publish: jest.fn() } as any as MessagingService;
    const dataSourceMock = { transaction: jest.fn() } as any as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentPurchaseService,
        { provide: DataSource, useValue: dataSourceMock },
        { provide: MarketplaceService, useValue: marketplaceService },
        { provide: MessagingService, useValue: messaging },
        { provide: getRepositoryToken(MarketplaceAgentKeyBinding), useValue: {} },
        { provide: getRepositoryToken(CompanyMarketplaceAgentKeyAssignment), useValue: {} },
        { provide: getRepositoryToken(LlmKey), useValue: {} },
      ],
    }).compile();

    const svc = moduleRef.get(AgentPurchaseService);
    await expect(svc.purchase('m1', 'c1', { id: 'u1', roles: ['admin'] })).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('organizationNodeId'),
      }),
    });
    expect(marketplaceService.findOne).not.toHaveBeenCalled();
  });

  it('purchase should reject non-admin callers without skipDirectPurchaseCheck', async () => {
    const marketplaceService = {
      findOne: jest.fn(),
      incrementUsage: jest.fn(),
    } as any as MarketplaceService;
    const messaging = { publish: jest.fn() } as any as MessagingService;
    const dataSourceMock = { transaction: jest.fn() } as any as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentPurchaseService,
        { provide: DataSource, useValue: dataSourceMock },
        { provide: MarketplaceService, useValue: marketplaceService },
        { provide: MessagingService, useValue: messaging },
        { provide: getRepositoryToken(MarketplaceAgentKeyBinding), useValue: {} },
        { provide: getRepositoryToken(CompanyMarketplaceAgentKeyAssignment), useValue: {} },
        { provide: getRepositoryToken(LlmKey), useValue: {} },
      ],
    }).compile();

    const svc = moduleRef.get(AgentPurchaseService);
    await expect(
      svc.purchase('m1', 'c1', { id: 'u1', roles: ['user'] }, 'org-node-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('招聘申请'),
      }),
    });
    expect(marketplaceService.findOne).not.toHaveBeenCalled();
  });
});

