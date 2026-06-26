import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../../common/config/config.service.js';

export type CeoV2Layer = 'intent' | 'strategy' | 'orchestration' | 'supervision' | 'replay';
export const CEO_V2_LAYER_CONTEXT = {
  INTENT: 'intent',
  STRATEGY: 'strategy',
  ORCHESTRATION: 'orchestration',
  SUPERVISION: 'supervision',
  REPLAY: 'replay',
} as const satisfies Record<string, CeoV2Layer>;

@Injectable()
export class CeoLayerConfig {
  constructor(private readonly config: ConfigService) {}

  getDiscussionModerationMaxSpeakers(): number {
    return this.config.getDiscussionModerationMaxSpeakers();
  }

  /** Admin 未配置 intent 子层时：COLLAB_INTENT_MODEL → CEO_STRATEGY_MODEL（与 API 存盘结构一致）。 */
  getIntentLayerModel(): string {
    const fromIntent = this.config.getCollabIntentModel().trim();
    if (fromIntent) return fromIntent;
    return this.getStrategyModel();
  }

  getStrategyModel(): string {
    return this.config.getCeoStrategyModel();
  }

  getOrchestrationModel(): string {
    return this.config.getCeoOrchestrationModel();
  }

  getSupervisionModel(): string {
    return this.config.getCeoSupervisionModel();
  }

  /** 主群 Intent→replay 自然回复专用模型（与 L2 orchestration 解耦）。 */
  getReplayModel(): string {
    return this.config.getCeoReplayModelName();
  }

  getDecisionLlmTimeoutMs(): number {
    return this.config.getCeoDecisionLlmTimeoutMs();
  }

  getDecisionMaxOutputTokens(): number {
    return this.config.getCeoDecisionMaxOutputTokens();
  }

  getDecisionMaxContextMessages(): number {
    return this.config.getCeoDecisionMaxContextMessages();
  }

  isDecisionCacheEnabled(): boolean {
    return this.config.isCeoDecisionCacheEnabled();
  }

  getDecisionCacheTtlMs(): number {
    return this.config.getCeoDecisionCacheTtlMs();
  }

  getIntentConfidenceThreshold(): number {
    return this.config.getCollabIntentConfidenceThreshold();
  }

  /** 召唤场景：被 @ 成员不在房内时的 CEO provisional 文案模板（见 ConfigService 环境变量说明） */
  getSummonMissingMembersNoticeTemplate(): string {
    return this.config.getCollabSummonMissingMembersNoticeTemplate();
  }
}

