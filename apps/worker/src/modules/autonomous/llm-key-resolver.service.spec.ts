import { LlmKeyResolverService } from './llm-key-resolver.service.js';
import { Logger } from '@nestjs/common';

describe('LlmKeyResolverService', () => {
  function makeService(sendImpl: (pattern: string, payload: Record<string, unknown>) => Promise<any>) {
    const ceoQueue = { send: jest.fn(sendImpl) } as any;
    const monitoring = { incLlmKeyAcquireOutcome: jest.fn() } as any;
    const config = { getWorkerActorUserId: () => 'worker-user' } as any;
    const tenantContext = {
      getCompanyId: jest.fn(() => 'c1'),
      runWithCompanyId: jest.fn(async (_companyId: string, fn: () => Promise<any>) => fn()),
    } as any;
    const svc = new LlmKeyResolverService(config, ceoQueue, monitoring, tenantContext);
    return { svc, ceoQueue, monitoring };
  }

  it('throws when companyId is missing on acquireWithFallback', async () => {
    const { svc } = makeService(async () => ({}));
    await expect(
      svc.acquireWithFallback({
        requestedModelName: 'glm-4-flash',
      }),
    ).rejects.toThrow(/Tenant context missing/);
  });

  it('skips embedding fixed key and falls back to model acquire', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { svc, ceoQueue } = makeService(async (pattern: string) => {
      if (pattern === 'llmKeys.acquireById') {
        return {
          llmKeyId: 'k-embed',
          apiKey: 'sk-embed',
          providerKind: 'openai',
          requestUrl: 'https://example.test/v1',
          modelName: 'Qwen3-Embedding-8B',
        };
      }
      if (pattern === 'llmKeys.acquire') {
        return {
          llmKeyId: 'k-chat',
          apiKey: 'sk-chat',
          providerKind: 'openai',
          requestUrl: 'https://example.test/v1',
          modelName: 'Qwen3-235B-A22B',
        };
      }
      throw new Error(`unexpected pattern ${pattern}`);
    });

    const got = await svc.acquireWithFallback({
      companyId: 'c1',
      requestedModelName: 'Qwen3-235B-A22B',
      fixedLlmKeyId: 'k-embed',
    });

    expect(got.llmKeyId).toBe('k-chat');
    expect(ceoQueue.send).toHaveBeenCalledWith(
      'llmKeys.acquireById',
      expect.objectContaining({ companyId: 'c1', llmKeyId: 'k-embed' }),
    );
    expect(ceoQueue.send).toHaveBeenCalledWith(
      'llmKeys.acquire',
      expect.objectContaining({ companyId: 'c1', modelName: 'Qwen3-235B-A22B' }),
    );
    const keyLogPayloads = logSpy.mock.calls
      .filter((c) => String(c?.[0] ?? '').includes('llm_key.rpc_ok'))
      .map((c) => c?.[1] as Record<string, unknown>);
    expect(keyLogPayloads.length).toBeGreaterThan(0);
    expect(keyLogPayloads.some((x) => Object.prototype.hasOwnProperty.call(x, 'keyLength'))).toBe(true);
    expect(keyLogPayloads.some((x) => Object.prototype.hasOwnProperty.call(x, 'keyFingerprint'))).toBe(false);
  });

  it('pool candidate: skips key whose modelName mismatches requested, then acquires by model', async () => {
    const { svc, ceoQueue } = makeService(async (pattern: string, payload: Record<string, unknown>) => {
      if (pattern === 'llmKeys.acquireById') {
        const id = String(payload.llmKeyId ?? '');
        if (id === 'k-mimo') {
          return {
            llmKeyId: 'k-mimo',
            apiKey: 'sk-m',
            providerKind: 'openai',
            requestUrl: 'https://mimo.example/v1',
            modelName: 'mimo-v2.5-pro',
          };
        }
        throw new Error(`unexpected acquireById ${id}`);
      }
      if (pattern === 'llmKeys.acquire') {
        return {
          llmKeyId: 'k-glm',
          apiKey: 'sk-g',
          providerKind: 'openai',
          requestUrl: 'https://glm.example/v1',
          modelName: 'glm-4-flash',
        };
      }
      throw new Error(`unexpected pattern ${pattern}`);
    });

    const got = await svc.acquireWithFallback({
      companyId: 'c1',
      requestedModelName: 'glm-4-flash',
      candidateLlmKeyIds: ['k-mimo'],
    });

    expect(got.llmKeyId).toBe('k-glm');
    expect(got.modelName).toBe('glm-4-flash');
    expect(ceoQueue.send).toHaveBeenCalledWith(
      'llmKeys.acquire',
      expect.objectContaining({ companyId: 'c1', modelName: 'glm-4-flash' }),
    );
  });

  it('pool candidate: accepts key glm-4-flash-250414 when admin requests glm-4-flash (prefix family)', async () => {
    const { svc } = makeService(async (pattern: string) => {
      if (pattern === 'llmKeys.acquireById') {
        return {
          llmKeyId: 'k-glm-long',
          apiKey: 'sk',
          providerKind: 'openai',
          requestUrl: 'https://glm.example/v1',
          modelName: 'glm-4-flash-250414',
        };
      }
      throw new Error(`unexpected ${pattern}`);
    });

    const got = await svc.acquireWithFallback({
      companyId: 'c1',
      requestedModelName: 'glm-4-flash',
      candidateLlmKeyIds: ['k-glm-long'],
    });

    expect(got.llmKeyId).toBe('k-glm-long');
    expect(got.modelName).toBe('glm-4-flash-250414');
  });

  it('exclusive replay pool: no global acquire when pool keys all mismatch layer model', async () => {
    const { svc, ceoQueue } = makeService(async (pattern: string) => {
      if (pattern === 'llmKeys.acquireById') {
        return {
          llmKeyId: 'k-mimo',
          apiKey: 'sk',
          providerKind: 'openai',
          requestUrl: 'https://mimo.example/v1',
          modelName: 'mimo-v2.5-pro',
        };
      }
      if (pattern === 'llmKeys.acquire') {
        throw new Error('should not reach global acquire');
      }
      throw new Error(`unexpected ${pattern}`);
    });

    await expect(
      svc.acquireWithFallback({
        companyId: 'c1',
        requestedModelName: 'glm-4-flash',
        candidateLlmKeyIds: ['k-mimo'],
        exclusiveKeyPoolAfterExhausted: true,
      }),
    ).rejects.toThrow(/exclusive_key_pool_exhausted/);

    expect(ceoQueue.send).not.toHaveBeenCalledWith('llmKeys.acquire', expect.anything());
  });

  it('fixed key missing falls back to model acquire without throwing', async () => {
    const { svc, ceoQueue } = makeService(async (pattern: string) => {
      if (pattern === 'llmKeys.acquireById') {
        throw new Error('LLM key not found: k-stale');
      }
      if (pattern === 'llmKeys.acquire') {
        return {
          llmKeyId: 'k-chat',
          apiKey: 'sk-chat',
          providerKind: 'openai',
          requestUrl: 'https://example.test/v1',
          modelName: 'glm-4-flash',
        };
      }
      throw new Error(`unexpected ${pattern}`);
    });

    const got = await svc.acquireWithFallback({
      companyId: 'c1',
      requestedModelName: 'glm-4-flash',
      fixedLlmKeyId: 'k-stale',
    });

    expect(got.llmKeyId).toBe('k-chat');
    expect(ceoQueue.send).toHaveBeenCalledWith(
      'llmKeys.acquire',
      expect.objectContaining({ companyId: 'c1', modelName: 'glm-4-flash' }),
    );
  });
});

