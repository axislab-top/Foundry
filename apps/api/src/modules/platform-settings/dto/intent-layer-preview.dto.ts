import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

/**
 * 与 Worker `POST /internal/collaboration/intent-preview` 入参对齐（房间成员由 Worker 按 roomId 构建）。
 * `text` 与可选 `contentText` 二选一语义由服务层归一为 contentText。
 */
export class IntentLayerPreviewDto {
  @IsString()
  text!: string;

  /** 可选；若提供则与 `text` 合并时优先采用（与 Worker 字段名对齐） */
  @IsOptional()
  @IsString()
  contentText?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mentionedAgentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mentionedNodeIds?: string[];

  @IsOptional()
  @IsString()
  ceoAgentId?: string;

  @IsOptional()
  @IsString()
  messageCategory?: string;
}
