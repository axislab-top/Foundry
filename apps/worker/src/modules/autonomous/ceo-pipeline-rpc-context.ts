/**
 * CEO LangGraph 单次 invoke 的 RPC 队列选择（协作 @CEO → interactive，其余 → autonomous）。
 * 不用 AsyncLocalStorage：LangGraph 节点可能在未继承 ALS 的上下文中执行。
 */
export type CeoPipelineRpcTier = 'default' | 'interactive';

const tierByTrace = new Map<string, CeoPipelineRpcTier>();

export function beginCeoPipelineRpc(traceId: string, tier: CeoPipelineRpcTier): void {
  tierByTrace.set(traceId, tier);
}

export function endCeoPipelineRpc(traceId: string): void {
  tierByTrace.delete(traceId);
}

export function resolveCeoPipelineRpcTier(traceId: string): CeoPipelineRpcTier {
  return tierByTrace.get(traceId) ?? 'default';
}
