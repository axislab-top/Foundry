import { clearEmbeddingProjectionMatrixCache } from '../../common/llm/embedding-projection.util.js';
import { EmbeddingResolverService } from './embedding-resolver.service.js';

describe('EmbeddingResolverService', () => {
  const companyId = 'c-1';
  const agentId = 'a-1';
  const mpId = 'ma-1';

  function buildService(deps: {
    agent?: { metadata?: Record<string, unknown> } | null;
    assignment?: { assignedEmbeddingModelId: string | null } | null;
    companyOverrideId?: string | null;
    platformDefaultId?: string | null;
    poolFallbackModelId?: string | null;
    acquire?: (id: string) => Promise<{
      embeddingModelId: string;
      modelName: string;
      provider: string;
      llmKeyId?: string | null;
      dimensions: number | null;
      apiKey: string | null;
      requestUrl: string;
      endpointUrl?: string;
    }>;
    cacheGet?: (key: string) => Promise<string | null>;
    fetchImpl?: typeof fetch;
    memoryCfg?: Partial<{
      embeddingProjectionEnabled: boolean;
      embeddingModelOutputDim: number;
      embeddingTargetDim: number;
      embeddingDimensions: number;
    }>;
  }) {
    const agentsRepo = {
      findOne: jest.fn(async () => deps.agent ?? null),
    };
    const keyAssignmentsRepo = {
      findOne: jest.fn(async () => (deps.assignment !== undefined ? deps.assignment : null)),
    };
    const embeddingModels = {
      acquireCredentials: jest.fn(
        deps.acquire ??
          (async (id: string) => ({
            embeddingModelId: id,
            modelName: 'm',
            provider: 'openai',
            llmKeyId: 'lk-1',
            dimensions: 4,
            apiKey: 'sk-test',
            requestUrl: 'https://api.openai.com/v1',
            endpointUrl: 'https://api.openai.com/v1/embeddings',
          })),
      ),
    };
    const companyEmbeddingSettings = {
      resolveEffectiveDefaultModelId: jest.fn(async () => deps.companyOverrideId ?? null),
    };
    const platformSettings = {
      getEffectiveMemoryDefaultEmbeddingModelId: jest.fn(async () => deps.platformDefaultId ?? null),
    };
    const cache = {
      get: jest.fn(async (key: string) => (deps.cacheGet ? await deps.cacheGet(key) : null)),
      set: jest.fn(async () => true),
    };

    const origFetch = global.fetch;
    if (deps.fetchImpl) {
      global.fetch = deps.fetchImpl as typeof fetch;
    }

    const monitoring = { getMetricsManager: jest.fn(() => null) };
    const config = {
      getMemoryEmbeddingPoolFallbackModelId: () => {
        if (!Object.prototype.hasOwnProperty.call(deps, 'poolFallbackModelId')) return undefined;
        const v = deps.poolFallbackModelId;
        return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
      },
      getMemoryConfig: () => ({
        embeddingProjectionEnabled: false,
        embeddingModelOutputDim: 4,
        embeddingTargetDim: 4,
        embeddingDimensions: 4,
        ...deps.memoryCfg,
      }),
    };

    const svc = new EmbeddingResolverService(
      agentsRepo as never,
      keyAssignmentsRepo as never,
      embeddingModels as never,
      companyEmbeddingSettings as never,
      platformSettings as never,
      cache as never,
      monitoring as never,
      config as never,
    );

    return {
      svc,
      agentsRepo,
      embeddingModels,
      companyEmbeddingSettings,
      platformSettings,
      cache,
      restoreFetch: () => (global.fetch = origFetch),
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    clearEmbeddingProjectionMatrixCache();
  });

  it('resolveCandidateModelIds uses company override when present (short-circuit)', async () => {
    const { svc, restoreFetch } = buildService({
      companyOverrideId: 'company-emb',
      agent: { metadata: { marketplaceAgentId: mpId } },
      assignment: { assignedEmbeddingModelId: 'asgn-emb' },
    });
    try {
      const ids = await svc.resolveCandidateModelIds({ companyId, agentId });
      expect(ids).toEqual(['company-emb']);
    } finally {
      restoreFetch();
    }
  });

  it('resolveCandidateModelIds falls back to company assignment when no override', async () => {
    const { svc, restoreFetch } = buildService({
      companyOverrideId: null,
      agent: { metadata: { marketplaceAgentId: mpId } },
      assignment: { assignedEmbeddingModelId: 'asgn-emb' },
    });
    try {
      const ids = await svc.resolveCandidateModelIds({ companyId, agentId });
      expect(ids).toEqual(['asgn-emb']);
    } finally {
      restoreFetch();
    }
  });

  it('resolveCandidateModelIds uses platform default when company override is missing', async () => {
    const { svc, restoreFetch } = buildService({
      companyOverrideId: null,
      platformDefaultId: 'platform-emb',
      agent: { metadata: { marketplaceAgentId: mpId } },
      assignment: { assignedEmbeddingModelId: 'asgn-emb' },
    });
    try {
      const ids = await svc.resolveCandidateModelIds({ companyId, agentId });
      expect(ids).toEqual(['platform-emb']);
    } finally {
      restoreFetch();
    }
  });

  it('tryEmbedFromPool returns first successful embedding', async () => {
    const vec = [0.1, 0.2, 0.3, 0.4];
    const { svc, embeddingModels, restoreFetch } = buildService({
      agent: { metadata: { marketplaceAgentId: mpId } },
      assignment: { assignedEmbeddingModelId: 'bind-a' },
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ data: [{ embedding: vec }] }),
        }) as unknown as Response,
    });
    try {
      const out = await svc.tryEmbedFromPool('hello', { companyId, agentId }, 4);
      expect(out?.embedding).toEqual(vec);
      expect(out?.provenance.llmModelId).toBe('bind-a');
      expect(out?.provenance.modelName).toBe('m');
      expect(out?.provenance.inputTokens).toBeGreaterThanOrEqual(1);
    } finally {
      restoreFetch();
    }
  });

  it('tryEmbedFromPool returns null when the only candidate fails', async () => {
    const { svc, embeddingModels, restoreFetch } = buildService({
      agent: { metadata: { marketplaceAgentId: mpId } },
      assignment: { assignedEmbeddingModelId: 'bad-emb' },
      acquire: async (id: string) => ({
        embeddingModelId: id,
        modelName: 'm',
        provider: 'openai',
        llmKeyId: null,
        dimensions: 4,
        apiKey: 'k',
        requestUrl: 'https://api.openai.com/v1',
        endpointUrl: 'https://api.openai.com/v1/embeddings',
      }),
      /** 同一模型会尝试多种 request body；全部失败才视为该候选不可用 */
      fetchImpl: async () =>
        ({ ok: false, status: 503, text: async () => 'unavailable' }) as unknown as Response,
    });
    try {
      const out = await svc.tryEmbedFromPool('x', { companyId, agentId }, 4);
      expect(out).toBeNull();
      expect(embeddingModels.acquireCredentials).toHaveBeenCalled();
      expect(embeddingModels.acquireCredentials.mock.calls[0][0]).toBe('bad-emb');
    } finally {
      restoreFetch();
    }
  });

  it('tryEmbedFromPool bypasses unhealthy cache and retries primary when no pool fallback is configured', async () => {
    const vec = [1, 0, 0, 0];
    const { svc, embeddingModels, cache, restoreFetch } = buildService({
      agent: { metadata: { marketplaceAgentId: mpId } },
      assignment: { assignedEmbeddingModelId: 'skip-me' },
      poolFallbackModelId: null,
      cacheGet: async (key: string) =>
        key.includes('foundry:v1:emb:unhealthy:') && key.includes('skip-me') ? '1' : null,
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ data: [{ embedding: vec }] }),
        }) as unknown as Response,
    });
    try {
      const out = await svc.tryEmbedFromPool('z', { companyId, agentId }, 4);
      expect(out?.embedding).toEqual(vec);
      expect(cache.get).toHaveBeenCalled();
      expect(embeddingModels.acquireCredentials).toHaveBeenCalledWith('skip-me');
    } finally {
      restoreFetch();
    }
  });

  it('tryEmbedFromPool uses pool fallback model when primary is unhealthy in cache', async () => {
    const vec = [0.2, 0.2, 0.2, 0.2];
    const { svc, embeddingModels, restoreFetch } = buildService({
      agent: { metadata: { marketplaceAgentId: mpId } },
      assignment: { assignedEmbeddingModelId: 'skip-me' },
      poolFallbackModelId: 'fallback-emb',
      cacheGet: async (key: string) =>
        key.includes('foundry:v1:emb:unhealthy:') && key.includes('skip-me') ? '1' : null,
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ data: [{ embedding: vec }] }),
        }) as unknown as Response,
    });
    try {
      const out = await svc.tryEmbedFromPool('hello', { companyId, agentId }, 4);
      expect(out?.embedding).toEqual(vec);
      expect(embeddingModels.acquireCredentials).toHaveBeenCalledWith('fallback-emb');
    } finally {
      restoreFetch();
    }
  });

  it('tryEmbedFromPool uses expectedDimensions when credential dimensions are null', async () => {
    const vec2048 = Array.from({ length: 2048 }, (_, i) => (i === 0 ? 1 : 0));
    const { svc, restoreFetch } = buildService({
      companyOverrideId: 'company-emb',
      acquire: async () => ({
        embeddingModelId: 'company-emb',
        modelName: 'doubao-embedding-large',
        provider: 'volc',
        llmKeyId: null,
        dimensions: null,
        apiKey: 'k',
        requestUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        endpointUrl: 'https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal',
      }),
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ data: { embedding: vec2048 } }),
        }) as unknown as Response,
    });
    try {
      const out = await svc.tryEmbedFromPool('hello', { companyId, agentId: null }, 2048);
      expect(out?.embedding.length).toBe(2048);
    } finally {
      restoreFetch();
    }
  });

  it('tryEmbedFromPool post-projects 2048 -> 1536 when projection enabled', async () => {
    const vec2048 = Array.from({ length: 2048 }, (_, i) => (i === 0 ? 1 : 0));
    const { svc, restoreFetch } = buildService({
      companyOverrideId: 'company-emb',
      memoryCfg: {
        embeddingProjectionEnabled: true,
        embeddingModelOutputDim: 2048,
        embeddingTargetDim: 1536,
        embeddingDimensions: 1536,
      },
      acquire: async () => ({
        embeddingModelId: 'company-emb',
        modelName: 'doubao-embedding-large',
        provider: 'openai',
        llmKeyId: null,
        dimensions: null,
        apiKey: 'k',
        requestUrl: 'https://api.openai.com/v1',
        endpointUrl: 'https://api.openai.com/v1/embeddings',
      }),
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ data: [{ embedding: vec2048 }] }),
        }) as unknown as Response,
    });
    try {
      const out = await svc.tryEmbedFromPool('hello', { companyId, agentId: null }, 1536);
      expect(out?.embedding.length).toBe(1536);
      const n = Math.sqrt(out!.embedding.reduce((s, x) => s + x * x, 0));
      expect(n).toBeCloseTo(1, 5);
    } finally {
      restoreFetch();
    }
  });
});
