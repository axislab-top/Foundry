export type OrchestrationDistributeErrorCode =
  | 'empty_strategic_phases'
  | 'llm_assisted_unavailable'
  | 'llm_assisted_hints_invalid'
  | 'tools_enforce_failed'
  | 'distribution_graph_invalid';

/**
 * 编排分发显式失败（不应被 {@link CeoV2OrchestrationService.distribute} 的意外异常降级吞掉）。
 */
export class OrchestrationDistributeError extends Error {
  readonly code: OrchestrationDistributeErrorCode;
  readonly detail?: Record<string, unknown>;

  constructor(code: OrchestrationDistributeErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'OrchestrationDistributeError';
    this.code = code;
    this.detail = detail;
  }
}
