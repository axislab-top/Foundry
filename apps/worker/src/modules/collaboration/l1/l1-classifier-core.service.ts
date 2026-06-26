import { Injectable } from '@nestjs/common';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { CeoDecisionInputUnion } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { CeoDecisionInputBridge } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { PreContextService, type PreContextResult } from './pre-context.service.js';

/** L1 核心分类输出：在 pre-context 上附带可选 2026.1 SSOT（供 post-normalizer / L2） */
export type L1ClassifierCoreOutput = PreContextResult & {
  intentDecision2026_1?: CollaborationIntentDecisionV20261;
};

/**
 * P1.3：L1 入口门面（对应规划中的 L1ClassifierCoreService）。
 * 当前实现：委托 `PreContextService.buildClassifierContext`，并从 union 解析 unified intent。
 * 后续可在此接入 `buildCollaborationIntentDecisionV20261` / 结构化 parse 分支。
 */
@Injectable()
export class L1ClassifierCoreService {
  constructor(private readonly preContext: PreContextService) {}

  async classifyCore(input: CeoDecisionInputUnion): Promise<L1ClassifierCoreOutput> {
    const pre = await this.preContext.buildClassifierContext(input);
    const intentDecision2026_1 = CeoDecisionInputBridge.tryUnified(input);
    return { ...pre, intentDecision2026_1 };
  }
}
