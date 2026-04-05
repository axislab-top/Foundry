import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
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

@Controller()
export class MemoryRpcController {
  private readonly logger = new Logger(MemoryRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
    private readonly retriever: MemoryRetrieverService,
    private readonly queryRouter: MemoryQueryRouterService,
    private readonly summarizer: MemorySummarizerService,
    private readonly consolidation: MemoryConsolidationService,
  ) {}

  @MessagePattern('memory.entries.store')
  async store(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemoryStoreRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.memory.storeEntry({
          companyId: dto.companyId,
          namespace: dto.data.namespace,
          collectionLabel: dto.data.collectionLabel,
          content: dto.data.content,
          sourceType: dto.data.sourceType,
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

  @MessagePattern('memory.search')
  async search(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(MemorySearchRpcDto, payload);
      return await this.runWithCompany(dto, () => {
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
        this.retriever.retrieveWithHierarchy(dto.data.query, {
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
        }),
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
