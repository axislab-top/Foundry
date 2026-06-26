import { Injectable } from '@nestjs/common';
import type { CeoDecisionInputUnion, CeoDecisionResult } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { CeoDecisionInputBridge } from '../ceo/dto/ceo-v2-pipeline.types.js';

/**
 * P1.3：L1 输出归一化 — 在保留 legacy `CeoDecisionResult` 形状的前提下，把 unified intent 摘要写入 `classifierContextBrief`。
 */
@Injectable()
export class L1PostNormalizerService {
  normalize(decision: CeoDecisionResult, input: CeoDecisionInputUnion): CeoDecisionResult {
    const unified = CeoDecisionInputBridge.tryUnified(input);
    if (!unified) return decision;
    const brief = `[2026.1 unified intent] intentType=${unified.intentType} confidence=${unified.confidence} shouldExecute=${unified.routingHints.shouldExecute} traceId=${unified.traceId}`;
    const prev = decision.l1DecisionContext.classifierContextBrief ?? '';
    return {
      ...decision,
      l1DecisionContext: {
        ...decision.l1DecisionContext,
        classifierContextBrief: [prev, brief].filter(Boolean).join('\n').slice(0, 8000),
      },
    };
  }
}
