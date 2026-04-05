import { SetMetadata } from '@nestjs/common';
import { M4_EXECUTION_TOKEN_METADATA } from './m4-execution-token.constants.js';

export interface RequireExecutionTokenOptions {
  /** 与审批通过时签发的 action 一致（可被 body.action 覆盖） */
  action: string;
}

/**
 * 标记 HTTP 处理器：在 Guard 中消费一次性 execution token（AI Agent Gateway 式拦截）。
 */
export const RequireExecutionToken = (opts: RequireExecutionTokenOptions) =>
  SetMetadata(M4_EXECUTION_TOKEN_METADATA, opts);

/** 别名：与产品语言「审批」对齐 */
export const RequireApproval = RequireExecutionToken;
