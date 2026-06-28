import { Body, Controller, Get, HttpCode, HttpStatus, Patch, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TENANT_REQUIRED_METADATA_KEY } from '@service/tenant';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../common/types/user.types.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import { UpdatePlatformFallbackModelDto } from './dto/update-platform-fallback-model.dto.js';
import { UpdatePlatformMemoryDefaultEmbeddingModelDto } from './dto/update-platform-memory-default-embedding-model.dto.js';
import { UpdatePlatformIntentLayerGlobalSettingsDto } from './dto/update-platform-intent-layer-global-settings.dto.js';
import { UpdatePlatformReplayGlobalSettingsDto } from './dto/update-platform-replay-global-settings.dto.js';
import { UpsertIntentLayerRulesDto } from './dto/intent-layer-rule.dto.js';
import { IntentLayerPreviewDto } from './dto/intent-layer-preview.dto.js';
import { KNOWN_ROLES_WITH_DEFAULT_GLOBAL_SKILLS } from '../skills/default-skills.js';
import { CollaborationMainChainSettingsDto } from './dto/collaboration-main-chain-settings.dto.js';
import { PatchBillingActivityDto } from './dto/patch-billing-activity.dto.js';
import { ForbiddenException } from '@nestjs/common';

const ADMIN_ROLES = ['admin', 'owner', 'superadmin'] as const;

function assertAdmin(user: UserInfo): void {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (roles.some((r) => ADMIN_ROLES.includes(r as any))) return;
  throw new ForbiddenException('Insufficient permissions');
}

@ApiTags('admin.platform-settings')
@ApiBearerAuth('JWT-auth')
@SetMetadata(TENANT_REQUIRED_METADATA_KEY, false)
@Controller('admin/platform-settings')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('fallback-model')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取平台级兜底模型' })
  async getFallbackModel(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getFallbackModelConfig();
  }

  @Patch('fallback-model')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新平台级兜底模型' })
  @ApiBody({ type: UpdatePlatformFallbackModelDto })
  async setFallbackModel(@Body() dto: UpdatePlatformFallbackModelDto, @CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.setFallbackModel({
      model: dto.model ?? null,
      fallbackModelId: dto.fallbackModelId ?? null,
    });
  }

  @Get('memory-default-embedding-model')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取平台级 Memory 默认 Embedding 模型' })
  async getMemoryDefaultEmbeddingModel(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    const [defaultEmbeddingModelId, effective] = await Promise.all([
      this.settings.getMemoryDefaultEmbeddingModelId(),
      this.settings.getEffectiveMemoryDefaultEmbeddingModelId(),
    ]);
    return {
      defaultEmbeddingModelId,
      effective,
    };
  }

  @Patch('memory-default-embedding-model')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新平台级 Memory 默认 Embedding 模型' })
  @ApiBody({ type: UpdatePlatformMemoryDefaultEmbeddingModelDto })
  async setMemoryDefaultEmbeddingModel(
    @Body() dto: UpdatePlatformMemoryDefaultEmbeddingModelDto,
    @CurrentUser() user: UserInfo,
  ) {
    assertAdmin(user);
    return this.settings.setMemoryDefaultEmbeddingModelId(dto.defaultEmbeddingModelId ?? null);
  }

  @Get('role-default-global-skills')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '读取各角色默认全局 skill name（内置默认 + DB 覆盖）' })
  async getRoleDefaultGlobalSkills(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getRoleDefaultGlobalSkillsConfig();
  }

  @Patch('role-default-global-skills')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '按角色覆盖默认全局 skill name（overrides 中某角色传 null 表示删除覆盖、恢复代码内置）' })
  async patchRoleDefaultGlobalSkills(
    @Body() body: { overrides?: Record<string, string[] | null> },
    @CurrentUser() user: UserInfo,
  ) {
    assertAdmin(user);
    const patch: Record<string, string[] | null> = {};
    const raw = body?.overrides ?? {};
    const allowed = new Set<string>(KNOWN_ROLES_WITH_DEFAULT_GLOBAL_SKILLS as unknown as string[]);
    for (const [role, val] of Object.entries(raw)) {
      const r = String(role ?? '').trim();
      if (!allowed.has(r)) continue;
      if (val === null || val === undefined) {
        patch[r] = null;
      } else if (Array.isArray(val)) {
        patch[r] = [...new Set(val.map((x) => String(x ?? '').trim()).filter(Boolean))];
      }
    }
    return this.settings.patchRoleDefaultGlobalSkills(patch);
  }

  @Get('intent-layer-global-settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取平台级 IntentLayer 全局配置（含 runtimeEffect 元数据）',
  })
  async getIntentLayerGlobalSettings(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getIntentLayerGlobalSettings();
  }

  @Patch('intent-layer-global-settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '更新平台级 IntentLayer 全局配置（仅 model/key 等字段线上生效，响应含 runtimeEffect）',
  })
  @ApiBody({ type: UpdatePlatformIntentLayerGlobalSettingsDto })
  async patchIntentLayerGlobalSettings(
    @Body() dto: UpdatePlatformIntentLayerGlobalSettingsDto,
    @CurrentUser() user: UserInfo,
  ) {
    assertAdmin(user);
    return this.settings.setIntentLayerGlobalSettings(dto as Record<string, unknown>);
  }

  @Get('replay-global-settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取平台级主群 Intent→replay 管线旋钮（下发至各公司 CEO layer replay）' })
  async getReplayGlobalSettings(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getReplayGlobalSettings();
  }

  @Patch('replay-global-settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新平台级 replay 旋钮并同步至全部公司 ceo_layer_config' })
  @ApiBody({ type: UpdatePlatformReplayGlobalSettingsDto })
  async patchReplayGlobalSettings(@Body() dto: UpdatePlatformReplayGlobalSettingsDto, @CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.setReplayGlobalSettings(dto as Record<string, unknown>);
  }

  @Get('intent-layer-output-schema')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取主群前置受众路由输出说明（LLM 契约 + IntentDecision，不含 CEO L1–L3）',
  })
  async getIntentLayerOutputSchema(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getIntentLayerOutputSchema();
  }

  @Get('ceo-pipeline-output-schema')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取 CEO v2 主群管线 L1/L2/L3 结构化 JSON 参考（原 intent-layer-output-schema 中的 layers）',
  })
  async getCeoPipelineOutputSchema(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getCeoPipelineOutputSchema();
  }

  @Get('intent-layer-rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取平台级 IntentLayer 规则列表（只读归档，runtimeEffect=none）',
  })
  async getIntentLayerRules(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getIntentLayerRules();
  }

  @Patch('intent-layer-rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '已禁用：Rule Studio 归档为只读，Worker 不读取规则',
    deprecated: true,
  })
  @ApiBody({ type: UpsertIntentLayerRulesDto })
  async patchIntentLayerRules(@Body() dto: UpsertIntentLayerRulesDto, @CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.setIntentLayerRules((dto.rules ?? []) as unknown as Record<string, unknown>[]);
  }

  @Patch('intent-layer-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '预演主群受众路由：转发 Worker recognizeIntent 真值（不可用时返回 unavailable）',
  })
  @ApiBody({ type: IntentLayerPreviewDto })
  async previewIntentLayer(@Body() dto: IntentLayerPreviewDto, @CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.previewIntentLayer(dto as unknown as Record<string, unknown>);
  }

  @Get('collaboration-main-chain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '协作主链开关（平台级；Worker 部署需同步 env）' })
  async getCollaborationMainChain(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getCollaborationMainChainSettings();
  }

  @Patch('collaboration-main-chain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新协作主链开关' })
  @ApiBody({ type: CollaborationMainChainSettingsDto })
  async patchCollaborationMainChain(
    @Body() dto: CollaborationMainChainSettingsDto,
    @CurrentUser() user: UserInfo,
  ) {
    assertAdmin(user);
    return this.settings.patchCollaborationMainChainSettings(dto);
  }

  @Get('billing-activities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '平台计费活动（如新用户注册赠送）' })
  async getBillingActivities(@CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.getBillingActivities();
  }

  @Patch('billing-activities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新单项平台计费活动' })
  @ApiBody({ type: PatchBillingActivityDto })
  async patchBillingActivity(@Body() dto: PatchBillingActivityDto, @CurrentUser() user: UserInfo) {
    assertAdmin(user);
    return this.settings.patchBillingActivity(dto);
  }
}

