import { Controller, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy, MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import { IngestMemoryDocumentDto } from './dto/ingest-memory-document.dto.js';
import {
  RequestConsolidationDto,
  RequestSessionBackfillDto,
} from './dto/request-consolidation.dto.js';
import { RoutedSearchMemoryDto } from './dto/routed-search-memory.dto.js';
import { SearchMemoryDto } from './dto/search-memory.dto.js';
import { StoreMemoryDto } from './dto/store-memory.dto.js';
import { SummarizeMemoryDto } from './dto/summarize-memory.dto.js';
import type { MemoryActor } from './services/memory-access.service.js';
import type { MemorySearchFilters } from './services/memory-retriever.service.js';
import { MemoryQueryRouterService } from './services/memory-query-router.service.js';
import { MemoryRetrieverService } from './services/memory-retriever.service.js';
import { MemoryConsolidationService } from './services/memory-consolidation.service.js';
import { MemoryService } from './services/memory.service.js';
import { MemorySummarizerService } from './services/memory-summarizer.service.js';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { CompanyProfileService } from './services/company-profile.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../agents/entities/agent.entity.js';
import type { MemorySourceType } from './entities/memory-entry.entity.js';
import { projectNamespace } from './utils/memory-namespace.js';
import { MemoryGraphService } from './services/memory-graph.service.js';
import { CompanyCortexGraphSyncService } from './services/company-cortex-graph-sync.service.js';
import { MemoryGraphRolloutService } from './services/memory-graph-rollout.service.js';
import { MemoryGraphBackfillService } from './services/memory-graph-backfill.service.js';
import { MemoryGovernanceGuardService } from './services/memory-governance-guard.service.js';

class ActorDto implements MemoryActor {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  organizationNodeIds?: string[];
}

class MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class MemoryGovernanceGuardRpcDto extends MemoryCompanyRpcDto {
  @IsString()
  namespace: string;

  @IsString()
  content: string;

  @IsString()
  sourceType: MemorySourceType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @IsOptional()
  @Type(() => Number)
  cycleDepth?: number;

  @IsOptional()
  @Type(() => Boolean)
  isSensitive?: boolean;
}

class MemoryStoreRpcDto extends MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => StoreMemoryDto)
  data: StoreMemoryDto;
}

class MemorySearchRpcDto extends MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => SearchMemoryDto)
  data: SearchMemoryDto;
}

class MemoryRoutedSearchRpcDto extends MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => RoutedSearchMemoryDto)
  data!: RoutedSearchMemoryDto;
}

class MemorySummarizeRpcDto extends MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => SummarizeMemoryDto)
  data: SummarizeMemoryDto;
}

class MemoryDocumentIngestRpcDto extends MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => IngestMemoryDocumentDto)
  data: IngestMemoryDocumentDto;
}

class MemoryConsolidationRequestRpcDto extends MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => RequestConsolidationDto)
  data: RequestConsolidationDto;
}

class MemorySessionBackfillRpcDto extends MemoryCompanyRpcDto {
  @ValidateNested()
  @Type(() => RequestSessionBackfillDto)
  data: RequestSessionBackfillDto;
}

class CompanyProfileGetRpcDto extends MemoryCompanyRpcDto {
  @IsOptional()
  @IsString()
  format?: 'text' | 'json';

  @IsOptional()
  @IsString()
  section?: string;
}

class CompanyProfileSyncRpcDto extends MemoryCompanyRpcDto {}

class MemoryMigrationExportRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class MemoryMigrationImportRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  targetCompanyId: string;

  @IsObject()
  bundle: Record<string, unknown>;
}

class MemoryEntryArchiveRpcDto extends MemoryCompanyRpcDto {
  @IsUUID()
  entryId: string;
}

class MemoryListEntriesRpcDto extends MemoryCompanyRpcDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  namespaces?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceTypes?: string[];

  @IsOptional()
  @IsString()
  createdAfter?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  topK?: number;
}

@Controller()
export class MemoryRpcController {
  private readonly logger = new Logger(MemoryRpcController.name);

  constructor(
    @Inject(API_RPC_CLIENT) private readonly apiClient: ClientProxy,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
    private readonly retriever: MemoryRetrieverService,
    private readonly queryRouter: MemoryQueryRouterService,
    private readonly summarizer: MemorySummarizerService,
    private readonly consolidation: MemoryConsolidationService,
    private readonly companyProfiles: CompanyProfileService,
    private readonly graph: MemoryGraphService,
    private readonly companyCortexSync: CompanyCortexGraphSyncService,
    private readonly graphRollout: MemoryGraphRolloutService,
    private readonly graphBackfill: MemoryGraphBackfillService,
    private readonly governance: MemoryGovernanceGuardService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
  ) {}

  private async enforceProjectIsolationForAgent(params: {
    companyId: string;
    agentId: string | undefined;
    projectId: string | undefined;
    mutate: (opts: { boundProjectId: string }) => void;
  }): Promise<void> {
    const { companyId, agentId, projectId, mutate } = params;
    if (!agentId) return;
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } as any });
    if (!agent) {
      throw new RpcException({
        status: 404,
        message: 'Agent 不存在（memory project isolation）',
      });
    }
    const meta = agent.metadata as any;
    const employmentType = typeof meta?.employmentType === 'string' ? String(meta.employmentType) : 'permanent';
    if (employmentType !== 'temporary') return;
    const boundProjectId = typeof meta?.projectId === 'string' ? String(meta.projectId) : '';
    if (!boundProjectId) {
      throw new RpcException({
        status: 409,
        message: '临时 Agent 缺少绑定的 projectId（数据不一致）',
      });
    }
    if (!projectId || projectId !== boundProjectId) {
      throw new RpcException({
        status: 403,
        message: '临时 Agent 的记忆操作必须携带正确的 projectId',
        code: 'PROJECT_SCOPE_REQUIRED',
      });
    }
    mutate({ boundProjectId });
  }

  @MessagePattern('memory.entries.store')
  async store(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryStoreRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        (async () => {
          if (dto.data.isSensitive) {
            const executionTokenId = dto.data.executionTokenId?.trim();
            if (!executionTokenId) {
              throw new RpcException({
                status: 403,
                message: '敏感记忆写入需要审批执行令牌',
                code: 'MEMORY_SENSITIVE_APPROVAL_REQUIRED',
              });
            }
            await firstValueFrom(
              this.apiClient
                .send('approval.consumeExecutionToken', {
                  actor: dto.actor,
                  companyId: dto.companyId,
                  executionTokenId,
                  action: 'memory.write.sensitive',
                })
                .pipe(timeout(15000)),
            );
          }
          // Temporary agent memory: enforce project scope and write into project namespace.
          await this.enforceProjectIsolationForAgent({
            companyId: dto.companyId,
            agentId: (dto.data as any).agentId,
            projectId: (dto.data as any).projectId,
            mutate: ({ boundProjectId }) => {
              dto.data.namespace = projectNamespace(boundProjectId);
              dto.data.metadata = {
                ...(dto.data.metadata ?? {}),
                projectId: boundProjectId,
                agentId: (dto.data as any).agentId,
              };
            },
          });

          return this.memory.storeEntry({
            companyId: dto.companyId,
            namespace: dto.data.namespace,
            collectionLabel: dto.data.collectionLabel,
            content: dto.data.content,
            sourceType: dto.data.sourceType,
            sourceRef: dto.data.sourceRef,
            metadata: dto.data.metadata,
            isSensitive: dto.data.isSensitive,
            actor: dto.actor,
          });
        })(),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /**
   * Sprint 2 P9（调整版）：MCP Tool 调用前的 Governance Gate（复用 Phase 1）。
   *
   * Worker 在执行 MCP Tool 前必须调用该入口：
   * - 防循环/防重复/敏感策略/预算保护
   * - 返回 allowed=false 时，Worker 必须硬阻断（避免“用工具把垃圾写进记忆/反复自触发”）
   */
  @MessagePattern('memory.governance.guard')
  async guard(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryGovernanceGuardRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        return await this.governance.guard({
          companyId: dto.companyId,
          namespace: dto.namespace,
          content: dto.content,
          sourceType: dto.sourceType,
          actor: dto.actor,
          metadata: dto.metadata ?? null,
          cycleDepth: dto.cycleDepth,
          isSensitive: dto.isSensitive,
        });
      });
    } catch (e: any) {
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'memory.governance.guard failed' });
    }
  }

  /**
   * P11.1：执行前统一 Guard 入口（语义等价于 memory.governance.guard，增加 blockedReason 字段便于 Worker 记录）。
   */
  @MessagePattern('memory.governance.guardForExecution')
  async guardForExecution(@Payload() payload: unknown) {
    const out = await this.guard(payload);
    if (out && typeof out === 'object') {
      return {
        ...(out as unknown as Record<string, unknown>),
        blockedReason: (out as any).reason ?? null,
      };
    }
    return out;
  }

  @MessagePattern('memory.summary.store')
  async storeSummary(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryStoreRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.storeSummary({
          companyId: dto.companyId,
          namespace: dto.data.namespace,
          collectionLabel: dto.data.collectionLabel,
          content: dto.data.content,
          sourceRef: dto.data.sourceRef,
          metadata: dto.data.metadata,
          isSensitive: dto.data.isSensitive,
          actor: dto.actor,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.rollout.memoryGraphV2Effective')
  async memoryGraphV2Effective(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload);
      return await this.runWithCompany(dto, async () => ({
        effective: await this.graphRollout.isMemoryGraphV2Effective(dto.companyId),
      }));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** Phase3：组织 + 活跃 Agent → CEO L1 记忆 + related_to 边（与 live facts 解耦）。 */
  @MessagePattern('memory.graph.syncCompanyCortexFromFacts')
  async syncCompanyCortexFromFacts(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.companyCortexSync.syncCompanyCortexFromFacts({ companyId: dto.companyId, actor: dto.actor }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.graph.backfillRelatedBatch')
  async backfillRelatedBatch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload);
      const body = payload as Record<string, unknown>;
      const limit = typeof body?.limit === 'number' ? body.limit : 200;
      return await this.runWithCompany(dto, () =>
        this.graphBackfill.backfillRelatedEdgesBatch(dto.companyId, limit),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** Phase3：多模态 2048 → target_dim 投影后批量回写 memory_entries（见 EMBEDDING_* 与 MemoryGraph） */
  @MessagePattern('memory.graph.reprojectEmbeddingsBatch')
  async reprojectEmbeddingsBatch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload);
      const body = payload as Record<string, unknown>;
      const raw = body?.limit;
      const limit = typeof raw === 'number' && Number.isFinite(raw) ? raw : 300;
      return await this.runWithCompany(dto, () =>
        this.graphBackfill.reprojectEmbeddingsBatch(dto.companyId, limit),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /** 将已是 2048 的 memory_entries 同步到 memory_nodes（大批量、低成本） */
  @MessagePattern('memory.graph.syncMemoryNodes2048Batch')
  async syncMemoryNodes2048Batch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload);
      const body = payload as Record<string, unknown>;
      const raw = body?.limit;
      const limit = typeof raw === 'number' && Number.isFinite(raw) ? raw : 500;
      return await this.runWithCompany(dto, () =>
        this.graphBackfill.syncMemoryNodes2048FromEntriesBatch(dto.companyId, limit),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  /**
   * Memory Graph 升级 2048：同步 memory_nodes → 重嵌入非 2048 条目 → 回填 memory_edges.embedding。
   * body: syncNodesLimit / reembedLimit / edgeLimit（传 0 跳过该步）
   */
  @MessagePattern('memory.graph.run2048BackfillPipeline')
  async run2048BackfillPipeline(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload);
      const body = payload as Record<string, unknown>;
      const pick = (k: string, def: number): number => {
        const v = body?.[k];
        return typeof v === 'number' && Number.isFinite(v) ? v : def;
      };
      return await this.runWithCompany(dto, () =>
        this.graphBackfill.runMemoryGraph2048BackfillPipeline(dto.companyId, {
          syncNodesLimit: pick('syncNodesLimit', 500),
          reembedLimit: pick('reembedLimit', 25),
          edgeLimit: pick('edgeLimit', 400),
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.graph.promoteSummaryFromMessages')
  async promoteSummaryFromMessages(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload as any);
      const body = payload as any;
      const summaryEntryId = String(body?.summaryEntryId ?? '').trim();
      const messageIds = Array.isArray(body?.messageIds) ? (body.messageIds as any[]) : [];
      if (!summaryEntryId || messageIds.length === 0) {
        return { created: 0, blocked: 0, resolvedSources: 0 };
      }
      return await this.runWithCompany(dto, async () => {
        if (!(await this.graphRollout.isMemoryGraphV2Effective(dto.companyId))) {
          return { created: 0, blocked: 0, resolvedSources: 0, skippedReason: 'memory_graph_rollout' as const };
        }
        const sourceEntryIds = await this.graph.resolveChatEntryIds({
          companyId: dto.companyId,
          messageIds: messageIds.filter((x) => typeof x === 'string') as string[],
        });
        const res = await this.graph.promoteWithEdge({
          companyId: dto.companyId,
          summaryEntryId,
          sourceEntryIds,
          edgeType: 'summarizes',
          metadata: {
            kind: 'consolidation_messages',
            source: 'worker',
          },
        });
        return { ...res, resolvedSources: sourceEntryIds.length };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.graph.addEdge')
  async addEdge(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryCompanyRpcDto, payload as any);
      const body = payload as any;
      const fromEntryId = String(body?.fromEntryId ?? '').trim();
      const toEntryIdRaw = body?.toEntryId;
      const toEntryId = typeof toEntryIdRaw === 'string' && toEntryIdRaw.trim().length > 0 ? toEntryIdRaw.trim() : null;
      const edgeType = String(body?.edgeType ?? '').trim() as any;
      const metadata = (body?.metadata ?? null) as Record<string, unknown> | null;
      if (!fromEntryId || !edgeType) {
        return { created: false };
      }
      return await this.runWithCompany(dto, () =>
        this.graph.addEdge({
          companyId: dto.companyId,
          fromEntryId,
          toEntryId,
          edgeType,
          metadata,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.search')
  async search(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemorySearchRpcDto, payload);
      return await this.runWithCompany(dto, () => {
        // Temporary agent memory: enforce project scope and constrain search.
        return (async () => {
          await this.enforceProjectIsolationForAgent({
            companyId: dto.companyId,
            agentId: (dto.data as any).agentId,
            projectId: (dto.data as any).projectId,
            mutate: ({ boundProjectId }) => {
              dto.data.namespaces = [projectNamespace(boundProjectId)];
              dto.data.metadataContains = {
                ...(dto.data.metadataContains ?? {}),
                projectId: boundProjectId,
              };
            },
          });
          const filters = {
            companyId: dto.companyId,
            namespaces: dto.data.namespaces,
            sourceTypes: dto.data.sourceTypes,
            keyword: dto.data.keyword,
            topK: dto.data.topK,
            createdAfter: dto.data.createdAfter,
            createdBefore: dto.data.createdBefore,
            agentId: dto.data.agentId,
            organizationNodeId: dto.data.organizationNodeId,
            metadataContains: dto.data.metadataContains,
            minScore: dto.data.minScore,
            actor: dto.actor,
          };
          if (dto.data.roomId) {
            return this.retriever.retrieveWithHierarchy(
              dto.data.query,
              {
                ...filters,
                roomId: dto.data.roomId,
              },
              undefined,
            );
          }
          return this.retriever.search(dto.data.query, filters);
        })();
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.search.hierarchy')
  async searchHierarchy(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemorySearchRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        (async () => {
          await this.enforceProjectIsolationForAgent({
            companyId: dto.companyId,
            agentId: (dto.data as any).agentId,
            projectId: (dto.data as any).projectId,
            mutate: ({ boundProjectId }) => {
              dto.data.namespaces = [projectNamespace(boundProjectId)];
              dto.data.metadataContains = {
                ...(dto.data.metadataContains ?? {}),
                projectId: boundProjectId,
              };
            },
          });
          return this.retriever.retrieveWithHierarchy(dto.data.query, {
            companyId: dto.companyId,
            namespaces: dto.data.namespaces,
            sourceTypes: dto.data.sourceTypes,
            keyword: dto.data.keyword,
            topK: dto.data.topK,
            createdAfter: dto.data.createdAfter,
            createdBefore: dto.data.createdBefore,
            agentId: dto.data.agentId,
            organizationNodeId: dto.data.organizationNodeId,
            roomId: dto.data.roomId,
            metadataContains: dto.data.metadataContains,
            minScore: dto.data.minScore,
            actor: dto.actor,
          });
        })(),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.search.routed')
  async searchRouted(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryRoutedSearchRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        const primaryOrg =
          dto.data.primaryOrganizationNodeId ??
          dto.actor.organizationNodeIds?.[0];
        const base: MemorySearchFilters = {
          companyId: dto.companyId,
          namespaces: dto.data.namespaces,
          sourceTypes: dto.data.sourceTypes,
          keyword: dto.data.keyword,
          topK: dto.data.topK,
          createdAfter: dto.data.createdAfter,
          createdBefore: dto.data.createdBefore,
          roomId: dto.data.roomId,
          minScore: dto.data.minScore,
          metadataContains: dto.data.metadataContains,
          actor: dto.actor,
        };
        const plan = this.queryRouter.plan({
          scope: dto.data.scope,
          agentRole: dto.data.agentRole,
          agentId: dto.data.agentId,
          primaryOrganizationNodeId: primaryOrg,
          roomId: dto.data.roomId,
          baseFilters: base,
        });
        const hits = plan.useHierarchy
          ? await this.retriever.retrieveWithHierarchy(
              dto.data.query,
              { ...plan.filters, roomId: dto.data.roomId },
              { scope: plan.scope },
            )
          : await this.retriever.search(dto.data.query, plan.filters, {
              audit: { strategy: 'search', scope: plan.scope },
            });
        if (dto.data.explain) {
          return {
            hits,
            meta: {
              scope: plan.scope,
              notes: plan.notes,
              useHierarchy: plan.useHierarchy,
            },
          };
        }
        return { hits };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.summarize')
  async summarize(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemorySummarizeRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        const out = await this.summarizer.summarize({
          texts: dto.data.texts,
          context: dto.data.context,
          structured: dto.data.structured,
          companyId: dto.companyId,
          source: 'rpc',
        });
        if (dto.data.persist && dto.data.persistNamespace) {
          await this.memory.storeEntry({
            companyId: dto.companyId,
            namespace: dto.data.persistNamespace,
            collectionLabel: 'Summaries',
            content: out.summary,
            sourceType: 'summary',
            metadata: { fromRpc: true },
            actor: dto.actor,
          });
        }
        this.logBillingHint('memory.summarize', dto.companyId, out.summary.length);
        return out;
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.document.ingest')
  async ingestDocument(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryDocumentIngestRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.ingestTextFile({
          companyId: dto.companyId,
          storagePath: dto.data.storagePath,
          namespace: dto.data.namespace,
          collectionLabel: dto.data.collectionLabel,
          maxChunkChars: dto.data.maxChunkChars,
          actor: dto.actor,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.document.ingestAsync')
  async ingestDocumentAsync(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryDocumentIngestRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.publishDocumentIngestAsync({
          companyId: dto.companyId,
          storagePath: dto.data.storagePath,
          namespace: dto.data.namespace,
          collectionLabel: dto.data.collectionLabel,
          maxChunkChars: dto.data.maxChunkChars,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.consolidation.request')
  async requestConsolidation(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryConsolidationRequestRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.consolidation.requestConsolidation({
          companyId: dto.companyId,
          roomId: dto.data.roomId,
          trigger: dto.data.trigger,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.session.backfill.request')
  async requestSessionBackfill(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemorySessionBackfillRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.consolidation.requestSessionBackfill({
          companyId: dto.companyId,
          roomId: dto.data.roomId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.companyProfile.get')
  async getCompanyProfile(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyProfileGetRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        const latest = await this.companyProfiles.getLatestCompanyProfile({
          companyId: dto.companyId,
          section: dto.section,
        });
        const fmt = dto.format ?? 'text';
        if (fmt === 'json') {
          return {
            structured: latest.structured,
            generatedAt: latest.generatedAt,
          };
        }
        return {
          text: latest.text,
          generatedAt: latest.generatedAt,
        };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.companyProfile.sync')
  async syncCompanyProfile(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompanyProfileSyncRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        return await this.companyProfiles.syncCompanyProfile({
          companyId: dto.companyId,
          trigger: 'manual_rpc',
        });
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.migration.exportBundle')
  async migrationExportBundle(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryMigrationExportRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.exportMigrationBundle({
          companyId: dto.companyId,
          actor: dto.actor,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.migration.importBundle')
  async migrationImportBundle(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryMigrationImportRpcDto, payload);
      return await this.runWithCompany({ companyId: dto.targetCompanyId }, () =>
        this.memory.importMigrationBundle({
          targetCompanyId: dto.targetCompanyId,
          actor: dto.actor,
          bundle: dto.bundle as {
            formatVersion: string;
            entries: Array<{
              namespace: string;
              collectionLabel?: string | null;
              content: string;
              summary?: string | null;
              metadata?: Record<string, unknown> | null;
              sourceType: MemorySourceType;
              sourceRef?: string | null;
              isSensitive?: boolean;
            }>;
          },
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.entries.archive')
  async archiveEntry(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryEntryArchiveRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.setEntryArchivedStatus({
          companyId: dto.companyId,
          entryId: dto.entryId,
          archived: true,
          actor: dto.actor,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.entries.unarchive')
  async unarchiveEntry(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryEntryArchiveRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.setEntryArchivedStatus({
          companyId: dto.companyId,
          entryId: dto.entryId,
          archived: false,
          actor: dto.actor,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.entries.list')
  async listEntries(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryListEntriesRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.listEntries({
          companyId: dto.companyId,
          namespaces: dto.namespaces,
          sourceTypes: dto.sourceTypes,
          createdAfter: dto.createdAfter,
          topK: dto.topK,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private logBillingHint(
    op: string,
    companyId: string,
    unitsApprox: number,
  ): void {
    this.logger.log('memory.billing.hint', {
      op,
      companyId,
      unitsApprox,
      note: 'BillingModule 可据此汇总 Embedding/LLM/检索计费',
    });
  }

  private runWithCompany<T>(
    dto: { companyId: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.tenantContext.runWithCompanyId(dto.companyId, fn);
  }

  private toRpcError(e: any): RpcException {
    if (e?.getStatus && e?.getResponse) {
      return new RpcException({
        status: e.getStatus(),
        response: e.getResponse(),
        message: e.message,
      });
    }
    return e instanceof RpcException
      ? e
      : new RpcException({
          status: 500,
          message: e?.message ?? 'Internal error',
        });
  }
}
