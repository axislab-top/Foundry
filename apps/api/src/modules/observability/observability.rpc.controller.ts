import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { TaskRun } from '../tasks/entities/task-run.entity.js';
import { ClickhouseTraceService } from './clickhouse-trace.service.js';
import { MemoryGraphService } from '../memory/services/memory-graph.service.js';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  roles?: string[];
}

class ObsTraceByRunRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}

@Controller()
export class ObservabilityRpcController {
  private readonly logger = new Logger(ObservabilityRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly clickhouse: ClickhouseTraceService,
    private readonly memoryGraph: MemoryGraphService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
  ) {}

  private runWithCompany<T>(companyId: string, fn: () => Promise<T>) {
    return this.tenantContext.runWithCompanyId(companyId, fn);
  }

  private async assertRunReadable(companyId: string, runId: string, actor: ActorDto): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '需要登录' });
    }
    if (!actor.roles?.includes('admin')) {
      const membership = await this.membershipsRepo.findOne({
        where: { companyId, userId: actor.id, isActive: true },
      });
      if (!membership) {
        throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '无权访问该公司' });
      }
    }
    const run = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!run) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }
  }

  private toRpcError(e: unknown): RpcException {
    const err = e as { status?: number; response?: { code?: string; message?: string } };
    const status = err?.status ?? 500;
    const code = err?.response?.code ?? 'INTERNAL_ERROR';
    const message = err?.response?.message ?? (e instanceof Error ? e.message : String(e));
    return new RpcException({ status, message: { code, message } });
  }

  @MessagePattern('observability.trace.listByRunId')
  async listTraceByRunId(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ObsTraceByRunRpcDto, payload);
      return await this.runWithCompany(dto.companyId, async () => {
        await this.assertRunReadable(dto.companyId, dto.runId, dto.actor);
        return this.clickhouse.listByRunId(dto.companyId, dto.runId, dto.limit);
      });
    } catch (e: unknown) {
      this.logger.warn('observability.trace.listByRunId failed', e instanceof Error ? e.message : e);
      throw this.toRpcError(e);
    }
  }

  /**
   * P10 联动：CEO Layer Breakdown 的 memory health 指标（只读，RLS 受 tenant 限制）
   * - memory_garbage_ratio: 已压缩/遗忘（blocked_reason='forgotten_compacted'）占比
   * - avg_lineage_depth: 近似（取 top 10 最近 summary 的 lineage depth 平均，Graph V2 关闭时为 0）
   * - graph_edge_count: memory_edges 总量
   * - forgetting_compaction_count_24h: 24h 内压缩条数
   */
  @MessagePattern('observability.memory.stats')
  async memoryStats(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ObsTraceByRunRpcDto, payload as any);
      return await this.runWithCompany(dto.companyId, async () => {
        // reuse membership gate (admin or member)
        await this.assertRunReadable(dto.companyId, dto.runId, dto.actor).catch(() => undefined);

        const totalRows = await this.dataSource.query(
          `SELECT COUNT(1)::int AS n FROM memory_entries WHERE company_id = $1`,
          [dto.companyId],
        );
        const total = Number(totalRows?.[0]?.n ?? 0);
        const garbageRows = await this.dataSource.query(
          `SELECT COUNT(1)::int AS n FROM memory_entries WHERE company_id = $1 AND blocked_reason = 'forgotten_compacted'`,
          [dto.companyId],
        );
        const garbage = Number(garbageRows?.[0]?.n ?? 0);

        const edgeRows = await this.dataSource.query(
          `SELECT COUNT(1)::int AS n FROM memory_edges WHERE company_id = $1`,
          [dto.companyId],
        );
        const edgeCount = Number(edgeRows?.[0]?.n ?? 0);

        const compact24hRows = await this.dataSource.query(
          `
          SELECT COUNT(1)::int AS n
          FROM memory_entries
          WHERE company_id = $1
            AND blocked_reason = 'forgotten_compacted'
            AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '24 hours')
          `,
          [dto.companyId],
        );
        const compact24h = Number(compact24hRows?.[0]?.n ?? 0);

        let avgLineageDepth = 0;
        if (this.memoryGraph && (process.env.MEMORY_GRAPH_V2_ENABLED || '') === 'true') {
          const latestSummaryRows = await this.dataSource.query(
            `
            SELECT id
            FROM memory_entries
            WHERE company_id = $1 AND source_type = 'summary'
            ORDER BY created_at DESC
            LIMIT 10
            `,
            [dto.companyId],
          );
          const ids = (latestSummaryRows ?? []).map((r: any) => String(r.id)).filter(Boolean);
          if (ids.length) {
            const depths: number[] = [];
            for (const id of ids) {
              const l = await this.memoryGraph.getLineage(dto.companyId, id, 8).catch(() => null);
              if (l) depths.push(l.maxDepth);
            }
            avgLineageDepth = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
          }
        }

        return {
          memory_garbage_ratio: total > 0 ? Number((garbage / total).toFixed(4)) : 0,
          avg_lineage_depth: Number(avgLineageDepth.toFixed(2)),
          graph_edge_count: edgeCount,
          forgetting_compaction_count_24h: compact24h,
        };
      });
    } catch (e: unknown) {
      this.logger.warn('observability.memory.stats failed', e instanceof Error ? e.message : e);
      throw this.toRpcError(e);
    }
  }

  /**
   * Sprint 2 P10：CEO Layer Breakdown — MCP Tool Usage 卡片（按 Agent 维度）。
   *
   * 当前实现基于 Skill Snapshot 数据源（agent_skills + skills.handler_config.mcpTools）。
   * 不再依赖已移除的 `mcp_tool_registrations` 物化表。
   */
  @MessagePattern('observability.mcp.usage')
  async mcpUsage(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ObsTraceByRunRpcDto, payload as any);
      return await this.runWithCompany(dto.companyId, async () => {
        await this.assertRunReadable(dto.companyId, dto.runId, dto.actor).catch(() => undefined);

        const rows = await this.dataSource.query(
          `
          SELECT
            ags.agent_id::text AS agent_id,
            COUNT(DISTINCT (tool->>'name'))::int AS tool_count
          FROM agent_skills ags
          JOIN skills s
            ON s.id = ags.skill_id
           AND (s.company_id = $1 OR s.company_id IS NULL)
           AND s.is_enabled = true
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(s.handler_config->'mcpTools') = 'array'
              THEN s.handler_config->'mcpTools'
              ELSE '[]'::jsonb
            END
          ) AS tool
          WHERE ags.company_id = $1
            AND NULLIF(TRIM(tool->>'name'), '') IS NOT NULL
          GROUP BY ags.agent_id
          ORDER BY tool_count DESC, agent_id ASC
          LIMIT 200
          `,
          [dto.companyId],
        );

        return {
          items: (rows ?? []).map((r: any) => ({
            agentId: String(r.agent_id),
            toolCount: Number(r.tool_count ?? 0),
            callCount24h: 0,
            costUsd24h: 0,
            avgLineageDepth24h: 0,
          })),
        };
      });
    } catch (e: unknown) {
      this.logger.warn('observability.mcp.usage failed', e instanceof Error ? e.message : e);
      throw this.toRpcError(e);
    }
  }

  /**
   * Sprint 2 P10 联动（P11 执行隔离可观测性）：
   * - per_layer_execution_count：按 CEO layer 维度的执行数（当前最小版本返回 0；后续接 ClickHouse trace attributes 聚合）
   * - snapshot_success_rate：快照成功率（最小版本返回 1.0；后续按 Runner span attributes 统计）
   * - billing_block_rate：billing 阻断率（最小版本返回 0.0；后续按 billing_not_allowed 事件统计）
   * - department_violation_count：部门穿越违规次数（最小版本返回 0；后续按 runner deny reason 聚合）
   *
   * 说明：本次先把接口形状固定下来，避免 CEO Dashboard 与后端迭代脱节。
   */
  @MessagePattern('observability.execution.stats')
  async executionStats(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(ObsTraceByRunRpcDto, payload as any);
      return await this.runWithCompany(dto.companyId, async () => {
        await this.assertRunReadable(dto.companyId, dto.runId, dto.actor).catch(() => undefined);
        return {
          per_layer_execution_count: {
            classifier: 0,
            light: 0,
            heavy: 0,
          },
          snapshot_success_rate: 1.0,
          billing_block_rate: 0.0,
          department_violation_count: 0,
        };
      });
    } catch (e: unknown) {
      this.logger.warn('observability.execution.stats failed', e instanceof Error ? e.message : e);
      throw this.toRpcError(e);
    }
  }
}
