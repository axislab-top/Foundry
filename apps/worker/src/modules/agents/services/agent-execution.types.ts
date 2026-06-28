export type PromptSkillMode = 'auto' | 'expand_only' | 'complete';

export interface ExecuteSkillParams {
  companyId: string;
  agentId: string;
  /** Required for temporary agents; used for project isolation */
  projectId?: string | null;
  /**
   * CEO 三层：当调用来自 Layer graph 时，必须带上 layer 以实现 per-layer MCP 隔离。
   * 普通 Agent 为空即可。
   */
  layer?: string | null;
  skillName: string;
  args: Record<string, unknown>;
  traceId?: string;
  skillId?: string | null;
  /** Caller capability / role keys; required when skill.requiredPermissions is non-empty */
  roles?: string[];
  /** M4：高风险 Skill（metadata.approvalRiskLevel L2/L3）须携带一次性执行令牌 */
  executionTokenId?: string;
  /** P12：与 Runner / 执行日志共享的 `foundry.skill_execution_id（省略则由 Runner 生成） */
  skillExecutionId?: string;
  /** 渐进披露：为 true 时跳过展开，强制执行 builtin/external */
  forceExecute?: boolean;
  /**
   * - auto / expand_only：有 promptTemplate 时返回 skill_instructions
   * - complete：展开后走 LLM 完成（单轮路径）
   */
  promptSkillMode?: PromptSkillMode;
  /**
   * CEO layer 等场景：MCP 仅允许来自这些 Skill 快照上的 `boundMcpTools`（与 `buildEffectiveOpenAiTools` 一致）。
   */
  capabilitySkillIds?: string[];
}
