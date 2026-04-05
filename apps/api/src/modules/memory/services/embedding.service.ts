import { createHash } from 'crypto';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private capDay = '';
  private capCount = 0;

  constructor(private readonly config: ConfigService) {}

  get dimensions(): number {
    return this.config.getMemoryConfig().embeddingDimensions;
  }

  /**
   * OpenAI 兼容 Embeddings API；无 API Key 时使用确定性伪向量（开发/测试）
   */
  async embedText(text: string): Promise<number[]> {
    const trimmed = text?.trim() ?? '';
    if (!trimmed) {
      return this.zeroVector();
    }
    const { openaiApiKey, openaiBaseUrl, embeddingModel } =
      this.config.getMemoryConfig();
    if (!openaiApiKey) {
      return this.deterministicEmbedding(trimmed);
    }
    this.assertEmbeddingQuota();
    try {
      const url = `${openaiBaseUrl.replace(/\/$/, '')}/embeddings`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: embeddingModel,
          input: trimmed.slice(0, 8000),
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        this.logger.warn('OpenAI embeddings failed', {
          status: res.status,
          errBody: errBody.slice(0, 500),
        });
        return this.deterministicEmbedding(trimmed);
      }
      const json = (await res.json()) as {
        data?: { embedding: number[] }[];
      };
      const emb = json?.data?.[0]?.embedding;
      if (!emb || emb.length !== this.dimensions) {
        this.logger.warn('Unexpected embedding shape', {
          len: emb?.length,
        });
        return this.deterministicEmbedding(trimmed);
      }
      return emb;
    } catch (e: any) {
      this.logger.warn('embedText error', { message: e?.message });
      return this.deterministicEmbedding(trimmed);
    }
  }

  private zeroVector(): number[] {
    return Array.from({ length: this.dimensions }, () => 0);
  }

  /**
   * 可复现的稠密向量（非语义），仅用于无云端密钥时的本地联调
   */
  private assertEmbeddingQuota(): void {
    const cap = this.config.getMemoryConfig().embeddingDailyCap;
    if (!cap || cap <= 0) return;
    const day = new Date().toISOString().slice(0, 10);
    if (this.capDay !== day) {
      this.capDay = day;
      this.capCount = 0;
    }
    this.capCount += 1;
    if (this.capCount > cap) {
      throw new HttpException(
        {
          code: 'MEMORY_EMBEDDING_DAILY_CAP',
          message: '已达到今日 Embedding 调用上限（MEMORY_EMBEDDING_DAILY_CAP）',
        },
        429,
      );
    }
  }

  private deterministicEmbedding(text: string): number[] {
    const dim = this.dimensions;
    const out = new Array<number>(dim);
    let h = createHash('sha256').update(text).digest();
    for (let i = 0; i < dim; i++) {
      if (i % 32 === 0 && i > 0) {
        h = createHash('sha256').update(h).update(String(i)).digest();
      }
      const b = h[i % 32] / 255 - 0.5;
      out[i] = b;
    }
    const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
    return out.map((v) => v / norm);
  }
}
