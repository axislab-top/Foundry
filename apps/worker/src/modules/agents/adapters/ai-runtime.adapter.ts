import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { AgentSkillsChangedEvent } from '@contracts/events';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';
import { snapshotsIncludePlanABindings, ToolRegistry } from '@service/ai';
import { registerBuiltinSkillHandlers } from '../tools/register-builtins.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { firstValueFrom, timeout } from 'rxjs';

/**
 * LangGraph / execution 接入：刷新 ToolRegistry；内置 handler 在构造时注册。
 */
export interface AiRuntimeAdapter {
  onAgentEvent(eventType: string, payload: Record<string, unknown>): Promise<void>;
  onOrganizationNodeMoved(payload: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class SkillAwareAiRuntimeAdapter implements AiRuntimeAdapter {
  private toMcpToolsFromSkills(skills: any[]): McpToolDefinition[] {
    const out: McpToolDefinition[] = [];
    const seen = new Set<string>();
    for (const skill of Array.isArray(skills) ? skills : []) {
      const bound = skill && typeof skill === 'object' ? (skill as any).boundMcpTools : null;
      const raw = skill && typeof skill === 'object' ? (skill as any).handlerConfig : null;
      const legacy = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as any).mcpTools : null;
      const mcp = Array.isArray(bound) ? bound : legacy;
      if (!Array.isArray(mcp) || mcp.length === 0) continue;
      const governance = {
        timeoutSeconds: typeof (skill as any)?.timeoutSeconds === 'number' ? Math.floor((skill as any).timeoutSeconds) : undefined,
        maxInputSizeBytes: typeof (skill as any)?.maxInputSizeBytes === 'number' ? Math.floor((skill as any).maxInputSizeBytes) : undefined,
        maxInputTokens: typeof (skill as any)?.maxInputTokens === 'number' ? Math.floor((skill as any).maxInputTokens) : undefined,
        maxOutputTokens: typeof (skill as any)?.maxOutputTokens === 'number' ? Math.floor((skill as any).maxOutputTokens) : undefined,
        chunkStrategy: typeof (skill as any)?.chunkStrategy === 'string' ? String((skill as any).chunkStrategy) : undefined,
      };
      for (const t of mcp) {
        if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
        const name = typeof (t as any).name === 'string' ? String((t as any).name).trim() : '';
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const meta = (t as any).metadata && typeof (t as any).metadata === 'object' && !Array.isArray((t as any).metadata)
          ? { ...(t as any).metadata }
          : {};
        if (!meta.governance) {
          meta.governance = governance;
        }
        out.push({ ...(t as any), metadata: meta } as McpToolDefinition);
      }
    }
    return out;
  }

  constructor(
    private readonly registry: ToolRegistry,
    config: ConfigService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
  ) {
    registerBuiltinSkillHandlers(registry, {
      allowUnsafeStubs: config.getWorkerAllowUnsafeSkillStubs(),
      apiRpc: this.apiRpc,
      apiRpcTimeoutMs: config.getApiRpcTimeoutMs(),
    });
    this.registry.configureDynamicMcpLoader(
      async ({ companyId, agentId, layer }) => {
        const skillOut = await firstValueFrom(
          this.apiRpc
            .send<{ skills?: any[] }>('agents.effectiveSkillSnapshots', {
              companyId,
              id: agentId,
            })
            .pipe(timeout(config.getApiRpcTimeoutMs())),
        );
        const all = this.toMcpToolsFromSkills(Array.isArray(skillOut?.skills) ? skillOut.skills : []);
        if (!layer) return all;
        // Layer-scoped filtering by metadata.layer(s) when present; default to all for backward compatibility.
        return all.filter((tool) => {
          const layers = (tool as any)?.metadata?.layers;
          if (!Array.isArray(layers) || layers.length === 0) return true;
          return layers.map((x: unknown) => String(x ?? '').trim()).includes(layer);
        });
      },
      { ttlMs: 60_000 },
    );
    this.registry.configureDynamicSkillLoader(
      async ({ companyId, agentId }) => {
        const out = await firstValueFrom(
          this.apiRpc
            .send<{ skills?: any[] }>('agents.effectiveSkillSnapshots', {
              companyId,
              id: agentId,
            })
            .pipe(timeout(config.getApiRpcTimeoutMs())),
        );
        return Array.isArray(out?.skills) ? out.skills : [];
      },
      { ttlMs: 60_000 },
    );
  }

  async onAgentEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    if (eventType === 'agent.skills.changed') {
      const data = payload.data as AgentSkillsChangedEvent['data'] | undefined;
      if (data?.companyId && data.agentId && data.skills) {
        const skills = Array.isArray(data.skills) ? data.skills : [];
        if (snapshotsIncludePlanABindings(skills)) {
          this.registry.setAgentTools(data.companyId, data.agentId, skills);
        } else {
          // Legacy events without Plan A binding arrays: drop stale cache and refetch via RPC.
          this.registry.clearAgentTools(data.companyId, data.agentId);
        }
        this.registry.invalidateDynamicSkillCache(data.companyId, data.agentId);
        this.registry.invalidateDynamicMcpCache(data.companyId, data.agentId);
      }
      return;
    }

    if (eventType === 'mcp.tool.config.changed') {
      const data = (payload as any)?.data as { companyId?: string | null } | undefined;
      this.registry.invalidateDynamicMcpCache(String(data?.companyId ?? '').trim() || undefined);
      return;
    }

    if (eventType === 'skill.config.changed') {
      const data = (payload as any)?.data as { companyId?: string | null } | undefined;
      this.registry.invalidateDynamicSkillCache(String(data?.companyId ?? '').trim() || undefined);
    }
  }

  async onOrganizationNodeMoved(_payload: Record<string, unknown>): Promise<void> {
    // 后续：失效 org-tree 缓存或刷新继承 Skills
  }
}
