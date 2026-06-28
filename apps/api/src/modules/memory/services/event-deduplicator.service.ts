import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { EventIdempotencyKey } from '../entities/event-idempotency-key.entity.js';
import { MemoryEntry } from '../entities/memory-entry.entity.js';

@Injectable()
export class EventDeduplicatorService {
  constructor(
    @InjectRepository(EventIdempotencyKey)
    private readonly idempotencyRepo: Repository<EventIdempotencyKey>,
    @InjectRepository(MemoryEntry)
    private readonly entriesRepo: Repository<MemoryEntry>,
  ) {}

  buildLineageHash(parts: Array<string | null | undefined>): string {
    const value = parts.filter(Boolean).join('|').trim().toLowerCase();
    return createHash('sha256').update(value).digest('hex');
  }

  async isDuplicateEvent(params: {
    companyId: string;
    eventType: string;
    idempotencyKey: string;
  }): Promise<boolean> {
    const found = await this.idempotencyRepo.findOne({
      where: {
        companyId: params.companyId,
        eventType: params.eventType,
        idempotencyKey: params.idempotencyKey,
      },
      select: ['id'],
    });
    return Boolean(found);
  }

  async rememberEvent(params: {
    companyId: string;
    eventType: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.idempotencyRepo.insert({
      companyId: params.companyId,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
    }).catch(() => undefined);
  }

  async hasNearDuplicate(params: {
    companyId: string;
    namespace: string;
    content: string;
    sourceType: string;
    windowMinutes?: number;
  }): Promise<boolean> {
    const windowMinutes = Math.max(1, params.windowMinutes ?? 90);
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const rows = await this.entriesRepo
      .createQueryBuilder('me')
      .innerJoin('memory_collections', 'mc', 'mc.id = me.collection_id')
      .where('me.company_id = :companyId', { companyId: params.companyId })
      .andWhere('mc.namespace = :ns', { ns: params.namespace })
      .andWhere('me.source_type = :st', { st: params.sourceType })
      .andWhere('me.created_at >= :since', { since: since.toISOString() })
      .select(['me.id', 'me.content'])
      .orderBy('me.created_at', 'DESC')
      .limit(40)
      .getRawMany<{ me_id: string; me_content: string }>();
    const needle = normalize(params.content);
    return rows.some((r) => normalize(r.me_content) === needle);
  }
}

function normalize(v: string): string {
  return (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

