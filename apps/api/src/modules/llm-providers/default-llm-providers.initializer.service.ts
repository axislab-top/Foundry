import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmProvider } from './entities/llm-provider.entity.js';

@Injectable()
export class DefaultLlmProvidersInitializerService implements OnModuleInit {
  private readonly logger = new Logger(DefaultLlmProvidersInitializerService.name);

  constructor(
    @InjectRepository(LlmProvider)
    private readonly repo: Repository<LlmProvider>,
  ) {}

  async onModuleInit(): Promise<void> {
    const defaults: Array<{
      code: string;
      displayName: string;
      kind: 'openai' | 'anthropic';
      requestUrl: string;
    }> = [
      { code: 'openai', displayName: 'OpenAI', kind: 'openai', requestUrl: 'https://api.openai.com/v1' },
      { code: 'anthropic', displayName: 'Anthropic', kind: 'anthropic', requestUrl: 'https://api.anthropic.com' },
    ];

    for (const item of defaults) {
      const existing = await this.repo.findOne({ where: { code: item.code } as any });
      if (existing) {
        continue;
      }
      await this.repo.save(
        this.repo.create({
          code: item.code,
          displayName: item.displayName,
          kind: item.kind,
          requestUrl: item.requestUrl,
        }),
      );
      this.logger.warn('Seeded default llm provider', { code: item.code, kind: item.kind });
    }
  }
}

