import type { BoundToolDefinition, SkillToolSnapshot } from '@contracts/events';
import type { McpToolDefinition, McpToolRegistration } from '@foundry/contracts/types/mcp.protocol';
import {
  legacySkillFunctionDescription,
  skillCatalogDescription,
} from './skill-progressive-disclosure.js';

export type BuiltinHandler = (
  args: Record<string, unknown>,
  ctx: SkillExecutionContext,
) => Promise<unknown>;

export interface SkillExecutionContext {
  companyId: string;
  agentId: string;
  traceId?: string;
  /** Future: agent / user roles for permission checks */
  roles?: string[];
}

export interface OpenAiFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface BuiltinToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown> | null;
  jsonSchema?: Record<string, unknown> | null;
  builtinHandler?: string | null;
  requiredPermissions?: string[];
}

/**
 * In-memory registry:
 * - Bound Skills (snapshots) per agent
 * - Builtin handlers for skill execution
 * - Bound MCP tools per agent (and optional CEO layer)
 */
export class ToolRegistry {
  private readonly builtins = new Map<string, BuiltinHandler>();
  private readonly agentTools = new Map<string, SkillToolSnapshot[]>();
  private dynamicSkillLoader?: (params: { companyId: string; agentId: string }) => Promise<SkillToolSnapshot[]>;
  private dynamicSkillCache = new Map<string, { expiresAt: number; skills: SkillToolSnapshot[] }>();
  private dynamicSkillTtlMs = 60_000;
  /**
   * MCP tool bindings are isolated by key:
   * - normal agent: `${companyId}:${agentId}`
   * - CEO layer: `${companyId}:${agentId}:${layer}`
   */
  private readonly agentMcpTools = new Map<string, McpToolDefinition[]>();
  /** P0-Phase5: optional governance attached to MCP bindings (per agent/layer). */
  private readonly agentMcpGovernance = new Map<string, Record<string, unknown>>();
  private dynamicMcpLoader?: (params: {
    companyId: string;
    agentId: string;
    layer?: string;
  }) => Promise<McpToolDefinition[]>;
  private dynamicMcpCache = new Map<string, { expiresAt: number; tools: McpToolDefinition[] }>();
  private dynamicMcpTtlMs = 60_000;

  private key(companyId: string, agentId: string): string {
    return `${companyId}:${agentId}`;
  }

  private mcpKey(companyId: string, agentId: string, layer?: string | null): string {
    const L = typeof layer === 'string' ? layer.trim() : '';
    return L ? `${companyId}:${agentId}:${L}` : `${companyId}:${agentId}`;
  }

  configureDynamicSkillLoader(
    loader: (params: { companyId: string; agentId: string }) => Promise<SkillToolSnapshot[]>,
    options?: { ttlMs?: number },
  ): void {
    this.dynamicSkillLoader = loader;
    this.dynamicSkillTtlMs =
      typeof options?.ttlMs === 'number' && options.ttlMs > 0 ? Math.floor(options.ttlMs) : 60_000;
  }

  invalidateDynamicSkillCache(companyId?: string, agentId?: string): void {
    const c = String(companyId ?? '').trim();
    const a = String(agentId ?? '').trim();
    if (!c && !a) {
      this.dynamicSkillCache.clear();
      return;
    }
    const prefix = a ? `${c}:${a}` : `${c}:`;
    for (const key of this.dynamicSkillCache.keys()) {
      if (key.startsWith(prefix)) this.dynamicSkillCache.delete(key);
    }
  }

  configureDynamicMcpLoader(
    loader: (params: { companyId: string; agentId: string; layer?: string }) => Promise<McpToolDefinition[]>,
    options?: { ttlMs?: number },
  ): void {
    this.dynamicMcpLoader = loader;
    this.dynamicMcpTtlMs =
      typeof options?.ttlMs === 'number' && options.ttlMs > 0 ? Math.floor(options.ttlMs) : 60_000;
  }

  invalidateDynamicMcpCache(companyId?: string, agentId?: string, layer?: string): void {
    const c = String(companyId ?? '').trim();
    const a = String(agentId ?? '').trim();
    const l = String(layer ?? '').trim();
    if (!c && !a && !l) {
      this.dynamicMcpCache.clear();
      return;
    }
    const prefix = l ? `${c}:${a}:${l}` : a ? `${c}:${a}` : `${c}:`;
    for (const key of this.dynamicMcpCache.keys()) {
      if (key.startsWith(prefix)) this.dynamicMcpCache.delete(key);
    }
  }

  /**
   * Determine whether a tool name should be treated as an MCP tool call.
   *
   * This helper is intentionally conservative:
   * - Any name starting with `mcp.` is considered MCP.
   * - Callers must still use `assertMcpToolBound(...)` before execution to prevent prompt injection.
   *
   * @param toolName Tool name from planner / function call
   */
  isMcpTool(toolName: string): boolean {
    const n = String(toolName ?? '').trim();
    return n.startsWith('mcp.');
  }

  registerBuiltin(name: string, handler: BuiltinHandler): void {
    this.builtins.set(name, handler);
  }

  private getBuiltinTools(snap: SkillToolSnapshot): BuiltinToolDefinition[] {
    const hc = (snap.handlerConfig ?? null) as Record<string, unknown> | null;
    const arr = hc && typeof hc === 'object' && !Array.isArray(hc) ? (hc as any).builtinTools : null;
    if (!Array.isArray(arr)) return [];
    const out: BuiltinToolDefinition[] = [];
    const seen = new Set<string>();
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const name = typeof (raw as any).name === 'string' ? String((raw as any).name).trim() : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const reqPerms = Array.isArray((raw as any).requiredPermissions)
        ? ((raw as any).requiredPermissions as unknown[])
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
        : [];
      out.push({
        ...(raw as BuiltinToolDefinition),
        name,
        requiredPermissions: reqPerms,
      });
    }
    return out;
  }

  private resolveBoundSkillByToolName(
    snapshots: SkillToolSnapshot[],
    toolName: string,
  ): { skill: SkillToolSnapshot; builtinTool?: BuiltinToolDefinition } | null {
    const n = String(toolName ?? '').trim();
    if (!n) return null;
    const direct = snapshots.find((x) => x.name === n);
    if (direct) return { skill: direct };
    for (const snap of snapshots) {
      if (String(snap.implementationType ?? '').trim() !== 'builtin') continue;
      const tools = this.getBuiltinTools(snap);
      const hit = tools.find((t) => t.name === n);
      if (hit) return { skill: snap, builtinTool: hit };
    }
    return null;
  }

  setAgentTools(companyId: string, agentId: string, snapshots: SkillToolSnapshot[]): void {
    this.agentTools.set(this.key(companyId, agentId), snapshots);
    this.invalidateDynamicSkillCache(companyId, agentId);
  }

  clearAgentTools(companyId: string, agentId: string): void {
    this.agentTools.delete(this.key(companyId, agentId));
    this.invalidateDynamicSkillCache(companyId, agentId);
  }

  /**
   * Register MCP tools for a specific agent (and optional CEO layer).
   *
   * This is the runtime binding entrypoint for P9 (Agent-exclusive MCP tool isolation).
   * - Visibility: only tools registered for `(companyId, agentId, layer?)` should be exposed to planners.
   * - Execution: calls must hard-fail if the tool isn't bound to the same key.
   *
   * Notes:
   * - This method is intentionally "in-memory only". Persistence is handled by API/template layers.
   * - Schema validation is best-effort and lightweight (no new deps). Full vLLM-style schema
   *   validation can be wired later.
   */
  /**
   * P9（调整版）要求：
   * - 提供 `registerMcpTools(agentId, tools)` 便于商城后台直接调用（per-agent）。
   * - 同时保留原先 `registerMcpTools(registration)` 形态（支持 company/layer/securityProfile 等）。
   *
   * 注意：
   * - 本方法只做“运行时绑定”（内存）；持久化由 API/模板层负责。
   */
  async registerMcpTools(registration: McpToolRegistration): Promise<void>;
  async registerMcpTools(agentId: string, tools: McpToolDefinition[], options: {
    companyId: string;
    layer?: string | null;
    securityProfile?: string | null;
    source?: string | null;
  }): Promise<void>;
  async registerMcpTools(
    a: McpToolRegistration | string,
    b?: McpToolDefinition[],
    c?: {
      companyId: string;
      layer?: string | null;
      securityProfile?: string | null;
      source?: string | null;
    },
  ): Promise<void> {
    const registration: McpToolRegistration =
      typeof a === 'string'
        ? {
            protocol: 'MCP-v1',
            companyId: String(c?.companyId ?? '').trim(),
            agentId: String(a).trim(),
            layer: typeof c?.layer === 'string' ? c.layer : null,
            tools: Array.isArray(b) ? b : [],
            securityProfile: typeof c?.securityProfile === 'string' && c.securityProfile.trim()
              ? c.securityProfile.trim()
              : 'safe',
            source: c?.source ?? 'runtime_register_mcp_tools_shortform',
            registeredAt: new Date().toISOString(),
          }
        : (a as McpToolRegistration);

    if (!registration || typeof registration !== 'object') {
      throw new Error('MCP_REGISTRATION_INVALID: registration must be an object');
    }
    if (registration.protocol !== 'MCP-v1') {
      throw new Error(
        `MCP_REGISTRATION_INVALID: unsupported protocol "${String((registration as any).protocol)}"`,
      );
    }
    const companyId = String(registration.companyId ?? '').trim();
    const agentId = String(registration.agentId ?? '').trim();
    const layer = typeof registration.layer === 'string' ? registration.layer.trim() : '';
    if (!companyId) {
      throw new Error('MCP_REGISTRATION_INVALID: companyId is required');
    }
    if (!agentId) {
      throw new Error('MCP_REGISTRATION_INVALID: agentId is required');
    }

    const toolsRaw = Array.isArray(registration.tools) ? registration.tools : [];
    const normalized: McpToolDefinition[] = [];
    const seen = new Set<string>();
    for (const t of toolsRaw) {
      if (!t || typeof t !== 'object') continue;
      const name = typeof (t as any).name === 'string' ? (t as any).name.trim() : '';
      if (!name) continue;
      if (seen.has(name)) {
        throw new Error(`MCP_REGISTRATION_INVALID: duplicate tool name "${name}"`);
      }
      seen.add(name);
      const description =
        typeof (t as any).description === 'string' && (t as any).description.trim()
          ? (t as any).description.trim()
          : name;
      /**
       * 兼容字段：
       * - inputSchema：当前 Foundry 内部约定
       * - jsonSchema：P9 调整版 prompt 中的字段名（同义）
       */
      const inputSchema = ((t as any).inputSchema ?? (t as any).jsonSchema) as
        | Record<string, unknown>
        | null
        | undefined;
      const schemaOk = !!inputSchema && typeof inputSchema === 'object' && !Array.isArray(inputSchema);
      if (!schemaOk) {
        throw new Error(`MCP_REGISTRATION_INVALID: tool "${name}" missing valid inputSchema object`);
      }
      // vLLM-style schema pre-validation (best-effort):
      // - should be JSON-object schema (type=object recommended)
      // - properties should be an object when present
      // - additionalProperties may be boolean/object
      // Full JSON Schema validation intentionally deferred (no new deps).
      const props = (inputSchema as any).properties;
      if (props !== undefined && (typeof props !== 'object' || props === null || Array.isArray(props))) {
        throw new Error(
          `MCP_REGISTRATION_INVALID: tool "${name}" inputSchema.properties must be an object when provided`,
        );
      }
      normalized.push({
        ...(t as McpToolDefinition),
        name,
        description,
        inputSchema: inputSchema as any,
      });
    }

    const key = this.mcpKey(companyId, agentId, layer);
    this.agentMcpTools.set(key, normalized);
    // P0-Phase5: allow callers to attach governance config (best-effort; optional)
    const gov = (registration as any).governance;
    if (gov && typeof gov === 'object' && !Array.isArray(gov)) {
      this.agentMcpGovernance.set(key, { ...(gov as Record<string, unknown>) });
    } else {
      this.agentMcpGovernance.delete(key);
    }
    await this.emitMcpToolsChangedEvent({
      companyId,
      agentId,
      layer: layer || null,
      tools: normalized,
      securityProfile: String(registration.securityProfile ?? '').trim(),
    });
  }

  getMcpGovernance(companyId: string, agentId: string, layer?: string): Record<string, unknown> | null {
    const key = this.mcpKey(companyId, agentId, layer);
    return this.agentMcpGovernance.get(key) ?? null;
  }

  /**
   * Get MCP tools bound to an agent.
   *
   * - Normal agent: call with no layer.
   * - CEO: pass `layer` to get layer-scoped tools.
   */
  getMcpTools(companyId: string, agentId: string, layer?: string): McpToolDefinition[] {
    return this.agentMcpTools.get(this.mcpKey(companyId, agentId, layer)) ?? [];
  }

  async getMcpToolsDynamic(companyId: string, agentId: string, layer?: string): Promise<McpToolDefinition[]> {
    const key = this.mcpKey(companyId, agentId, layer);
    const bound = this.agentMcpTools.get(key);
    if (bound && bound.length) return bound;
    if (!this.dynamicMcpLoader) return [];
    const cached = this.dynamicMcpCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.tools;
    const loaded = await this.dynamicMcpLoader({ companyId, agentId, layer });
    const tools = Array.isArray(loaded) ? loaded : [];
    this.dynamicMcpCache.set(key, { expiresAt: now + this.dynamicMcpTtlMs, tools });
    return tools;
  }

  /**
   * Hard guard: ensure an MCP tool is bound to the agent (and optional CEO layer).
   *
   * This must be used on execution entrypoints so that unbound tools cannot be invoked
   * even if the LLM fabricates a tool name.
   */
  assertMcpToolBound(companyId: string, agentId: string, toolName: string, layer?: string): void {
    const name = String(toolName ?? '').trim();
    if (!name) {
      throw new Error('MCP_TOOL_CALL_INVALID: toolName is required');
    }
    const bound = this.getMcpTools(companyId, agentId, layer);
    if (!bound.some((t) => t.name === name)) {
      const scope = layer && layer.trim() ? `companyId=${companyId}, agentId=${agentId}, layer=${layer}` : `companyId=${companyId}, agentId=${agentId}`;
      throw new Error(`MCP_TOOL_NOT_BOUND: tool "${name}" is not bound to this scope (${scope})`);
    }
  }

  async assertMcpToolBoundAsync(
    companyId: string,
    agentId: string,
    toolName: string,
    layer?: string,
  ): Promise<void> {
    const name = String(toolName ?? '').trim();
    if (!name) {
      throw new Error('MCP_TOOL_CALL_INVALID: toolName is required');
    }
    const bound = await this.getMcpToolsDynamic(companyId, agentId, layer);
    if (!bound.some((t) => t.name === name)) {
      const scope =
        layer && layer.trim()
          ? `companyId=${companyId}, agentId=${agentId}, layer=${layer}`
          : `companyId=${companyId}, agentId=${agentId}`;
      throw new Error(`MCP_TOOL_NOT_BOUND: tool "${name}" is not bound to this scope (${scope})`);
    }
  }

  /**
   * Convert MCP tools into OpenAI/vLLM function tool format.
   *
   * The returned list can be injected into planners to expose tool visibility.
   */
  mcpToolsToOpenAiFunctions(tools: McpToolDefinition[]): OpenAiFunctionTool[] {
    const list = Array.isArray(tools) ? tools : [];
    return list.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: String(t.description ?? t.name).slice(0, 4000),
        parameters:
          (t.inputSchema as Record<string, unknown> | null | undefined) ?? {
            type: 'object',
            properties: {},
          },
      },
    }));
  }

  /**
   * Skill 快照与 MCP 绑定可能为同一能力注册两个 OpenAI 函数名（如 `department.knowledge.query` 与
   * `tool.ceo_department_knowledge_query`）。按语义 key 去重，优先保留非 `tool.ceo_` 前缀名。
   */
  dedupeOpenAiFunctionTools(tools: OpenAiFunctionTool[]): {
    tools: OpenAiFunctionTool[];
    duplicateNamesDropped: number;
  } {
    const canonicalKey = (raw: string): string => {
      const n = String(raw ?? '').trim().toLowerCase();
      let k = n;
      if (k.startsWith('tool.ceo_')) {
        k = k.slice('tool.ceo_'.length).replace(/_/g, '.');
      }
      // 公司事实查询：商城快照名与 canonical 点分名对齐，避免误伤为两个工具
      if (k === 'company.facts.query' || k === 'facts.company.query') return 'facts.company.query';
      return k;
    };
    const byKey = new Map<string, OpenAiFunctionTool>();
    let duplicateNamesDropped = 0;
    for (const t of tools) {
      const name = String(t?.function?.name ?? '').trim();
      if (!name) continue;
      const key = canonicalKey(name);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, t);
        continue;
      }
      duplicateNamesDropped += 1;
      const exName = String(existing.function.name);
      const newPlain = !name.startsWith('tool.ceo_');
      const oldPlain = !exName.startsWith('tool.ceo_');
      if (newPlain && !oldPlain) {
        byKey.set(key, t);
      }
    }
    return { tools: [...byKey.values()], duplicateNamesDropped };
  }

  /**
   * Hook for emitting a runtime "mcp tools changed" event.
   *
   * P9-Step1 uses an in-memory registry; later phases can wire this to the existing
   * messaging/event bus or Redis pubsub without changing callsites.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  protected async emitMcpToolsChangedEvent(_payload: {
    companyId: string;
    agentId: string;
    layer: string | null;
    tools: McpToolDefinition[];
    securityProfile: string;
  }): Promise<void> {
    // no-op (reserved)
  }

  getToolSnapshots(companyId: string, agentId: string): SkillToolSnapshot[] {
    return this.agentTools.get(this.key(companyId, agentId)) ?? [];
  }

  async getToolSnapshotsDynamic(companyId: string, agentId: string): Promise<SkillToolSnapshot[]> {
    const key = this.key(companyId, agentId);
    const bound = this.agentTools.get(key);
    if (bound && bound.length) return bound;
    if (!this.dynamicSkillLoader) return [];
    const now = Date.now();
    const cached = this.dynamicSkillCache.get(key);
    if (cached && cached.expiresAt > now) return cached.skills;
    const loaded = await this.dynamicSkillLoader({ companyId, agentId });
    const skills = Array.isArray(loaded) ? loaded : [];
    this.dynamicSkillCache.set(key, { expiresAt: now + this.dynamicSkillTtlMs, skills });
    return skills;
  }

  snapshotsToOpenAiFunctions(
    snapshots: SkillToolSnapshot[],
    options?: { progressiveDisclosure?: boolean },
  ): OpenAiFunctionTool[] {
    const progressive = options?.progressiveDisclosure !== false;
    const out: OpenAiFunctionTool[] = [];
    const seen = new Set<string>();
    for (const s of snapshots) {
      const baseName = String(s.name ?? '').trim();
      if (baseName && !seen.has(baseName)) {
        seen.add(baseName);
        const skillDesc = progressive
          ? skillCatalogDescription(s)
          : legacySkillFunctionDescription(s);
        out.push({
          type: 'function' as const,
          function: {
            name: baseName,
            description: skillDesc.slice(0, 4000),
            parameters:
              (s.toolSchema as Record<string, unknown> | null | undefined) ?? {
                type: 'object',
                properties: {},
              },
          },
        });
      }
      if (String(s.implementationType ?? '').trim() === 'builtin') {
        const builtinTools = this.getBuiltinTools(s);
        for (const t of builtinTools) {
          if (seen.has(t.name)) continue;
          seen.add(t.name);
          out.push({
            type: 'function' as const,
            function: {
              name: t.name,
              description: String(
                t.description ?? (progressive ? skillCatalogDescription(s) : s.description ?? s.promptTemplate) ?? t.name,
              ).slice(0, 4000),
              parameters:
                (t.inputSchema as Record<string, unknown> | null | undefined) ??
                (t.jsonSchema as Record<string, unknown> | null | undefined) ??
                (s.toolSchema as Record<string, unknown> | null | undefined) ?? {
                  type: 'object',
                  properties: {},
                },
            },
          });
        }
      }

      // Plan A: bound Tools (all skill types, including prompt).
      const boundTools = (s as any).boundTools as BoundToolDefinition[] | undefined;
      for (const t of Array.isArray(boundTools) ? boundTools : []) {
        const name = typeof (t as any)?.name === 'string' ? String((t as any).name).trim() : '';
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push({
          type: 'function' as const,
          function: {
            name,
            description: String((t as any).description ?? name).slice(0, 4000),
            parameters:
              ((t as any).inputSchema as Record<string, unknown> | null | undefined) ?? {
                type: 'object',
                properties: {},
              },
          },
        });
      }
    }
    return out;
  }

  assertCanExecute(snap: SkillToolSnapshot, ctx: SkillExecutionContext): void {
    const req = snap.requiredPermissions ?? [];
    if (req.length === 0) return;
    const roles = ctx.roles ?? [];
    if (roles.length === 0) {
      throw new Error(
        `Skill "${snap.name}" requires permissions [${req.join(', ')}]; caller roles not provided`,
      );
    }
    const allowed = req.some((p) => roles.includes(p));
    if (!allowed) {
      throw new Error(
        `Skill "${snap.name}" requires one of [${req.join(', ')}]; missing on caller`,
      );
    }
  }

  async execute(
    companyId: string,
    agentId: string,
    skillName: string,
    args: Record<string, unknown>,
    ctx: SkillExecutionContext,
  ): Promise<unknown> {
    const snapshots = this.getToolSnapshots(companyId, agentId);
    const resolved = this.resolveBoundSkillByToolName(snapshots, skillName);
    if (!resolved) {
      throw new Error(`Skill "${skillName}" is not bound to this agent`);
    }
    const snap = resolved.skill;
    this.assertCanExecute(snap, ctx);
    if (resolved.builtinTool?.requiredPermissions?.length) {
      const req = resolved.builtinTool.requiredPermissions;
      const roles = ctx.roles ?? [];
      if (roles.length === 0 || !req.some((p) => roles.includes(p))) {
        throw new Error(
          `Skill tool "${resolved.builtinTool.name}" requires one of [${req.join(', ')}]; missing on caller`,
        );
      }
    }
    const requested = String(skillName ?? '').trim();
    const handlerName = String(
      resolved.builtinTool?.builtinHandler ?? (requested || snap.name),
    ).trim();
    const handler =
      this.builtins.get(handlerName) ??
      this.builtins.get(requested) ??
      this.builtins.get(snap.name);
    if (!handler) {
      throw new Error(
        `Skill "${skillName}" has no builtin handler; map DB skills to handlers or use a supported builtin`,
      );
    }
    return handler(args, ctx);
  }

  async executeDynamic(
    companyId: string,
    agentId: string,
    skillName: string,
    args: Record<string, unknown>,
    ctx: SkillExecutionContext,
  ): Promise<unknown> {
    const snapshots = await this.getToolSnapshotsDynamic(companyId, agentId);
    const resolved = this.resolveBoundSkillByToolName(snapshots, skillName);
    if (!resolved) {
      throw new Error(`Skill "${skillName}" is not bound to this agent`);
    }
    const snap = resolved.skill;
    this.assertCanExecute(snap, ctx);
    if (resolved.builtinTool?.requiredPermissions?.length) {
      const req = resolved.builtinTool.requiredPermissions;
      const roles = ctx.roles ?? [];
      if (roles.length === 0 || !req.some((p) => roles.includes(p))) {
        throw new Error(
          `Skill tool "${resolved.builtinTool.name}" requires one of [${req.join(', ')}]; missing on caller`,
        );
      }
    }
    const requested = String(skillName ?? '').trim();
    const handlerName = String(
      resolved.builtinTool?.builtinHandler ?? (requested || snap.name),
    ).trim();
    const handler =
      this.builtins.get(handlerName) ??
      this.builtins.get(requested) ??
      this.builtins.get(snap.name);
    if (!handler) {
      throw new Error(
        `Skill "${skillName}" has no builtin handler; map DB skills to handlers or use a supported builtin`,
      );
    }
    return handler(args, ctx);
  }
}
