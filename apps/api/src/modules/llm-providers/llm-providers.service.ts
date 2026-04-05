import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { LlmProviderInfo } from './interfaces/llm-provider.interface.js';
import type { LlmProviderKind } from './entities/llm-provider.entity.js';
import { LlmProvider } from './entities/llm-provider.entity.js';
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto.js';

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
}

