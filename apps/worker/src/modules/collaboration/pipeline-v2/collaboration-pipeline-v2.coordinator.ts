import { Injectable } from '@nestjs/common';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import {
  ceoDecisionInputFromPipelineRun,
  type CeoDecisionInputUnion,
} from '../ceo/dto/ceo-v2-pipeline.types.js';
import { CollaborationPipelineV2Service } from './collaboration-pipeline-v2.service.js';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
  RunMainRoomFlowParams,
  RunMainRoomPostIntentRouteParams,
} from './collaboration-pipeline-v2.types.js';

/**
 * Optional v2 coordinator wrapper.
 *
 * Useful when other listeners need to route into v2 without directly depending on the service.
 */
@Injectable()
export class CollaborationPipelineV2Coordinator {
  constructor(private readonly pipeline: CollaborationPipelineV2Service) {}

  run(input: CollaborationPipelineV2RunInput): Promise<CollaborationPipelineV2RunResult> {
    return this.pipeline.run(input);
  }

  /** 与 listener 一致：主群重链路入口（内部含 Intent + post-intent 导向 / replay）。 */
  runMainRoomFlow(params: RunMainRoomFlowParams): Promise<CollaborationPipelineV2RunResult> {
    return this.pipeline.runMainRoomFlow(params);
  }

  /** [阶段 2.2] 即时接话后异步重编排。 */
  runDeferredHeavyPipeline(
    params: Parameters<
      import('./collaboration-pipeline-v2.service.js').CollaborationPipelineV2Service['runDeferredHeavyPipeline']
    >[0],
  ): Promise<CollaborationPipelineV2RunResult> {
    return this.pipeline.runDeferredHeavyPipeline(params);
  }

  /** post-intent 主群导向（RPC/测试与 listener 对齐）。 */
  runMainRoomPostIntentRoute(
    params: RunMainRoomPostIntentRouteParams,
  ): Promise<CollaborationPipelineV2RunResult | null> {
    return this.pipeline.runMainRoomPostIntentRoute(params);
  }

  executeDeferredDispatchPlanFlush(
    ...args: Parameters<
      import('./collaboration-pipeline-v2.service.js').CollaborationPipelineV2Service['executeDeferredDispatchPlanFlush']
    >
  ) {
    return this.pipeline.executeDeferredDispatchPlanFlush(...args);
  }

  patchDispatchPlanFlushFailedMetadata(
    ...args: Parameters<
      import('./collaboration-pipeline-v2.service.js').CollaborationPipelineV2Service['patchDispatchPlanFlushFailedMetadata']
    >
  ) {
    return this.pipeline.patchDispatchPlanFlushFailedMetadata(...args);
  }

  /** P1.3：构造 L1 入口 union（主群可在 IntentLayer 后传入 unified） */
  buildL1CeoDecisionInput(
    input: CollaborationPipelineV2RunInput,
    unified?: CollaborationIntentDecisionV20261,
  ): CeoDecisionInputUnion {
    return ceoDecisionInputFromPipelineRun(input, unified);
  }
}

