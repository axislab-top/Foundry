import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Min,
  Max,
  MaxLength,
  IsArray,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { isAuthorized } from '../../common/authz/authorization.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { ImportTemplateDto } from './dto/import-template.dto.js';
import { QueryMarketplaceDto } from './dto/query-marketplace.dto.js';
import { QueryTemplatesDto } from './dto/query-templates.dto.js';
import { QueryMarketplaceHireRequestsDto } from './dto/query-marketplace-hire-requests.dto.js';
import { AgentPurchaseService } from './services/agent-purchase.service.js';
import { MarketplaceAdminService } from './services/marketplace-admin.service.js';
import { MarketplaceHireRequestsService } from './services/marketplace-hire-requests.service.js';
import { MarketplaceService } from './services/marketplace.service.js';
import { TemplateImporterService } from './services/template-importer.service.js';
import { TemplatesService } from './services/templates.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

const ADMIN_ROLES = ['admin', 'owner', 'superadmin'] as const;
function assertAdmin(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...ADMIN_ROLES] })) return;
  throw new RpcException({ status: 403, message: 'Insufficient permissions for marketplace administration' });
}

class TemplatesFindAllDto extends QueryTemplatesDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class TemplatesFindOneDto {
  @IsUUID()
  id: string;
}

class TemplatesImportDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImportTemplateDto)
  data?: ImportTemplateDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class MarketplaceAgentsFindAllDto extends QueryMarketplaceDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class MarketplaceAgentsFindOneDto {
  @IsUUID()
  id: string;
}

class MarketplaceAgentsPurchaseDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsUUID()
  organizationNodeId?: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class MarketplaceHireCreateDataDto {
  @IsUUID()
  marketplaceAgentId: string;

  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requestedReason?: string;
}

class MarketplaceHireCreateRpcDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => MarketplaceHireCreateDataDto)
  data: MarketplaceHireCreateDataDto;
}

class MarketplaceHireListRpcDto extends QueryMarketplaceHireRequestsDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class MarketplaceHireIdRpcDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class MarketplaceHireRejectRpcDto extends MarketplaceHireIdRpcDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectReason?: string;
}

class MarketplaceAdminListDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'published', 'draft'])
  status?: 'all' | 'published' | 'draft';
}

class MarketplaceAdminFindOneDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class MarketplaceAdminCreateDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  expertise?: string | null;

  @IsOptional()
  @IsString()
  systemPrompt?: string | null;

  @IsOptional()
  @IsString()
  boundModelName?: string | null;

  @IsOptional()
  @IsIn(['free', 'one_time', 'subscription'])
  pricingModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @Type(() => Boolean)
  isPublished?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendedSkills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillTags?: string[];
}

class MarketplaceAdminUpdateKeyBindingDto {
  @IsUUID()
  llmKeyId: string;

  @Type(() => Number)
  @IsInt()
  sortOrder: number;
}

class MarketplaceAdminUpdateDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  expertise?: string | null;

  @IsOptional()
  @IsString()
  systemPrompt?: string | null;

  @IsOptional()
  @IsString()
  boundModelName?: string | null;

  @IsOptional()
  @IsIn(['free', 'one_time', 'subscription'])
  pricingModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @Type(() => Boolean)
  isPublished?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendedSkills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillTags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketplaceAdminUpdateKeyBindingDto)
  keyBindings?: MarketplaceAdminUpdateKeyBindingDto[];
}

@Controller()
export class TemplatesRpcController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly marketplaceService: MarketplaceService,
    private readonly marketplaceAdminService: MarketplaceAdminService,
    private readonly templateImporterService: TemplateImporterService,
    private readonly agentPurchaseService: AgentPurchaseService,
    private readonly marketplaceHireRequestsService: MarketplaceHireRequestsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @MessagePattern('templates.findAll')
  async findAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(TemplatesFindAllDto, payload);
      const { actor: _actor, ...query } = dto;
      return await this.templatesService.findAll(query);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('templates.findOne')
  async findOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(TemplatesFindOneDto, payload);
      return await this.templatesService.findOne(dto.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('templates.preview')
  async preview(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(TemplatesFindOneDto, payload);
      return await this.templatesService.getPreview(dto.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('templates.import')
  async importTemplate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(TemplatesImportDto, payload);
      return await this.templateImporterService.importCompanyTemplate(dto.id, dto.actor, {
        companyName: dto.data?.companyName,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.agents.findAll')
  async marketplaceFindAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAgentsFindAllDto, payload);
      const { actor: _actor, ...query } = dto;
      return await this.marketplaceService.findAll(query);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.agents.findOne')
  async marketplaceFindOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAgentsFindOneDto, payload);
      return await this.marketplaceService.findOne(dto.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.agents.purchase')
  async marketplacePurchase(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAgentsPurchaseDto, payload);
      const companyId = dto.companyId;
      if (!companyId) {
        throw new RpcException({
          status: 400,
          message: 'companyId is required (e.g. X-Company-Id header)',
        });
      }
      return await this.runWithCompanyContext(dto, () =>
        this.agentPurchaseService.purchase(dto.id, companyId, dto.actor, dto.organizationNodeId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.hireRequests.create')
  async marketplaceHireCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceHireCreateRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.marketplaceHireRequestsService.create(dto.companyId, dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.hireRequests.list')
  async marketplaceHireList(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceHireListRpcDto, payload);
      const { actor, companyId, ...query } = dto;
      return await this.runWithCompanyContext(dto, () =>
        this.marketplaceHireRequestsService.list(companyId, query, actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.hireRequests.findOne')
  async marketplaceHireFindOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceHireIdRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.marketplaceHireRequestsService.findOne(dto.companyId, dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.hireRequests.approve')
  async marketplaceHireApprove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceHireIdRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.marketplaceHireRequestsService.approve(dto.companyId, dto.id, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.hireRequests.reject')
  async marketplaceHireReject(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceHireRejectRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.marketplaceHireRequestsService.reject(dto.companyId, dto.id, dto.actor, dto.rejectReason),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.list')
  async marketplaceAdminList(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminListDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.list({
        page: dto.page ?? 1,
        pageSize: dto.pageSize ?? 20,
        search: dto.search,
        status: dto.status ?? 'all',
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.findOne')
  async marketplaceAdminFindOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminFindOneDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.findOne(dto.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.create')
  async marketplaceAdminCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminCreateDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.create({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        expertise: dto.expertise,
        systemPrompt: dto.systemPrompt,
        boundModelName: dto.boundModelName,
        recommendedSkills: dto.recommendedSkills,
        skillTags: dto.skillTags,
        pricingModel: dto.pricingModel,
        priceCents: dto.priceCents,
        isPublished: dto.isPublished,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.update')
  async marketplaceAdminUpdate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminUpdateDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.update(dto.id, {
        name: dto.name,
        description: dto.description,
        expertise: dto.expertise,
        systemPrompt: dto.systemPrompt,
        boundModelName: dto.boundModelName,
        recommendedSkills: dto.recommendedSkills,
        skillTags: dto.skillTags,
        pricingModel: dto.pricingModel,
        priceCents: dto.priceCents,
        isPublished: dto.isPublished,
        keyBindings: dto.keyBindings?.map((k) => ({ llmKeyId: k.llmKeyId, sortOrder: k.sortOrder })),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
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
      : new RpcException({ status: 500, message: e?.message || 'Internal error' });
  }

  private runWithCompanyContext<T>(
    payload: { companyId?: string },
    callback: () => Promise<T>,
  ): Promise<T> {
    const companyId = payload?.companyId;
    if (!companyId) {
      throw new RpcException({ status: 400, message: 'companyId is required' });
    }
    return this.tenantContext.runWithCompanyId(companyId, callback);
  }
}
