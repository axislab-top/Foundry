import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsObject,
  Min,
  Max,
  MaxLength,
  IsArray,
  IsString,
  IsUUID,
  IsBoolean,
  ValidateNested,
  ValidateIf,
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
import { PlatformDepartmentsAdminService } from './services/platform-departments-admin.service.js';
import { MarketplaceHireRequestsService } from './services/marketplace-hire-requests.service.js';
import { MarketplaceSkillVersionService } from './services/marketplace-skill-version.service.js';
import { MarketplaceSkillPackagesService } from './services/marketplace-skill-packages.service.js';
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

  @IsUUID()
  @IsNotEmpty()
  organizationNodeId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class SkillsMarketplaceListRpcDto extends QueryMarketplaceDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class SkillsMarketplacePurchaseRpcDto {
  @IsUUID()
  packageId: string;

  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class SkillsMarketplaceBindToCompanyRpcDto extends SkillsMarketplacePurchaseRpcDto {}

class MarketplaceAdminSkillsListDto {
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

class MarketplaceAdminSkillsCreateDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsString()
  slug: string;

  @IsString()
  name: string;

  @IsUUID()
  sourceSkillId: string;

  @IsOptional()
  @IsUUID()
  sourceRevisionId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['free', 'one_time', 'subscription'])
  pricingModel?: 'free' | 'one_time' | 'subscription';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  subscriptionInterval?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPublished?: boolean;
}

class MarketplaceHireCreateDataDto {
  @IsUUID()
  marketplaceAgentId: string;

  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsIn(['permanent', 'temporary'])
  employmentType?: 'permanent' | 'temporary';

  @ValidateIf((o) => o.employmentType === 'temporary')
  @IsUUID()
  projectId?: string;

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

  @IsOptional()
  @IsIn(['ceo', 'department_head', 'employee'])
  agentCategory?: 'ceo' | 'department_head' | 'employee';
}

class MarketplaceAdminFindOneDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class MarketplaceAdminIdActionDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class MarketplaceAdminTestInvokeDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsString()
  @MaxLength(8000)
  message: string;

  @IsOptional()
  @IsUUID()
  llmKeyId?: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(8192)
  maxTokens?: number;
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
  @MaxLength(2048)
  iconUrl?: string | null;

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
  @IsIn(['ceo', 'department_head', 'employee'])
  agentCategory?: 'ceo' | 'department_head' | 'employee';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industryTags?: string[];

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendedForScales?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketplaceAdminUpdateKeyBindingDto)
  keyBindings?: MarketplaceAdminUpdateKeyBindingDto[];
}

class MarketplaceAdminSyncCeoLayersDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsOptional()
  @IsUUID()
  skillBindingValidationCompanyId?: string;
}

class MarketplaceAdminUpdateKeyBindingDto {
  @IsUUID()
  llmKeyId: string;

  @Type(() => Number)
  @IsInt()
  sortOrder: number;

  /** slug=ceo 时必填：strategy / orchestration / supervision；其它商品为 default */
  @IsOptional()
  @IsString()
  @IsIn(['default', 'strategy', 'orchestration', 'supervision'])
  ceoLayer?: string;
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
  @MaxLength(2048)
  iconUrl?: string | null;

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
  @IsObject()
  ceoLayerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  boundModelName?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  isPublished?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendedSkills?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  recommendedSkillVersionIds?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillTags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketplaceAdminUpdateKeyBindingDto)
  keyBindings?: MarketplaceAdminUpdateKeyBindingDto[];

  @IsOptional()
  @ValidateIf((o) => o.defaultEmbeddingModelId != null && o.defaultEmbeddingModelId !== '')
  @IsUUID()
  defaultEmbeddingModelId?: string | null;

  @IsOptional()
  @IsIn(['ceo', 'department_head', 'employee'])
  agentCategory?: 'ceo' | 'department_head' | 'employee';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industryTags?: string[];

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendedForScales?: string[];

  /** P13：与 ceoLayerConfig 一并提交时，对三层 skillIds 做公司级绑定校验 */
  @IsOptional()
  @IsUUID()
  skillBindingValidationCompanyId?: string;

}

class MarketplaceSkillsListAvailableRpcDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @IsString()
  skillName?: string;
}

class MarketplaceSkillsUpgradeVersionRpcDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  fromSkillId: string;

  @IsUUID()
  toSkillId: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  workerAutoSafeOnly?: boolean;
}

class MarketplaceSkillsWorkerAutoUpgradeRpcDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsArray()
  @IsUUID(undefined, { each: true })
  pinIds: string[];
}

function assertWorkerActorForInternalSkillUpgrade(actor: ActorDto): void {
  const wid = (
    process.env.FOUNDRY_WORKER_ACTOR_USER_ID ||
    process.env.WORKER_ACTOR_USER_ID ||
    '00000000-0000-4000-8000-000000000001'
  ).trim();
  if (actor.id !== wid) {
    throw new RpcException({ status: 403, message: 'Only worker service actor may call this RPC' });
  }
}

class MarketplaceAdminAvailableKeysDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  marketplaceAgentId: string;

  /** slug=ceo 时可选：strategy / orchestration / supervision；其它商品忽略 */
  @IsOptional()
  @IsString()
  @IsIn(['strategy', 'orchestration', 'supervision'])
  ceoLayer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelName?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

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
  pageSize?: number = 50;
}

class PlatformDepartmentsListDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class PlatformDepartmentsPublicListDto {
  // company users just need to be authenticated; no admin assert.
}

class PlatformDepartmentsCreateDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsString()
  @MaxLength(64)
  slug: string;

  @IsString()
  @MaxLength(120)
  displayName: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  /** 新建公司默认启用（基础部门） */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDefaultForNewCompany?: boolean;

  /** 可选：部门总监（商城 Agent），允许后续再绑定 */
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUUID()
  directorMarketplaceAgentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  responsibilitySummary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskTypeTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludesTaskTypeTags?: string[];
}

class PlatformDepartmentsUpdateDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDefaultForNewCompany?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  responsibilitySummary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskTypeTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludesTaskTypeTags?: string[];
}

class PlatformDepartmentsRemoveDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class PlatformDepartmentsSetDirectorDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsUUID()
  marketplaceAgentId: string;
}

@Controller()
export class TemplatesRpcController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly marketplaceService: MarketplaceService,
    private readonly marketplaceAdminService: MarketplaceAdminService,
    private readonly platformDepartmentsAdminService: PlatformDepartmentsAdminService,
    private readonly templateImporterService: TemplateImporterService,
    private readonly agentPurchaseService: AgentPurchaseService,
    private readonly marketplaceHireRequestsService: MarketplaceHireRequestsService,
    private readonly marketplaceSkillVersionService: MarketplaceSkillVersionService,
    private readonly marketplaceSkillPackagesService: MarketplaceSkillPackagesService,
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
        industry: dto.data?.industry,
        heartbeatEnabled: dto.data?.heartbeatEnabled,
        heartbeatFrequency: dto.data?.heartbeatFrequency,
        excludedDirectorAgentIds: dto.data?.excludedDirectorAgentIds,
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
        agentCategory: dto.agentCategory,
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

  @MessagePattern('marketplace.admin.testInvoke')
  async marketplaceAdminTestInvoke(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminTestInvokeDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.testInvoke(dto.id, {
        message: dto.message,
        llmKeyId: dto.llmKeyId,
        maxTokens: dto.maxTokens,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.publish')
  async marketplaceAdminPublish(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminIdActionDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.publish(dto.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.offline')
  async marketplaceAdminOffline(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminIdActionDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.offline(dto.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.clone')
  async marketplaceAdminClone(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminIdActionDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.clone(dto.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.delete')
  async marketplaceAdminDelete(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminIdActionDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.remove(dto.id);
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
        iconUrl: dto.iconUrl,
        description: dto.description,
        expertise: dto.expertise,
        systemPrompt: dto.systemPrompt,
        boundModelName: dto.boundModelName,
        recommendedSkills: dto.recommendedSkills,
        skillTags: dto.skillTags,
        agentCategory: dto.agentCategory ?? 'employee',
        departmentRoles: dto.departmentRoles,
        industryTags: dto.industryTags,
        version: dto.version,
        recommendedForScales: dto.recommendedForScales,
        isPublished: dto.isPublished,
        keyBindings: dto.keyBindings?.map((k) => ({
          llmKeyId: k.llmKeyId,
          sortOrder: k.sortOrder,
          ceoLayer: k.ceoLayer,
        })),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.syncCeoLayersFromRecommended')
  async marketplaceAdminSyncCeoLayersFromRecommended(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminSyncCeoLayersDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.syncCeoLayersSkillIdsFromRecommended(dto.id, {
        skillBindingValidationCompanyId: dto.skillBindingValidationCompanyId,
        operatorUserId: dto.actor.id,
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
        iconUrl: dto.iconUrl,
        description: dto.description,
        expertise: dto.expertise,
        systemPrompt: dto.systemPrompt,
        ceoLayerConfig: dto.ceoLayerConfig,
        boundModelName: dto.boundModelName,
        recommendedSkills: dto.recommendedSkills,
        skillTags: dto.skillTags,
        agentCategory: dto.agentCategory,
        departmentRoles: dto.departmentRoles,
        industryTags: dto.industryTags,
        version: dto.version,
        recommendedForScales: dto.recommendedForScales,
        isPublished: dto.isPublished,
        defaultEmbeddingModelId: dto.defaultEmbeddingModelId,
        keyBindings: dto.keyBindings?.map((k) => ({
          llmKeyId: k.llmKeyId,
          sortOrder: k.sortOrder,
          ceoLayer: k.ceoLayer,
        })),
        skillBindingValidationCompanyId: dto.skillBindingValidationCompanyId,
        operatorUserId: dto.actor.id,
        recommendedSkillVersionIds: dto.recommendedSkillVersionIds,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.skills.listAvailableVersions')
  async marketplaceSkillsListAvailableVersions(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceSkillsListAvailableRpcDto, payload);
      return await this.marketplaceSkillVersionService.listAvailableUpgrades(
        dto.companyId,
        dto.actor,
        dto.skillName,
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.skills.upgradeVersion')
  async marketplaceSkillsUpgradeVersion(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceSkillsUpgradeVersionRpcDto, payload);
      return await this.marketplaceSkillVersionService.upgradeVersion({
        companyId: dto.companyId,
        actor: dto.actor,
        fromSkillId: dto.fromSkillId,
        toSkillId: dto.toSkillId,
        workerAutoSafeOnly: dto.workerAutoSafeOnly,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.skills.workerAutoSafeUpgradePins')
  async marketplaceSkillsWorkerAutoSafeUpgradePins(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceSkillsWorkerAutoUpgradeRpcDto, payload);
      assertWorkerActorForInternalSkillUpgrade(dto.actor);
      return await this.marketplaceSkillVersionService.workerAutoSafeUpgradePins(
        dto.companyId,
        dto.actor,
        dto.pinIds,
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.marketplace.list')
  async skillsMarketplaceList(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsMarketplaceListRpcDto, payload);
      const { actor: _actor, ...query } = dto;
      return await this.marketplaceSkillPackagesService.listPublished(query);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.marketplace.purchase')
  async skillsMarketplacePurchase(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsMarketplacePurchaseRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.marketplaceSkillPackagesService.purchase(dto.companyId, dto.packageId, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('skills.marketplace.bindToCompany')
  async skillsMarketplaceBindToCompany(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(SkillsMarketplaceBindToCompanyRpcDto, payload);
      return await this.runWithCompanyContext(dto, () =>
        this.marketplaceSkillPackagesService.bindToCompany(dto.companyId, dto.packageId, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.skills.list')
  async marketplaceAdminSkillsList(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminSkillsListDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceSkillPackagesService.listAllAdmin({
        page: dto.page ?? 1,
        pageSize: dto.pageSize ?? 20,
        search: dto.search,
        status: dto.status ?? 'all',
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.skills.create')
  async marketplaceAdminSkillsCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminSkillsCreateDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceSkillPackagesService.createPackage({
        slug: dto.slug,
        name: dto.name,
        sourceSkillId: dto.sourceSkillId,
        sourceRevisionId: dto.sourceRevisionId,
        description: dto.description,
        pricingModel: dto.pricingModel,
        priceCents: dto.priceCents,
        subscriptionInterval: dto.subscriptionInterval,
        isPublished: dto.isPublished,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('marketplace.admin.availableKeys')
  async marketplaceAdminAvailableKeys(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(MarketplaceAdminAvailableKeysDto, payload);
      assertAdmin(dto.actor);
      return await this.marketplaceAdminService.listAvailableKeys({
        marketplaceAgentId: dto.marketplaceAgentId,
        ceoLayer: dto.ceoLayer,
        provider: dto.provider,
        modelName: dto.modelName,
        isActive: dto.isActive,
        page: dto.page ?? 1,
        pageSize: dto.pageSize ?? 50,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('platform.departments.list')
  async platformDepartmentsList(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(PlatformDepartmentsListDto, payload);
      assertAdmin(dto.actor);
      return await this.platformDepartmentsAdminService.list();
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('platform.departments.publicList')
  async platformDepartmentsPublicList(@Payload() _payload: any) {
    try {
      // Return same shape as admin list, but without requiring admin roles.
      return await this.platformDepartmentsAdminService.list();
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('platform.departments.create')
  async platformDepartmentsCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(PlatformDepartmentsCreateDto, payload);
      assertAdmin(dto.actor);
      return await this.platformDepartmentsAdminService.create({
        slug: dto.slug,
        displayName: dto.displayName,
        responsibilitySummary: dto.responsibilitySummary ?? '',
        taskTypeTags: dto.taskTypeTags,
        excludesTaskTypeTags: dto.excludesTaskTypeTags,
        sortOrder: dto.sortOrder,
        isDefaultForNewCompany: dto.isDefaultForNewCompany,
        directorMarketplaceAgentId: dto.directorMarketplaceAgentId,
        actorUserId: dto.actor.id,
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('platform.departments.update')
  async platformDepartmentsUpdate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(PlatformDepartmentsUpdateDto, payload);
      assertAdmin(dto.actor);
      return await this.platformDepartmentsAdminService.update(
        dto.id,
        {
          slug: dto.slug,
          displayName: dto.displayName,
          responsibilitySummary: dto.responsibilitySummary,
          taskTypeTags: dto.taskTypeTags,
          excludesTaskTypeTags: dto.excludesTaskTypeTags,
          sortOrder: dto.sortOrder,
          isDefaultForNewCompany: dto.isDefaultForNewCompany,
        },
        dto.actor.id,
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('platform.departments.remove')
  async platformDepartmentsRemove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(PlatformDepartmentsRemoveDto, payload);
      assertAdmin(dto.actor);
      return await this.platformDepartmentsAdminService.remove(dto.id, dto.actor.id);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('platform.departments.setDirector')
  async platformDepartmentsSetDirector(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(PlatformDepartmentsSetDirectorDto, payload);
      assertAdmin(dto.actor);
      return await this.platformDepartmentsAdminService.setDirector(
        dto.id,
        dto.marketplaceAgentId,
        dto.actor.id,
      );
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
