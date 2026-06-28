import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  SetMetadata,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TENANT_REQUIRED_METADATA_KEY, TenantContextService } from '@service/tenant';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../common/types/user.types.js';
import { CompaniesService } from './companies.service.js';
import { CompanyQuickCreateService } from './services/company-quick-create.service.js';
import { CompanyCreationQuotaService } from './services/company-creation-quota.service.js';
import { CompanySetupRecommendationService } from './services/company-setup-recommendation.service.js';
import { CompanyTemplateEngineService } from './services/company-template-engine.service.js';
import { CompanyProfileService } from '../memory/services/company-profile.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { QuickCreateCompanyDto } from './dto/quick-create-company.dto.js';
import { RecommendCompanySetupDto } from './dto/recommend-company-setup.dto.js';
import {
  PatchOrganizationDraftDto,
  RecommendCompanyTemplatesDto,
} from './dto/company-template-recommendation.dto.js';
import { QueryCompanyDto } from './dto/query-company.dto.js';
import { UpdateCompanyHeartbeatConfigDto } from './dto/update-company-heartbeat-config.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto.js';

@ApiTags('companies')
@ApiBearerAuth('JWT-auth')
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly companyQuickCreateService: CompanyQuickCreateService,
    private readonly creationQuota: CompanyCreationQuotaService,
    private readonly recommendationService: CompanySetupRecommendationService,
    private readonly templateEngine: CompanyTemplateEngineService,
    private readonly tenantContext: TenantContextService,
    private readonly companyProfiles: CompanyProfileService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '一键创建公司' })
  @ApiBody({ type: CreateCompanyDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(@Body() dto: CreateCompanyDto, @CurrentUser() user: UserInfo) {
    return this.companiesService.create(dto, { id: user.id, roles: user.roles });
  }

  @Post('quick-create')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '自然语言解析为创建公司参数（预览，不创建公司）' })
  @ApiBody({ type: QuickCreateCompanyDto })
  @ApiResponse({ status: 200, description: '解析结果' })
  async quickCreate(@Body() dto: QuickCreateCompanyDto) {
    return this.companyQuickCreateService.parseNaturalLanguage(dto.naturalLanguage);
  }

  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '创建向导草稿公司（status=draft，用于上传等需携带租户的场景）' })
  @ApiResponse({ status: 201, description: '草稿公司已创建' })
  async createDraft(@CurrentUser() user: UserInfo) {
    return this.companiesService.createDraftShell({ id: user.id, roles: user.roles });
  }

  @Post('setup-recommendation')
  @HttpCode(HttpStatus.OK)
  @Public()
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: 'AI 推荐公司初始组织/Agent（预览，不创建公司）' })
  @ApiBody({ type: RecommendCompanySetupDto })
  @ApiResponse({ status: 200, description: '推荐结果' })
  async setupRecommendation(
    @Body() dto: RecommendCompanySetupDto,
    @Headers('x-company-id') companyId?: string,
  ) {
    const result = await this.recommendationService.recommend(dto, companyId);
    return {
      ...result,
      departmentPlacements: this.templateEngine.enrichPlacementsWithPlatformSlug(
        result.departmentPlacements,
      ),
    };
  }

  @Post('wizard/template-recommendations')
  @HttpCode(HttpStatus.OK)
  @Public()
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '向导 Step 2：Top 3 组织结构模板推荐' })
  @ApiBody({ type: RecommendCompanyTemplatesDto })
  async recommendWizardTemplates(
    @Body() dto: RecommendCompanyTemplatesDto,
    @Headers('x-company-id') companyId?: string,
  ) {
    return this.templateEngine.recommendTemplates(dto, companyId);
  }

  @Post('wizard/patch-organization-draft')
  @HttpCode(HttpStatus.OK)
  @Public()
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '向导 Step 3：自然语言调整组织草稿（Phase 2）' })
  @ApiBody({ type: PatchOrganizationDraftDto })
  async patchOrganizationDraft(@Body() dto: PatchOrganizationDraftDto) {
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
  }

  @Get('creation-quota')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '查询当前用户可创建公司的配额' })
  @ApiResponse({ status: 200, description: '配额信息' })
  async getCreationQuota(@CurrentUser() user: UserInfo) {
    return this.creationQuota.getQuota({ id: user.id, roles: user.roles });
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询我的公司列表' })
  @ApiQuery({ type: QueryCompanyDto })
  async findAll(@Query() query: QueryCompanyDto, @CurrentUser() user: UserInfo) {
    return this.companiesService.findAll(query, { id: user.id, roles: user.roles });
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '完成向导：将草稿公司激活并写入最终资料' })
  @ApiParam({ name: 'id', description: '草稿公司 ID (UUID)' })
  @ApiBody({ type: CreateCompanyDto })
  @ApiResponse({ status: 200, description: '公司已激活' })
  async completeWizard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(id, () =>
      this.companiesService.completeWizard(id, dto, { id: user.id, roles: user.roles }),
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询公司详情' })
  @ApiParam({ name: 'id', description: '公司ID (UUID)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantContext.runWithCompanyId(id, () => this.companiesService.findOne(id));
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新公司信息' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(id, () =>
      this.companiesService.update(id, dto, { id: user.id, roles: user.roles }),
    );
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新公司状态' })
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyStatusDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(id, () =>
      this.companiesService.changeStatus(id, dto, { id: user.id, roles: user.roles }),
    );
  }

  @Post(':id/company-profile/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动同步公司档案到 Memory-RAG（namespace=company / CompanyProfile）' })
  async syncCompanyProfile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserInfo) {
    return this.tenantContext.runWithCompanyId(id, async () => {
      await this.companiesService.assertCanManageCompanyAsActor(id, { id: user.id, roles: user.roles });
      return this.companyProfiles.syncCompanyProfile({
        companyId: id,
        trigger: 'admin_http',
      });
    });
  }

  @Get(':id/heartbeat-config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取公司 Heartbeat 配置' })
  async getHeartbeatConfig(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserInfo) {
    return this.tenantContext.runWithCompanyId(id, () =>
      this.companiesService.getHeartbeatConfig(id, { id: user.id, roles: user.roles }),
    );
  }

  @Patch(':id/heartbeat-config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新公司 Heartbeat 配置' })
  async updateHeartbeatConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyHeartbeatConfigDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.tenantContext.runWithCompanyId(id, () =>
      this.companiesService.updateHeartbeatConfig(id, dto, { id: user.id, roles: user.roles }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除公司（取消创建/释放资源）' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserInfo) {
    return this.tenantContext.runWithCompanyId(id, () =>
      this.companiesService.remove(id, { id: user.id, roles: user.roles }),
    );
  }
}
