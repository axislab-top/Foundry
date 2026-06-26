/** 直连回复落库时的房间类型（用于场景化 token / 流式策略）。 */
export type DirectReplyRoomType = 'main' | 'department';

/**
 * 直连模型生成结果（用户可见正文已做「完整或明示」处理，禁止静默截断）。
 */
export type DirectCollabGeneratedReply = {
  text: string;
  finishReason?: string | null;
  /** 模型因 max_output_tokens 触顶且续写后仍未完整 */
  truncatedByLength: boolean;
  /** 触顶后自动续写轮次（不含首轮） */
  continuationRounds: number;
  /** 极少数情况下触及系统硬上限并已追加用户可见说明 */
  extremeCapApplied: boolean;
  originalCharLength: number;
  /** 已通过 model.stream() 实时推送 stream_chunk */
  tokenStreamed?: boolean;
};

/** 写入 appendAgent metadata 的生成观测（供 UI / 排障）。 */
export type DirectReplyGenerationMetadata = {
  finishReason?: string | null;
  truncatedByLength: boolean;
  continuationRounds: number;
  extremeCapApplied: boolean;
  originalCharLength: number;
  streamed: boolean;
};
