/**
 * Axis DevForge — MCP-v1 protocol contracts (Sprint 2 / P9)
 *
 * This file defines the minimal, strongly-typed MCP surface used by Foundry:
 * - Tool definitions (OpenAI / vLLM function-calling compatible)
 * - Per-agent (and optional per-layer) tool registrations
 * - Tool call envelope for execution routing
 *
 * Design goals:
 * - No runtime dependencies (types only).
 * - JSON-schema-first tool definitions, aligned with `SkillToolSnapshot.toolSchema`.
 * - Supports per-agent isolation and CEO per-layer isolation (`layer` dimension).
 */

/**
 * A minimal JSON Schema type used for tool input/output shapes.
 *
 * Notes:
 * - vLLM and OpenAI tool calling accept JSON-schema-like `parameters`.
 * - We keep this type permissive but still "object-shaped" to prevent accidental primitives.
 */
export type JsonSchemaObject = Record<string, unknown> & { type?: 'object' | string };

/**
 * Security profile for tool execution. This mirrors the security profile vocabulary used by Runner.
 * Keep it open-ended to avoid hard-coding policy enums in contracts.
 */
export type McpSecurityProfile = string;

/**
 * Optional execution transport hints for MCP tools.
 *
 * For P9 (minimal intrusion), Worker can map MCP tools onto existing Runner HTTP sandbox execution.
 * This contract intentionally does not prescribe a specific transport; it provides common fields.
 */
export type McpToolTransport =
  | {
      kind: 'http';
      /** Absolute URL of the MCP tool endpoint. */
      url: string;
      /** Default POST when omitted. */
      method?: 'POST' | 'GET';
      /**
       * Optional static headers. Dynamic auth should be handled by key vault / runner side later.
       * Keep as plain strings for now.
       */
      headers?: Record<string, string>;
      /** Optional request timeout budget for the tool call. */
      timeoutMs?: number;
    }
  | {
      kind: 'stub';
      /** Human-readable hint for non-executable tools (dev / test only). */
      note?: string;
    };

/**
 * MCP Tool definition (OpenAI / vLLM function calling compatible).
 *
 * Tool visibility and callability are enforced by runtime binding:
 * - A tool must be registered to an agent (and optionally a CEO layer) to be visible.
 * - Execution must hard-fail if a tool is called but not bound.
 */
export interface McpToolDefinition {
  /**
   * Stable tool name. Must be unique within a registration scope.
   * Recommended convention: `mcp.<domain>.<action>` (e.g. `mcp.github.issue_create`).
   */
  name: string;

  /** Human-readable description, used in tool prompts and UI. */
  description: string;

  /**
   * JSON schema for tool input parameters.
   * This maps 1:1 to OpenAI function-calling `parameters`.
   */
  inputSchema: JsonSchemaObject;

  /**
   * P9（调整版）字段别名：jsonSchema（与 inputSchema 同义）。
   * - 为保持兼容，运行时应优先使用 inputSchema；缺省时可回退到 jsonSchema。
   */
  jsonSchema?: JsonSchemaObject;

  /**
   * Optional output schema (reserved). Not required for OpenAI function calling,
   * but useful for validation and UI rendering.
   */
  outputSchema?: JsonSchemaObject | null;

  /**
   * Optional transport hint. For P9 we primarily support HTTP via Runner sandbox.
   */
  transport?: McpToolTransport | null;

  /**
   * P9（调整版）字段别名：mcpEndpoint。
   * - 用于 UI 侧快速配置“HTTP MCP endpoint”；运行时建议映射到 transport.kind='http'。
   */
  mcpEndpoint?: McpToolTransport | null;

  /**
   * Optional, tool-scoped security profile override.
   * If omitted, the registration-level `securityProfile` is used.
   */
  securityProfile?: McpSecurityProfile | null;

  /** Free-form metadata for auditing / UI. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Per-agent (and optional per-layer) MCP tool registration.
 *
 * - Normal agents: key space is `(companyId, agentId)`.
 * - CEO: tools can be scoped per layer via `layer` (classifier/light/heavy).
 */
export interface McpToolRegistration {
  /** Protocol version marker for forward compatibility. */
  protocol: 'MCP-v1';

  /** Tenant/company id. */
  companyId: string;

  /** Target agent id that owns these tools. */
  agentId: string;

  /**
   * Optional layer identifier (CEO).
   * When present, tools are isolated to that layer only.
   */
  layer?: string | null;

  /** Tool definitions bound to this agent (and optional layer). */
  tools: McpToolDefinition[];

  /**
   * Default security profile for this registration scope.
   * Runtime should enforce this via existing Runner / policy pipeline.
   */
  securityProfile: McpSecurityProfile;

  /** Optional source for audit/debug (e.g. 'marketplace_template', 'company_override'). */
  source?: string | null;

  /** ISO timestamp for observability (optional). */
  registeredAt?: string | null;
}

/**
 * MCP Tool call envelope for execution routing.
 *
 * This mirrors OpenAI/vLLM function calling shape but adds tenant/agent scoping.
 * The runtime must verify that `toolName` is bound to `(companyId, agentId, layer?)`.
 */
export interface McpToolCall {
  companyId: string;
  agentId: string;
  layer?: string | null;

  /** Unique call identifier (for tracing / runner job correlation). */
  toolCallId: string;

  /** Tool name, must match a bound `McpToolDefinition.name`. */
  toolName: string;

  /** Tool arguments. Must satisfy `McpToolDefinition.inputSchema`. */
  arguments: Record<string, unknown>;

  /** Optional trace id, propagated to Runner / logs. */
  traceId?: string | null;
}

