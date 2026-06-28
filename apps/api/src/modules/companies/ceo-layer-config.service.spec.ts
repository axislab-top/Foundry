import { normalizeCeoLayerConfig } from '@foundry/skills';
import {
  CeoLayerConfigService,
  mergePlatformContextPolicyFallback,
  preserveContextPolicyOnLayerSave,
} from './ceo-layer-config.service.js';

describe('mergePlatformContextPolicyFallback', () => {
  it('overlays platform replay when company contextPolicy.replay is empty', () => {
    const out = mergePlatformContextPolicyFallback(
      {
        strategy: {
          modelName: 'deepseek-v4-flash',
          contextPolicy: {},
        },
      },
      {
        modelName: 'deepseek-v4-flash',
        keyIds: ['493022d7-ae53-43a0-954a-275eb2ab1149'],
      },
      {},
    );
    const replay = (out.strategy as Record<string, unknown>).contextPolicy as Record<string, unknown>;
    expect((replay.replay as Record<string, unknown>).modelName).toBe('deepseek-v4-flash');
    expect((replay.replay as Record<string, unknown>).keyIds).toEqual([
      '493022d7-ae53-43a0-954a-275eb2ab1149',
    ]);
  });

  it('does not override company-specific replay', () => {
    const out = mergePlatformContextPolicyFallback(
      {
        strategy: {
          contextPolicy: {
            replay: { modelName: 'company-replay-model', keyIds: ['k1'] },
          },
        },
      },
      { modelName: 'platform-model', keyIds: ['k2'] },
      {},
    );
    const replay = (out.strategy as Record<string, unknown>).contextPolicy as Record<string, unknown>;
    expect((replay.replay as Record<string, unknown>).modelName).toBe('company-replay-model');
  });
});

describe('preserveContextPolicyOnLayerSave', () => {
  it('keeps replay when saving L1/L2/L3 without contextPolicy.replay', () => {
    const existing = {
      strategy: {
        contextPolicy: {
          replay: { modelName: 'deepseek-v4-flash', keyIds: ['493022d7-ae53-43a0-954a-275eb2ab1149'] },
        },
        modelName: 'old',
      },
      orchestration: { modelName: 'old-orch' },
    };
    const incoming = normalizeCeoLayerConfig({
      strategy: { modelName: 'new-strategy', contextPolicy: {} },
      orchestration: { modelName: 'new-orch' },
      supervision: { modelName: 'new-sup' },
    });
    const out = preserveContextPolicyOnLayerSave(existing, incoming);
    const cp = (out.strategy as Record<string, unknown>).contextPolicy as Record<string, unknown>;
    expect((cp.replay as Record<string, unknown>).keyIds).toEqual([
      '493022d7-ae53-43a0-954a-275eb2ab1149',
    ]);
    expect((out.strategy as Record<string, unknown>).modelName).toBe('new-strategy');
  });
});

describe('CeoLayerConfigService.atomicEnsureAndSync', () => {
  it('persists merge result with advisory lock and full three layers on insert', async () => {
    const companyCeoRepo = {} as never;
    const marketplaceAgentsRepo = {} as never;
    const skillBindingService = {} as never;

    const saved: Array<{ companyId?: string; ceoLayerConfig?: Record<string, unknown> }> = [];
    const repo = {
      findOne: jest.fn(),
      save: jest.fn(async (x: { companyId?: string; ceoLayerConfig?: Record<string, unknown> }) => {
        saved.push(x);
        return x;
      }),
      create: jest.fn((x: unknown) => x),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => {
        const manager = {
          query: jest.fn(async () => undefined),
          getRepository: jest.fn(() => repo),
        };
        await cb(manager);
        expect(manager.query).toHaveBeenCalledWith(
          `SELECT pg_advisory_xact_lock(hashtext($1::text))`,
          ['ceo_layer_cfg:c1'],
        );
      }),
    };

    repo.findOne.mockResolvedValueOnce(null);

    const svc = new CeoLayerConfigService(
      companyCeoRepo as never,
      marketplaceAgentsRepo as never,
      dataSource as never,
      skillBindingService as never,
    );

    const out = await svc.atomicEnsureAndSync('c1', {
      classifier: { skillIds: ['s1'] },
    });

    expect(repo.save).toHaveBeenCalledTimes(1);
    const row = saved[0]!;
    expect(row.companyId).toBe('c1');
    expect(row.ceoLayerConfig?.classifier).toBeDefined();
    expect(row.ceoLayerConfig?.light).toEqual({ skillIds: [] });
    expect(row.ceoLayerConfig?.heavy).toEqual({ skillIds: [] });
    expect(out.classifier).toBeDefined();
    expect(out.light).toBeDefined();
    expect(out.heavy).toBeDefined();
  });

  it('runs one transaction per concurrent atomicEnsureAndSync call (lock query per tx)', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (x: unknown) => x),
      create: jest.fn((x: unknown) => x),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => {
        const manager = {
          query: jest.fn(async () => undefined),
          getRepository: jest.fn(() => repo),
        };
        await cb(manager);
      }),
    };

    const svc = new CeoLayerConfigService({} as never, {} as never, dataSource as never, {} as never);

    await Promise.all([
      svc.atomicEnsureAndSync('c-concurrent', { light: { systemPrompt: 'a' } }),
      svc.atomicEnsureAndSync('c-concurrent', { heavy: { systemPrompt: 'b' } }),
    ]);

    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });
});
