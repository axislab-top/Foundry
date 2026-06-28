import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';

type ElasticHit = {
  id: string;
  score: number;
};

@Injectable()
export class MemoryElasticService {
  private readonly logger = new Logger(MemoryElasticService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const cfg = this.config.getMemoryConfig();
    return Boolean(cfg.elasticEnabled && cfg.elasticUrl);
  }

  private indexName(companyId: string): string {
    const cfg = this.config.getMemoryConfig();
    const prefix = (cfg.elasticIndexPrefix || 'memory').toLowerCase();
    // index names must be lowercase and avoid special chars
    const safeCompany = companyId.toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    return `${prefix}-${safeCompany}`;
  }

  private headers(): Record<string, string> {
    const cfg = this.config.getMemoryConfig();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.elasticApiKey) h.Authorization = `ApiKey ${cfg.elasticApiKey}`;
    return h;
  }

  async indexEntry(params: {
    companyId: string;
    entryId: string;
    namespace: string;
    sourceType: string;
    content: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }): Promise<void> {
    const cfg = this.config.getMemoryConfig();
    if (!cfg.elasticEnabled || !cfg.elasticUrl) return;
    const base = cfg.elasticUrl.replace(/\/$/, '');
    const index = this.indexName(params.companyId);
    const url = `${base}/${encodeURIComponent(index)}/_doc/${encodeURIComponent(params.entryId)}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(50, cfg.elasticTimeoutMs ?? 600));
    try {
      const body = {
        companyId: params.companyId,
        entryId: params.entryId,
        namespace: params.namespace,
        sourceType: params.sourceType,
        content: params.content,
        createdAt: params.createdAt,
        metadata: params.metadata ?? null,
      };
      const res = await fetch(url, {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        this.logger.warn('elastic index failed', { status: res.status, index, entryId: params.entryId, body: txt.slice(0, 400) });
      }
    } catch (e: any) {
      this.logger.warn('elastic index error', { message: e?.message, entryId: params.entryId });
    } finally {
      clearTimeout(t);
    }
  }

  async searchBm25(params: {
    companyId: string;
    query: string;
    namespaces?: string[];
    sourceTypes?: string[];
    topK: number;
    metadataContains?: Record<string, unknown>;
  }): Promise<ElasticHit[]> {
    const cfg = this.config.getMemoryConfig();
    if (!cfg.elasticEnabled || !cfg.elasticUrl) return [];
    const base = cfg.elasticUrl.replace(/\/$/, '');
    const index = this.indexName(params.companyId);
    const url = `${base}/${encodeURIComponent(index)}/_search`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(50, cfg.elasticTimeoutMs ?? 600));

    const must: any[] = [];
    if (params.namespaces?.length) must.push({ terms: { namespace: params.namespaces } });
    if (params.sourceTypes?.length) must.push({ terms: { sourceType: params.sourceTypes } });

    // Limited support: only exact-match primitives on top-level metadata keys.
    // (Full JSONB contains semantics remain in Postgres path.)
    if (params.metadataContains && typeof params.metadataContains === 'object') {
      for (const [k, v] of Object.entries(params.metadataContains)) {
        if (v == null) continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          must.push({ term: { [`metadata.${k}`]: v } });
        }
      }
    }

    const q = (params.query || '').trim();
    if (!q) return [];
    const body = {
      size: Math.min(Math.max(params.topK, 1), 50),
      query: {
        bool: {
          must: [
            ...must,
            {
              match: {
                content: {
                  query: q,
                  operator: 'and',
                },
              },
            },
          ],
        },
      },
      _source: ['entryId'],
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const json: any = await res.json().catch(() => null);
      const hits = (json?.hits?.hits ?? []) as Array<{ _id?: string; _score?: number; _source?: any }>;
      return hits
        .map((h) => ({
          id: String(h?._source?.entryId ?? h?._id ?? ''),
          score: Number(h?._score ?? 0),
        }))
        .filter((h) => h.id);
    } catch {
      return [];
    } finally {
      clearTimeout(t);
    }
  }
}

