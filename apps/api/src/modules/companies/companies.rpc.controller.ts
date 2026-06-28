import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { CompaniesService } from './companies.service.js';
import { CompanyQuickCreateService } from './services/company-quick-create.service.js';
import { CompanyCreationQuotaService } from './services/company-creation-quota.service.js';
import { CompanySetupRecommendationService } from './services/company-setup-recommendation.service.js';
import { CompanyTemplateEngineService } from './services/company-template-engine.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { QueryCompanyDto } from './dto/query-company.dto.js';
import { RecommendCompanySetupDto } from './dto/recommend-company-setup.dto.js';
import {
  PatchOrganizationDraftDto,
  RecommendCompanyTemplatesDto,
} from './dto/company-template-recommendation.dto.js';
import { UpdateCompanyHeartbeatConfigDto } from './dto/update-company-heartbeat-config.dto.js';
import { UpdateCompanyCeoDecisionConfigDto } from './dto/update-company-ceo-decision-config.dto.js';
import { UpdateCompanyCeoGovernancePolicyDto } from './dto/update-company-ceo-governance-policy.dto.js';
import { UpdateCompanyCeoLayerConfigDto } from './dto/update-company-ceo-layer-config.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class CompaniesFindOneDto {
  @IsUUID()
  id: string;
}

class CompaniesCreateDto extends CreateCompanyDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesUpdateDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateCompanyDto)
  data: UpdateCompanyDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesStatusDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateCompanyStatusDto)
  data: UpdateCompanyStatusDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesRemoveDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesValidateAccessDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  userId: string;
}

class CompaniesMembershipFindActiveDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  userId: string;
}

class CompaniesMembershipCountActiveDto {
  @IsUUID()
  companyId: string;
}

class CompaniesHeartbeatConfigGetDto {
  @IsUUID()
  companyId: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesHeartbeatConfigUpdateDto extends CompaniesHeartbeatConfigGetDto {
  @ValidateNested()
  @Type(() => UpdateCompanyHeartbeatConfigDto)
  data: UpdateCompanyHeartbeatConfigDto;
}

class CompaniesCeoDecisionConfigGetDto extends CompaniesHeartbeatConfigGetDto {}

class CompaniesCeoDecisionConfigUpdateDto extends CompaniesCeoDecisionConfigGetDto {
  @ValidateNested()
  @Type(() => UpdateCompanyCeoDecisionConfigDto)
  data: UpdateCompanyCeoDecisionConfigDto;
}

class CompaniesCeoLayerConfigGetDto extends CompaniesHeartbeatConfigGetDto {}

class CompaniesCeoLayerConfigUpdateDto extends CompaniesCeoLayerConfigGetDto {
  @ValidateNested()
  @Type(() => UpdateCompanyCeoLayerConfigDto)
  data: UpdateCompanyCeoLayerConfigDto;
}

class CompaniesCeoGovernancePolicyGetDto extends CompaniesHeartbeatConfigGetDto {}

class CompaniesCeoGovernancePolicyUpdateDto extends CompaniesCeoGovernancePolicyGetDto {
  @ValidateNested()
  @Type(() => UpdateCompanyCeoGovernancePolicyDto)
  data: UpdateCompanyCeoGovernancePolicyDto;
}

class CompaniesSnapshotSaveDto extends CompaniesHeartbeatConfigGetDto {
  @IsString()
  version: string;

  @IsOptional()
  snapshot?: Record<string, unknown>;
}

class CompaniesSnapshotGetLatestDto extends CompaniesHeartbeatConfigGetDto {}

class CompaniesFindAllDto extends QueryCompanyDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesQuickCreateRpcDto {
  @IsString()
  @Length(1, 8000)
  naturalLanguage: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesCreateDraftRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesCreationQuotaDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesCompleteWizardDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => CreateCompanyDto)
  data: CreateCompanyDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompaniesSetupRecommendationRpcDto extends RecommendCompanySetupDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class CompaniesRecommendTemplatesRpcDto extends RecommendCompanyTemplatesDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class CompaniesPatchOrganizationDraftRpcDto extends PatchOrganizationDraftDto {}

@Controller()
export class CompaniesRpcController {
  private readonly logger = new Logger(CompaniesRpcController.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly companyQuickCreateService: CompanyQuickCreateService,
    private readonly creationQuota: CompanyCreationQuotaService,
    private readonly recommendationService: CompanySetupRecommendationService,
    private readonly templateEngine: CompanyTemplateEngineService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * 公司级 RPC 必须在 CLS 中设置当前租户（company id），否则：
   * - TenantGuard 对非 HTTP（RabbitMQ RPC）不执行，不会写入 CLS（见 infrastructure/tenant TenantGuard）
   * - TenantTypeormContextBootstrapper 依赖 CLS 在连接上设置 app.current_tenant
   * - company_memberships 等表受 RLS 约束，未设租户时读不到成员行 → 误判「非 Owner」
   *
   * 网关可能透传 payload.companyId（来自 x-company-id），但绝不能仅依赖它：若字段缺失则历史上会跳过
   * runWithCompanyId。路由契约里公司已由 dto.id（与 URL :id）唯一确定，应始终以它为租户作用域。
   */
  private runCompanyScopedRpc<T>(
    payload: unknown,
    routeCompanyId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const fromPayload = this.resolveCompanyId(payload);
    if (fromPayload && fromPayload !== routeCompanyId) {
      this.logger.warn('RPC tenant scope: payload.companyId differs from route company id; using route id', {
        payloadCompanyId: fromPayload,
        routeCompanyId,
      });
    }
    return this.tenantContext.runWithCompanyId(routeCompanyId, run);
  }

  @MessagePattern('companies.creationQuota')
  async creationQuota(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCreationQuotaDto, payload);
      return await this.creationQuota.getQuota(dto.actor);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.findAll')
  async findAll(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesFindAllDto, payload);
      const companyId = this.resolveCompanyId(payload);
      const run = () => this.companiesService.findAll(dto, dto.actor);
      return await executeRpc({
        logger: this.logger,
        pattern: 'companies.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: async () =>
          companyId
            ? await this.tenantContext.runWithCompanyId(companyId, run)
            : await run(),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.findOne')
  async findOne(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesFindOneDto, payload);
      const run = () => this.companiesService.findOne(dto.id);
      return await this.runCompanyScopedRpc(payload, dto.id, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.create')
  async create(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCreateDto, payload);
      return await this.companiesService.create(dto, dto.actor);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.quickCreate')
  async quickCreate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesQuickCreateRpcDto, payload);
      return await this.companyQuickCreateService.parseNaturalLanguage(dto.naturalLanguage);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.createDraft')
  async createDraft(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCreateDraftRpcDto, payload);
      return await this.companiesService.createDraftShell(dto.actor);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.completeWizard')
  async completeWizard(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCompleteWizardDto, payload);
      const run = () => this.companiesService.completeWizard(dto.id, dto.data, dto.actor);
      return await this.runCompanyScopedRpc(payload, dto.id, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.setupRecommendation')
  async setupRecommendation(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesSetupRecommendationRpcDto, payload);
      const companyId = dto.companyId ?? this.resolveCompanyId(payload);
      const result = await this.recommendationService.recommend(dto, companyId);
      return {
        ...result,
        departmentPlacements: this.templateEngine.enrichPlacementsWithPlatformSlug(
          result.departmentPlacements,
        ),
      };
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.recommendTemplates')
  async recommendTemplates(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesRecommendTemplatesRpcDto, payload);
      const companyId = dto.companyId ?? this.resolveCompanyId(payload);
      return await this.templateEngine.recommendTemplates(dto, companyId);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.patchOrganizationDraft')
  async patchOrganizationDraft(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesPatchOrganizationDraftRpcDto, payload);
      const next = await this.templateEngine.patchPlacementsByPrompt(
        dto.departmentPlacements ?? [],
        dto.prompt,
        dto.scale ?? 'medium',
      );
      return {
        departmentPlacements: next,
        previewGraph: await this.templateEngine.buildPreviewGraph(next),
        stats: this.templateEngine.computeStats(next),
      };
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.update')
  async update(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesUpdateDto, payload);
      const run = () => this.companiesService.update(dto.id, dto.data, dto.actor);
      return await this.runCompanyScopedRpc(payload, dto.id, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.changeStatus')
  async changeStatus(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesStatusDto, payload);
      const run = () => this.companiesService.changeStatus(dto.id, dto.data, dto.actor);
      return await this.runCompanyScopedRpc(payload, dto.id, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.remove')
  async remove(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesRemoveDto, payload);
      const run = () => this.companiesService.remove(dto.id, dto.actor);
      return await this.runCompanyScopedRpc(payload, dto.id, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.validateAccess')
  async validateAccess(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesValidateAccessDto, payload);
      const run = () => this.companiesService.validateAccess(dto.companyId, dto.userId);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.membership.findActive')
  async membershipFindActive(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompaniesMembershipFindActiveDto, payload);
      const run = () => this.companiesService.findActiveMembership(dto.companyId, dto.userId);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.membership.countActive')
  async membershipCountActive(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CompaniesMembershipCountActiveDto, payload);
      const run = () => this.companiesService.countActiveMemberships(dto.companyId);
      const count = await this.tenantContext.runWithCompanyId(dto.companyId, run);
      return { count };
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.heartbeat.getConfig')
  async heartbeatGetConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesHeartbeatConfigGetDto, payload);
      const run = () => this.companiesService.getHeartbeatConfig(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.heartbeat.updateConfig')
  async heartbeatUpdateConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesHeartbeatConfigUpdateDto, payload);
      const run = () => this.companiesService.updateHeartbeatConfig(dto.companyId, dto.data, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoDecision.getConfig')
  async ceoDecisionGetConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoDecisionConfigGetDto, payload);
      const run = () => this.companiesService.getCeoDecisionConfig(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoDecision.updateConfig')
  async ceoDecisionUpdateConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoDecisionConfigUpdateDto, payload);
      const run = () =>
        this.companiesService.updateCeoDecisionConfig(dto.companyId, dto.data, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoLayerConfig.getConfig')
  async ceoLayerConfigGetConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoLayerConfigGetDto, payload);
      const run = () => this.companiesService.getCeoLayerConfig(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoLayerConfig.updateConfig')
  async ceoLayerConfigUpdateConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoLayerConfigUpdateDto, payload);
      const run = () =>
        this.companiesService.updateCeoLayerConfig(
          dto.companyId,
          dto.data.ceoLayerConfig ?? {},
          dto.actor,
        );
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoLayerConfig.syncSkillsToAgent')
  async ceoLayerConfigSyncSkillsToAgent(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoLayerConfigGetDto, payload);
      const run = () => this.companiesService.syncCeoLayerSkillsToAgent(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoLayerConfig.syncFromTemplate')
  async ceoLayerConfigSyncFromTemplate(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoLayerConfigGetDto, payload);
      const run = () => this.companiesService.syncCeoLayerConfigFromTemplate(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoLayerConfig.atomicSync')
  async ceoLayerConfigAtomicSync(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoLayerConfigGetDto, payload);
      const run = () => this.companiesService.atomicSyncCeoLayerConfigToAgent(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoGovernancePolicy.getConfig')
  async ceoGovernancePolicyGetConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoGovernancePolicyGetDto, payload);
      const run = () => this.companiesService.getCeoGovernancePolicy(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoGovernancePolicy.getTemplates')
  async ceoGovernancePolicyGetTemplates(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoGovernancePolicyGetDto, payload);
      const run = () => this.companiesService.getCeoGovernancePolicyTemplates(dto.companyId, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.ceoGovernancePolicy.updateConfig')
  async ceoGovernancePolicyUpdateConfig(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesCeoGovernancePolicyUpdateDto, payload);
      const run = () =>
        this.companiesService.updateCeoGovernancePolicy(dto.companyId, dto.data, dto.actor);
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.snapshot.save')
  async snapshotSave(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesSnapshotSaveDto, payload);
      const run = () =>
        this.companiesService.saveSnapshot({
          companyId: dto.companyId,
          version: dto.version,
          snapshot: (dto.snapshot ?? {}) as Record<string, unknown>,
          actor: dto.actor,
        });
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('companies.snapshot.getLatest')
  async snapshotGetLatest(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(CompaniesSnapshotGetLatestDto, payload);
      const run = () =>
        this.companiesService.getLatestSnapshot({
          companyId: dto.companyId,
          actor: dto.actor,
        });
      return await this.tenantContext.runWithCompanyId(dto.companyId, run);
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private resolveCompanyId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const v = (payload as { companyId?: unknown }).companyId;
    return typeof v === 'string' ? v : undefined;
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
}
