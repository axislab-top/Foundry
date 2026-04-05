import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { agentNamespace } from '../utils/memory-namespace.js';

export interface AgentMemoryStats {
  entryCount: number;
  lastStoredAt: string | null;
}

@Injectable()
export class MemoryStatsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getAgentMemoryStats(
    companyId: string,
    agentId: string,
  ): Promise<AgentMemoryStats> {
    const ns = agentNamespace(agentId);
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(me.id)::int AS "entryCount",
        MAX(me.created_at) AS "lastStoredAt"
      FROM memory_entries me
      INNER JOIN memory_collections mc ON mc.id = me.collection_id
      WHERE me.company_id = $1 AND mc.namespace = $2
      `,
      [companyId, ns],
    );
    const r = rows[0] as {
      entryCount: number;
      lastStoredAt: Date | null;
    };
    return {
      entryCount: r?.entryCount ?? 0,
      lastStoredAt: r?.lastStoredAt ? new Date(r.lastStoredAt).toISOString() : null,
    };
  }
}
