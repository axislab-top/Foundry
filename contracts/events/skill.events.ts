import type { BaseEvent } from './base-event.js';

/** 与 `@foundry/contracts/types/mcp.protocol` 对齐的最小引用（避免 events 包依赖错误相对路径）。 */
export type SkillEventMcpToolRef = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
};

export interface BoundToolDefinition {
  /** Always in `tool.<name>` form */
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  securityProfile?: string | null;
  requiredPermissions?: string[];
  handlerConfig?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Serialized skill row for workers / LangGraph without DB round-trips */
export interface SkillToolSnapshot {
  id: string;
  name: string;
  description: string | null;
  toolSchema: Record<string, unknown> | null;
  promptTemplate: string | null;
  implementationType: string;
  handlerConfig: Record<string, unknown> | null;
  requiredPermissions: string[];
  version: number;
  /** P20：语义版本（字符串），与 `version`（int 修订）并存 */
  semverVersion?: string;
  isPublic: boolean;
  isSystem: boolean;

  /** P0 Skill Governance Fields - 2026 (optional for backward compatibility) */
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  maxInputSizeBytes?: number | null;
  timeoutSeconds?: number | null;
  chunkStrategy?: 'none' | 'fixed' | 'semantic' | string | null;
  category?: string[] | null;
  icon?: string | null;

  /**
   * Plan A: MCP tools are first-class resources bound to a Skill via DB bindings.
   * This is the runtime-ready definition list (names should already be in `mcp.<tool>` form).
   */
  boundMcpTools?: SkillEventMcpToolRef[];

  /**
   * Plan A: tools are first-class resources bound to a Skill via DB bindings.
   * This is the runtime-ready definition list (names should already be in `tool.<tool>` form).
   */
  boundTools?: BoundToolDefinition[];
}

export interface SkillExecutedEvent extends BaseEvent {
  eventType: 'skill.executed';
  aggregateType: 'skill';
  data: {
    companyId: string;
    agentId: string;
    skillId: string | null;
    skillName: string;
    traceId?: string;
    argsSummary: Record<string, unknown> | null;
    resultSummary: Record<string, unknown> | null;
    durationMs: number | null;
    billingUnits: number | null;
    executedAt: string;
  };
}

export type SkillEvent = SkillExecutedEvent;
