import { Injectable, Logger } from '@nestjs/common';
import {
  buildEffectiveOpenAiTools,
  type OpenAiFunctionTool,
  ToolRegistry,
} from '@service/ai';
import { ConfigService } from '../../../common/config/config.service.js';
import { CompanyToolsetResolverService } from '../../agents/services/company-toolset-resolver.service.js';
import { CeoLayerConfigResolverService } from './resolver/ceo-layer-config-resolver.service.js';
import {
  applyCeoV2ToolSurface,
  type CeoV2ToolSurfaceLayer,
} from './v2/ceo-v2-tool-surface.util.js';

export type CeoLayerKey = 'strategy' | 'orchestration' | 'supervision' | 'replay';

export type BuildCeoLayerOpenAiToolsParams = {
  companyId: string;
  ceoAgentId: string;
  layer: CeoLayerKey;
  /** Override layer skillIds; default from CEO layer config. */
  configuredSkillIds?: string[];
  retainToolNames?: Set<string>;
  /** Apply COLLAB_CEO_V2_TOOL_SURFACE_* allowlist (strategy → planning). */
  applyV2ToolSurface?: boolean;
};

export type BuildCeoLayerOpenAiToolsResult = {
  tools: OpenAiFunctionTool[];
  injectedToolNames: string[];
  configuredSkillIds: string[];
  dedupeDroppedCount: number;
  boundMcpToolNames: string[];
  skillCatalog: ReturnType<typeof buildEffectiveOpenAiTools>['skillCatalog'];
};

@Injectable()
export class CeoLayerOpenAiToolsService {
  private readonly logger = new Logger(CeoLayerOpenAiToolsService.name);

  constructor(
    private readonly registry: ToolRegistry,
    private readonly config: ConfigService,
    private readonly layerConfigResolver: CeoLayerConfigResolverService,
    private readonly companyToolsets: CompanyToolsetResolverService,
  ) {}

  async build(params: BuildCeoLayerOpenAiToolsParams): Promise<BuildCeoLayerOpenAiToolsResult> {
    const companyId = String(params.companyId ?? '').trim();
    const ceoAgentId = String(params.ceoAgentId ?? '').trim();
    if (!companyId || !ceoAgentId) {
      return {
        tools: [],
        injectedToolNames: [],
        configuredSkillIds: [],
        dedupeDroppedCount: 0,
        boundMcpToolNames: [],
        skillCatalog: [],
      };
    }

    let configuredSkillIds = params.configuredSkillIds;
    if (!configuredSkillIds?.length) {
      const layerCfg = await this.layerConfigResolver
        .resolveLayerSetting(companyId, params.layer)
        .catch(() => null);
      configuredSkillIds = Array.isArray(layerCfg?.skillIds)
        ? layerCfg.skillIds.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
        : [];
    }

    if (!configuredSkillIds.length) {
      return {
        tools: [],
        injectedToolNames: [],
        configuredSkillIds: [],
        dedupeDroppedCount: 0,
        boundMcpToolNames: [],
        skillCatalog: [],
      };
    }

    const snapshots = await this.registry.getToolSnapshotsDynamic(companyId, ceoAgentId);
    const enabledToolsets = await this.companyToolsets.getEnabledToolsets(companyId);
    const built = buildEffectiveOpenAiTools(this.registry, {
      snapshots,
      configuredSkillIds,
      enabledToolsets,
      progressiveDisclosure: this.config.isSkillProgressiveDisclosureEnabled(),
      retainToolNames: params.retainToolNames,
      toolSearch: {
        enabled: this.config.isToolSearchEnabled(),
        threshold: this.config.getToolSearchThreshold(),
      },
    });

    let tools = built.tools;
    if (params.applyV2ToolSurface !== false && params.layer !== 'replay') {
      const surfaceLayer = this.toV2SurfaceLayer(params.layer);
      if (surfaceLayer) {
        const surfaceMode = this.config.getCeoV2ToolSurfaceMode();
        const allowlist = this.config.getCeoV2ToolSurfaceAllowlist(surfaceLayer);
        const surfaced = applyCeoV2ToolSurface({
          layer: surfaceLayer,
          mode: surfaceMode,
          allowlist,
          tools: built.tools,
        });
        if (surfaced.droppedByAllowlist.length && surfaceMode !== 'off') {
          this.logger.warn('ceo_layer.tools.surface_filtered', {
            layer: params.layer,
            companyId,
            droppedByAllowlist: surfaced.droppedByAllowlist.slice(0, 32),
            mode: surfaceMode,
          });
        }
        tools = surfaced.tools;
      }
    }

    const injectedToolNames = tools.map((t) => String(t.function.name ?? '').trim()).filter(Boolean);
    return {
      tools,
      injectedToolNames,
      configuredSkillIds,
      dedupeDroppedCount: built.dedupeDroppedCount,
      boundMcpToolNames: built.boundMcpToolNames,
      skillCatalog: built.skillCatalog,
    };
  }

  private toV2SurfaceLayer(layer: CeoLayerKey): CeoV2ToolSurfaceLayer | null {
    if (layer === 'strategy') return 'planning';
    if (layer === 'orchestration' || layer === 'supervision') return layer;
    return null;
  }
}
