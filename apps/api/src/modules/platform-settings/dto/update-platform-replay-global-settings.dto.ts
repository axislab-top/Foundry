import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * 平台级主群 **Intent→replay** 管线旋钮（写入各公司 `strategy.contextPolicy.replay`）。
 * Worker 合并：公司配置覆盖模板；未设置字段回落 Worker 进程环境变量。
 */
export class UpdatePlatformReplayGlobalSettingsDto {
  @IsOptional()
  @IsBoolean()
  /** 对应 Worker MAIN_ROOM_INTENT_INLINE_REPLY_ENABLED */
  mainRoomIntentInlineReplyEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  /** 对应 MAIN_ROOM_INTENT_INLINE_REPLY_MIN_CONFIDENCE */
  mainRoomIntentInlineReplyMinConfidence?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  /** natural replay 记忆门控；对应 CEO_REPLAY_MEMORY_THRESHOLD 语义 */
  ceoReplayMemoryThreshold?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  /** 写入 `strategy.contextPolicy.replay.modelName`；Worker `resolveLayerSetting(..., 'replay')` */
  modelName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  /** 与 Admin 模型库一致的 providerCode */
  modelProviderCode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  /** 与 CEO L1/L2/L3 相同的 `keyIds`：所选 chat Key 的 UUID 列表，顺序即尝试优先级 */
  keyIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  /** @deprecated 由 keyIds 取代；读配置时仍可合并为候选 */
  llmKeyId?: string;

  @IsOptional()
  @IsIn(['shared', 'dedicated'])
  keySource?: 'shared' | 'dedicated';
}
