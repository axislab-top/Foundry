import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { LlmProviderInfo } from './interfaces/llm-provider.interface.js';
import type { LlmProviderKind } from './entities/llm-provider.entity.js';
import { LlmProvider } from './entities/llm-provider.entity.js';
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto.js';
import { UpdateLlmProviderDto } from './dto/update-llm-provider.dto.js';

@Injectable()
export class LlmProvidersService {
  constructor(
    @InjectRepository(LlmProvider)
    private readonly repo: Repository<LlmProvider>,
  ) {}

  async list(): Promise<LlmProviderInfo[]> {
    const rows = await this.repo.find({
      order: { updatedAt: 'DESC' },
    });
    return rows.map((p) => ({
      code: p.code,
      displayName: p.displayName,
      kind: p.kind,
      requestUrl: p.requestUrl,
    }));
  }

  async create(input: CreateLlmProviderDto): Promise<LlmProviderInfo> {
    const code = input.code.trim();
    if (!code) throw new BadRequestException('Provider code is required');

    const existing = await this.repo.findOne({ where: { code } });
    if (existing) throw new BadRequestException(`Provider code already exists: ${code}`);

    const provider = this.repo.create({
      code,
      displayName: (input.displayName ?? '').trim(),
      kind: input.kind as LlmProviderKind,
      requestUrl: input.requestUrl.trim(),
    });

    const saved = await this.repo.save(provider);
    return {
      code: saved.code,
      displayName: saved.displayName,
      kind: saved.kind,
      requestUrl: saved.requestUrl,
    };
  }

  async update(code: string, patch: UpdateLlmProviderDto): Promise<LlmProviderInfo> {
    const normalized = code.trim();
    if (!normalized) throw new BadRequestException('Provider code is required');
    const row = await this.repo.findOne({ where: { code: normalized } });
    if (!row) throw new BadRequestException(`Provider code not found: ${normalized}`);

    if (patch.displayName !== undefined) row.displayName = patch.displayName.trim();
    if (patch.kind !== undefined) row.kind = patch.kind as LlmProviderKind;
    if (patch.requestUrl !== undefined) {
      const next = patch.requestUrl.trim();
      if (!next) throw new BadRequestException('requestUrl cannot be empty');
      row.requestUrl = next;
    }
    const saved = await this.repo.save(row);
    return {
      code: saved.code,
      displayName: saved.displayName,
      kind: saved.kind,
      requestUrl: saved.requestUrl,
    };
  }

  async remove(code: string): Promise<void> {
    const normalized = code.trim();
    if (!normalized) throw new BadRequestException('Provider code is required');
    const used = await this.repo.manager.query(
      `select count(*)::int as c from llm_models where provider_code = $1`,
      [normalized],
    );
    if (Array.isArray(used) && Number(used[0]?.c) > 0) {
      throw new BadRequestException('该服务商仍有关联模型，无法删除（请先删除模型）');
    }
    await this.repo.delete({ code: normalized });
  }

  async testConnection(code: string): Promise<{
    providerCode: string;
    requestUrl: string;
    ok: boolean;
    httpStatus?: number;
    message: string;
  }> {
    const normalized = code.trim();
    if (!normalized) throw new BadRequestException('Provider code is required');
    const row = await this.repo.findOne({ where: { code: normalized } });
    if (!row) throw new BadRequestException(`Provider code not found: ${normalized}`);

    const base = row.requestUrl.trim().replace(/\/$/, '');
    // OpenAI 兼容普遍支持 /models；即使未带鉴权通常返回 401/403，也可证明网络可达
    const probeUrl = `${base}/models`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(probeUrl, {
        method: 'GET',
        signal: ctl.signal,
      });
      const status = res.status;
      const ok = status < 500;
      return {
        providerCode: row.code,
        requestUrl: row.requestUrl,
        ok,
        httpStatus: status,
        message: ok
          ? `Reachable (HTTP ${status}).`
          : `Unreachable or server error (HTTP ${status}).`,
      };
    } catch (e: unknown) {
      return {
        providerCode: row.code,
        requestUrl: row.requestUrl,
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

