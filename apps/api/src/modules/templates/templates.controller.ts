import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TENANT_REQUIRED_METADATA_KEY } from '@service/tenant';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../common/types/user.types.js';
import { ImportTemplateDto } from './dto/import-template.dto.js';
import { QueryMarketplaceDto } from './dto/query-marketplace.dto.js';
import { QueryTemplatesDto } from './dto/query-templates.dto.js';
import { AgentPurchaseService } from './services/agent-purchase.service.js';
import { MarketplaceService } from './services/marketplace.service.js';
import { MarketplaceSkillPackagesService } from './services/marketplace-skill-packages.service.js';
import { TemplateImporterService } from './services/template-importer.service.js';
import { TemplatesService } from './services/templates.service.js';

class AdminSkillPackageCreateDto {
  slug: string;
  name: string;
  description?: string | null;
  sourceSkillId: string;
  sourceRevisionId?: string | null;
  pricingModel?: 'free' | 'one_time' | 'subscription';
  priceCents?: number;
  subscriptionInterval?: string | null;
  isPublished?: boolean;
}

@ApiTags('templates')
@ApiBearerAuth('JWT-auth')
@Controller()
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly marketplaceService: MarketplaceService,
    private readonly marketplaceSkillPackagesService: MarketplaceSkillPackagesService,
    private readonly templateImporterService: TemplateImporterService,
    private readonly agentPurchaseService: AgentPurchaseService,
  ) {}

  @Get('templates')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '公司模板列表（平台级）' })
  @ApiResponse({ status: 200 })
  async listTemplates(@Query() query: QueryTemplatesDto) {
    return this.templatesService.findAll(query);
  }

  @Get('templates/:id')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '模板详情' })
  @ApiParam({ name: 'id', description: '模板 UUID' })
  async getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOne(id);
  }

  @Get('templates/:id/preview')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '模板预览（结构摘要）' })
  @ApiParam({ name: 'id', description: '模板 UUID' })
  async previewTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.getPreview(id);
  }

  @Post('templates/:id/import')
  @HttpCode(HttpStatus.CREATED)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: '一键从模板创建新公司' })
  @ApiParam({ name: 'id', description: '模板 UUID' })
  async importTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ImportTemplateDto,
    @CurrentUser() user: UserInfo,
  ) {
    return this.templateImporterService.importCompanyTemplate(id, { id: user.id, roles: user.roles }, {
      companyName: body.companyName,
      industry: body.industry,
      heartbeatEnabled: body.heartbeatEnabled,
      heartbeatFrequency: body.heartbeatFrequency,
      excludedDirectorAgentIds: body.excludedDirectorAgentIds,
    });
  }

  @Get('marketplace/agents')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: 'Agent 商城列表' })
  async listMarketplace(@Query() query: QueryMarketplaceDto) {
    return this.marketplaceService.findAll(query);
  }

  @Get('marketplace/agents/:id')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: 'Agent 商品详情' })
  @ApiParam({ name: 'id', description: '商品 UUID' })
  async getMarketplaceAgent(@Param('id', ParseUUIDPipe) id: string) {
    return this.marketplaceService.findOne(id);
  }

  @Post('marketplace/agents/:id/purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '安装免费 Agent（需公司上下文）' })
  @ApiParam({ name: 'id', description: '商品 UUID' })
  @ApiQuery({ name: 'companyId', required: true })
  @ApiQuery({ name: 'organizationNodeId', required: true, description: '安装目标组织节点（通常为 agent 空槽位）' })
  async purchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId', ParseUUIDPipe) companyId: string,
    @Query('organizationNodeId', ParseUUIDPipe) organizationNodeId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.agentPurchaseService.purchase(id, companyId, { id: user.id, roles: user.roles }, organizationNodeId);
  }

  @Get('marketplace/skills')
  @HttpCode(HttpStatus.OK)
  @SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
  @ApiOperation({ summary: 'Skill 商城列表' })
  async listMarketplaceSkills(@Query() query: QueryMarketplaceDto) {
    return this.marketplaceSkillPackagesService.listPublished(query);
  }

  @Post('marketplace/skills/:id/purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '购买 Skill 包（需公司上下文）' })
  async purchaseSkillPackage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.marketplaceSkillPackagesService.purchase(companyId, id, { id: user.id, roles: user.roles });
  }

  @Post('marketplace/skills/:id/bind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '购买后将 Skill 包导入并绑定到公司' })
  async bindPurchasedSkillPackage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.marketplaceSkillPackagesService.bindToCompany(companyId, id, { id: user.id, roles: user.roles });
  }

  @Get('marketplace/admin/skills')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: Skill 包列表' })
  async listAdminSkillPackages(@Query() query: QueryMarketplaceDto) {
    return this.marketplaceSkillPackagesService.listAllAdmin({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: ((query as any).status ?? 'all') as any,
    });
  }

  @Post('marketplace/admin/skills')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: 上架 Skill 包' })
  async createAdminSkillPackage(@Body() dto: AdminSkillPackageCreateDto) {
    return this.marketplaceSkillPackagesService.createPackage(dto);
  }
}
