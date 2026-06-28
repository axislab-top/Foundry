import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * supervision / Temporal 执行轨迹片段（与 HeavyExecutionTraceEntry 对齐，便于前端时间轴）。
 */
export class HeavyExecutionTraceEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

/** Worker 主群 goal lock：部门分工草案一行（appendAgent metadata 白名单）。 */
export class CeoV2DistributionDraftRowDto {
  @IsString()
  @MaxLength(64)
  department!: string;

  @IsString()
  @MaxLength(8)
  priority!: string;

  @IsString()
  @MaxLength(500)
  deliverable!: string;
}

export class CeoV2DistributionDraftDto {
  @IsString()
  @IsIn(['1.0'])
  schemaVersion!: string;

  @IsString()
  @MaxLength(128)
  distributionId!: string;

  @IsString()
  @MaxLength(128)
  planId!: string;

  @IsBoolean()
  pendingDepartmentDispatchConfirm!: boolean;

  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => CeoV2DistributionDraftRowDto)
  rows!: CeoV2DistributionDraftRowDto[];
}

/**
 * collaboration.messages.appendAgent 的 metadata 契约（2026 主群 / 部门群统一）。
 * RPC 使用 whitelist：仅声明字段会保留；新增 Worker 字段时请在此补充可选字段。
 */
export class CollaborationAppendAgentMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  /** 与 stream_chunk  provisional 一致；最终文本通常为 false */
  @IsOptional()
  @IsBoolean()
  provisional?: boolean;

  /** 主群链路路由（IntentRoutePath + 2026 扩展） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  routePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  intentType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  traceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  workflowId?: string;

  @IsOptional()
  @IsIn(['sync', 'async'])
  executionMode?: 'sync' | 'async';

  /** strategy / planning 摘要（UI 进度卡） */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  planningSummary?: string;

  /** orchestration 分发任务数量 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  distributionCount?: number;

  /** supervision 最终摘要 */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  finalSummary?: string;

  /**
   * supervision 执行轨迹（条目标签展示 / 调试）。
   * 条数与总序列化长度在 service 层再次加固。
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => HeavyExecutionTraceEntryDto)
  heavyExecutionTrace?: HeavyExecutionTraceEntryDto[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  directReplyToMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  approvalRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  approvalStatus?: string;

  /** 部门主管直回等 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  routingMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  roomType?: string;

  /** 流式块关联 ID（realtime message:chunk） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  streamId?: string;

  /** 显式传入的 mention（多数场景由服务端从正文解析合并） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('4', { each: true })
  mentionedAgentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('4', { each: true })
  mentionedNodeIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mentionResolvedFrom?: string;

  @IsOptional()
  @IsNumber()
  mentionResolveConfidence?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  mentionLabels?: string[];

  /** 与 `CollaborationPipelineV2RunResult.output.payload.fastReplySource` 对齐 */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fastReplySource?: string;

  /** 编排部门分工草案（goal lock 延迟下发时由 Worker 写入） */
  @IsOptional()
  @ValidateNested()
  @Type(() => CeoV2DistributionDraftDto)
  distributionDraft?: CeoV2DistributionDraftDto;

  /**
   * `DirectCollabReplyService` / CEO v2 完整结构化输出（含 `metadata.richCard` 与快捷按钮）。
   * 必须在白名单中保留，否则前端只能看到纯文本、无法渲染战略目标卡片与定稿按钮。
   */
  @IsOptional()
  @IsObject()
  lightStructuredOutputV2?: Record<string, unknown>;

  /** Phase 4：部门下发 / 员工交付等顶层富卡片（与 system 消息 richCard 同形）。 */
  @IsOptional()
  @IsObject()
  richCard?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nextStep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  commitmentText?: string;

  /** Intent 决策快照（审计 / 回放；体积由 persist 层加固） */
  @IsOptional()
  @IsObject()
  intentDecision2026_1?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  heartbeatCorrelation?: Record<string, unknown>;
}
