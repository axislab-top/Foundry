import { IsObject, IsOptional } from 'class-validator';

export class UpdateCompanyCeoLayerConfigDto {
  /**
   * CEO 三层配置（最终会走 resolver merge：公司覆盖 > 模板默认 > 全局 env）
   * 结构示例：
   * {
   *   "strategy": { modelName: "...", temperature?: 0.1, maxTokens?: 512, keySource?: "shared"|"dedicated", llmKeyId?: "uuid" },
   *   "orchestration": {
   *     systemPrompt?: string,
   *     casualPrompt?: string,
   *     structuredPrompt?: string,
   *     contextPolicy?: Record<string, any>,
   *     cachePolicy?: Record<string, any>,
   *     outputPolicy?: Record<string, any>
   *   },
   *   "supervision": {
   *     systemPrompt?: string,
   *     heavyPlannerPrompt?: string,
   *     heavySupervisorSplitPrompt?: string,
   *     heavySupervisorDecisionPrompt?: string,
   *     heavyForcedArbitrationPrompt?: string,
   *     heavySupervisorPostReviewPrompt?: string,
   *     heavyAutonomousPlanIntentPrompt?: string,
   *     heavyAutonomousPlanTasksPrompt?: string
   *   }
   * }
   */
  @IsOptional()
  @IsObject()
  ceoLayerConfig?: Record<string, unknown>;
}

