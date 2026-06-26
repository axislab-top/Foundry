import type { SkillToolSnapshot } from '@contracts/events';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';
import type { OpenAiFunctionTool } from './tool-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import { toSkillCatalogEntry, type SkillCatalogEntry } from './skill-progressive-disclosure.js';
import { filterSnapshotsByToolsets } from './toolsets.js';

const MAX_BOUND_MCP_TOOLS = 50;

export function filterSnapshotsBySkillIds(
  snapshots: SkillToolSnapshot[],
  configuredSkillIds: string[],
): SkillToolSnapshot[] {
  const ids = new Set(
    (Array.isArray(configuredSkillIds) ? configuredSkillIds : [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean),
  );
  if (!ids.size) return [];
  return (Array.isArray(snapshots) ? snapshots : []).filter((s) =>
    ids.has(String(s.id ?? '').trim()),
  );
}

/**
 * Union of MCP tools bound on the given skill snapshots (Plan A: skill_mcp_tool_bindings).
 * Does not include agent-wide MCP registry entries.
 */
export function collectBoundMcpToolsFromSnapshots(
  snapshots: SkillToolSnapshot[],
): McpToolDefinition[] {
  const seen = new Set<string>();
  const out: McpToolDefinition[] = [];
  for (const snap of Array.isArray(snapshots) ? snapshots : []) {
    const list = (snap as { boundMcpTools?: Array<Record<string, unknown>> }).boundMcpTools;
    for (const raw of Array.isArray(list) ? list : []) {
      const name = typeof raw?.name === 'string' ? String(raw.name).trim() : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const inputSchema =
        (raw.inputSchema as Record<string, unknown> | undefined) ??
        (raw.jsonSchema as Record<string, unknown> | undefined) ?? {
          type: 'object',
          properties: {},
        };
      out.push({
        name,
        description: String(raw.description ?? name),
        inputSchema,
        jsonSchema: inputSchema,
        metadata: (raw.metadata as Record<string, unknown> | null | undefined) ?? null,
      });
      if (out.length >= MAX_BOUND_MCP_TOOLS) return out;
    }
  }
  return out;
}

export function buildSkillCatalog(snapshots: SkillToolSnapshot[]): SkillCatalogEntry[] {
  return (Array.isArray(snapshots) ? snapshots : []).map((s) => toSkillCatalogEntry(s));
}

export type BuildEffectiveOpenAiToolsParams = {
  snapshots: SkillToolSnapshot[];
  /** When set, filters snapshots before building tools. */
  configuredSkillIds?: string[];
  /** Company-enabled toolsets; non-empty restricts skills via metadata.requiresToolsets. */
  enabledToolsets?: string[];
  progressiveDisclosure?: boolean;
  /** If set, only tools whose function name is in this set are returned (after dedupe). */
  retainToolNames?: Set<string>;
  /**
   * When merged tool count exceeds threshold, collapse to skill catalog functions only
   * (progressive disclosure L0) plus optional `foundry.tool_catalog` meta tool.
   */
  toolSearch?: { enabled: boolean; threshold: number };
};

export type BuildEffectiveOpenAiToolsResult = {
  tools: OpenAiFunctionTool[];
  skillCatalog: SkillCatalogEntry[];
  injectedToolNames: string[];
  dedupeDroppedCount: number;
  boundMcpToolNames: string[];
};

/**
 * Build the LLM-visible OpenAI function list from skill snapshots only:
 * - skill-level functions + bound Tools (via snapshotsToOpenAiFunctions)
 * - MCP only from snapshot.boundMcpTools (not agent-wide getMcpToolsDynamic)
 */
export function buildEffectiveOpenAiTools(
  registry: ToolRegistry,
  params: BuildEffectiveOpenAiToolsParams,
): BuildEffectiveOpenAiToolsResult {
  const configuredIds = params.configuredSkillIds;
  let filtered =
    configuredIds && configuredIds.length
      ? filterSnapshotsBySkillIds(params.snapshots, configuredIds)
      : Array.isArray(params.snapshots)
        ? params.snapshots
        : [];

  const enabledToolsets = params.enabledToolsets ?? [];
  if (enabledToolsets.length) {
    filtered = filterSnapshotsByToolsets(filtered, enabledToolsets);
  }

  const skillCatalog = buildSkillCatalog(filtered);
  const progressive = params.progressiveDisclosure !== false;

  const fromSkills = registry.snapshotsToOpenAiFunctions(filtered, {
    progressiveDisclosure: progressive,
  });

  const boundMcp = collectBoundMcpToolsFromSnapshots(filtered);
  const boundMcpToolNames = boundMcp.map((t) => t.name);
  const fromMcp = registry.mcpToolsToOpenAiFunctions(boundMcp);

  let merged = [...fromSkills, ...fromMcp];

  const toolSearch = params.toolSearch;
  if (
    toolSearch?.enabled &&
    typeof toolSearch.threshold === 'number' &&
    toolSearch.threshold > 0 &&
    merged.length > toolSearch.threshold
  ) {
    const skillNames = new Set(
      filtered.map((s) => String(s.name ?? '').trim()).filter(Boolean),
    );
    merged = merged.filter((t) => {
      const name = String(t.function?.name ?? '').trim();
      return name && skillNames.has(name);
    });
    merged.push({
      type: 'function',
      function: {
        name: 'foundry.tool_catalog',
        description:
          'List skill names and descriptions available on this agent. Call a skill name to expand instructions, then call bound tool.* / mcp.* as needed.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Optional filter substring for skill names' },
          },
        },
      },
    });
  }

  if (params.retainToolNames && params.retainToolNames.size > 0) {
    const allow = params.retainToolNames;
    merged = merged.filter((t) => {
      const name = String(t.function?.name ?? '').trim();
      return name && allow.has(name);
    });
  }

  const { tools, duplicateNamesDropped } = registry.dedupeOpenAiFunctionTools(merged);
  const injectedToolNames = tools.map((t) => String(t.function.name ?? '').trim()).filter(Boolean);

  return {
    tools,
    skillCatalog,
    injectedToolNames,
    dedupeDroppedCount: duplicateNamesDropped,
    boundMcpToolNames,
  };
}
