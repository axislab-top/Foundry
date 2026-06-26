import type { CollaborationExecutionContext } from '../context/collaboration-execution-context.js';

/**
 * 保证单条 pipeline 输入上存在 Phase 3.6 共享执行上下文（Memory 去重、节选复用等）。
 * 与 {@link CollaborationPipelineV2RunInput} 对齐；此处用结构类型避免与 types 循环依赖。
 */
export function ensureCollaborationExecutionContext(
  input: { collaborationExecutionContext?: CollaborationExecutionContext },
  traceId: string,
): void {
  if (!input.collaborationExecutionContext) {
    input.collaborationExecutionContext = {
      traceId,
      memoryHits: [],
      retrievedAt: new Date(),
    };
  }
}
