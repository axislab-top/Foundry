import type { SkillToolSnapshot } from '@contracts/events';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';

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

/**
 * In-memory registry: bound skills per agent + builtin handlers for execution.
 */
export class ToolRegistry {
  private readonly builtins = new Map<string, BuiltinHandler>();
  private readonly agentTools = new Map<string, SkillToolSnapshot[]>();

  private key(companyId: string, agentId: string): string {
    return `${companyId}:${agentId}`;
  }

  registerBuiltin(name: string, handler: BuiltinHandler): void {
    this.builtins.set(name, handler);
  }

  setAgentTools(companyId: string, agentId: string, snapshots: SkillToolSnapshot[]): void {
    this.agentTools.set(this.key(companyId, agentId), snapshots);
  }

  clearAgentTools(companyId: string, agentId: string): void {
    this.agentTools.delete(this.key(companyId, agentId));
  }

  getToolSnapshots(companyId: string, agentId: string): SkillToolSnapshot[] {
    return this.agentTools.get(this.key(companyId, agentId)) ?? [];
  }

  snapshotsToOpenAiFunctions(
    snapshots: SkillToolSnapshot[],
    options?: { progressiveDisclosure?: boolean },
  ): OpenAiFunctionTool[] {
    return snapshots.map((s) => ({
      type: 'function' as const,
      function: {
        name: s.name,
        description: (s.description ?? s.promptTemplate ?? s.name).slice(0, 4000),
        parameters:
          (s.toolSchema as Record<string, unknown> | null | undefined) ?? {
            type: 'object',
            properties: {},
          },
      },
    }));
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
    const snap = snapshots.find((x) => x.name === skillName);
    if (!snap) {
      throw new Error(`Skill "${skillName}" is not bound to this agent`);
    }
    this.assertCanExecute(snap, ctx);
    const handler = this.builtins.get(skillName);
    if (!handler) {
      throw new Error(
        `Skill "${skillName}" has no builtin handler; map DB skills to handlers or use a supported builtin`,
      );
    }
    return handler(args, ctx);
  }

  /**
   * Convert MCP tools into OpenAI/vLLM function tool format.
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
   * Deduplicate OpenAI function tools by semantic key.
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
}
