import { Injectable, Logger } from '@nestjs/common';
import type { FactsQueryType } from '@contracts/types';
import type { CeoV2ToolCall, CeoV2ToolResult } from '@contracts/types';
import { CapabilityPolicyService } from '../../../facts/capability-policy.service.js';
import { FactsGatewayClient } from '../../../facts/facts-gateway.client.js';
import { MemoryGatewayClient } from '../../../facts/memory-gateway.client.js';
import { CollaborationLlmBridgeService } from '../../../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../../resolver/ceo-layer-config-resolver.service.js';
import { ConfigService } from '../../../../../common/config/config.service.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

@Injectable()
export class CeoV2ToolsService {
  private readonly logger = new Logger(CeoV2ToolsService.name);
  private static readonly MAX_TOOL_CALLS_PER_REPLY = 5;
  private static readonly MAX_TOOL_RESULT_CHARS = 3000;

  constructor(
    private readonly capabilityPolicy: CapabilityPolicyService,
    private readonly factsGateway: FactsGatewayClient,
    private readonly memoryGateway: MemoryGatewayClient,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly config: ConfigService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
  ) {}

  async executeTools(input: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId: string;
    messageId: string;
    ceoAgentId: string;
    humanSenderId?: string | null;
    toolCalls: CeoV2ToolCall[];
    maxCalls?: number;
  }): Promise<CeoV2ToolResult[]> {
    const limit = Math.min(
      CeoV2ToolsService.MAX_TOOL_CALLS_PER_REPLY,
      Math.max(0, Math.trunc(Number(input.maxCalls ?? CeoV2ToolsService.MAX_TOOL_CALLS_PER_REPLY))),
    );
    const selectedCalls = (Array.isArray(input.toolCalls) ? input.toolCalls : []).slice(0, limit);
    if (!selectedCalls.length) return [];
    const results = await Promise.all(
      selectedCalls.map((toolCall) =>
        this.executeTool({
          companyId: input.companyId,
          roomId: input.roomId,
          threadId: input.threadId ?? null,
          traceId: input.traceId,
          messageId: input.messageId,
          ceoAgentId: input.ceoAgentId,
          humanSenderId: input.humanSenderId ?? null,
          toolCall,
        }),
      ),
    );
    return Promise.all(
      results.map((x) => this.maybeSummarizeToolResult(input.companyId, input.messageId, input.ceoAgentId, x)),
    );
  }

  async executeTool(input: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId: string;
    messageId: string;
    ceoAgentId: string;
    humanSenderId?: string | null;
    toolCall: CeoV2ToolCall;
  }): Promise<CeoV2ToolResult> {
    const { toolCall } = input;
    const toolName = String(toolCall?.name ?? '').trim();
    const args = this.normalizeArgs(toolCall?.args);
    if (!toolName) return this.errorResult(toolCall, 'TOOL_NAME_MISSING');
    if (!input.ceoAgentId) return this.errorResult(toolCall, 'CEO_AGENT_ID_MISSING');
    if (this.config.isForceMemoryCortexOnly()) {
      if (toolName.startsWith('facts.') || toolName === 'department.knowledge.query') {
        this.logger.warn('foundry.ceo.v2.tool.memory_cortex_only_blocked', {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          toolName,
        });
        return this.errorResult(toolCall, 'MEMORY_CORTEX_ONLY_TOOL_BLOCKED');
      }
    }
    this.logger.log('foundry.ceo.v2.tool.call_started', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId: input.traceId,
      toolName,
      toolCallId: String(toolCall.id ?? ''),
    });
    const startedAt = Date.now();
    try {
      let result: CeoV2ToolResult;
      if (toolName === 'memory.search') {
        result = await this.executeMemorySearch(input, args);
      } else if (toolName === 'facts.company.query') {
        result = await this.executeFactsQuery(input, args);
      } else if (toolName === 'department.knowledge.query') {
        result = await this.executeDepartmentKnowledge(input, args);
      } else {
        result = this.errorResult(toolCall, `TOOL_UNSUPPORTED:${toolName}`);
      }
      this.logger.log('foundry.ceo.v2.tool.call_completed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId: input.traceId,
        toolName,
        toolCallId: String(toolCall.id ?? ''),
        ok: result.ok,
        elapsedMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      this.logger.warn('ceo_v2.tools.execute_failed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId: input.traceId,
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
      const result = this.errorResult(toolCall, error instanceof Error ? error.message : String(error));
      this.logger.log('foundry.ceo.v2.tool.call_completed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId: input.traceId,
        toolName,
        toolCallId: String(toolCall.id ?? ''),
        ok: false,
        elapsedMs: Date.now() - startedAt,
      });
      return result;
    }
  }

  private buildDirectMemoryHitsSummary(toolName: string, data: unknown): string {
    const d = (data ?? {}) as Record<string, unknown>;
    const hits = Array.isArray(d.hits) ? (d.hits as Record<string, unknown>[]) : [];
    const q = String(d.query ?? '').trim().replace(/\s+/g, ' ').slice(0, 160);
    const lines = hits.slice(0, 10).map((h, i) => {
      const score = Number(h.score ?? 0).toFixed(3);
      const content = String(h.content ?? '').trim().replace(/\s+/g, ' ').slice(0, 400);
      return `${i + 1}. [${score}] ${content}`;
    });
    const dept = toolName === 'department.knowledge.query' ? String(d.department ?? '').trim() : '';
    const head =
      toolName === 'department.knowledge.query'
        ? `部门知识检索「${dept} ${q}」共 ${hits.length} 条命中：`
        : `记忆检索「${q}」共 ${hits.length} 条命中：`;
    return [head, ...lines].join('\n').slice(0, CeoV2ToolsService.MAX_TOOL_RESULT_CHARS);
  }

  private async maybeSummarizeToolResult(
    companyId: string,
    messageId: string,
    ceoAgentId: string,
    result: CeoV2ToolResult,
  ): Promise<CeoV2ToolResult> {
    if (result.toolName === 'facts.company.query') {
      return this.maybeCompressFactsResult(result);
    }
    const rawText = JSON.stringify(result.data ?? null);
    if (rawText.length <= CeoV2ToolsService.MAX_TOOL_RESULT_CHARS) return result;
    const memoryLikeTool = result.toolName === 'memory.search' || result.toolName === 'department.knowledge.query';
    const summarizeDeadlineMs = this.config.getCollabCeoV2ToolSummarizeTimeoutMs();
    try {
      const layerSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(companyId, 'orchestration');
      const m = String(layerSetting.modelName ?? '').trim();
      if (!m) {
        return {
          ...result,
          data: {
            summarized: true,
            summary: memoryLikeTool
              ? this.buildDirectMemoryHitsSummary(result.toolName, result.data)
              : rawText.slice(0, CeoV2ToolsService.MAX_TOOL_RESULT_CHARS),
          },
        };
      }
      const model = await this.llmBridge.createChatModel({
        companyId,
        fallbackModelName: m,
        llmTimeoutMs: summarizeDeadlineMs,
        maxOutputTokens: 500,
        temperatureOverride: 0.1,
        ceoContext: 'orchestration',
        trace: { messageId, callsite: 'ceo.v2.tool.summarize' },
        meteringAgentId: ceoAgentId,
      });
      const summarized = await Promise.race([
        (model as any).invoke([
          new SystemMessage(
            'Summarize the tool result in concise natural Chinese (within 500 tokens). Keep key evidence, names, counts, and confidence fields; avoid robotic bullet dumps unless the data is inherently tabular.',
          ),
          new HumanMessage(
            JSON.stringify({
              toolName: result.toolName,
              toolCallId: result.toolCallId,
              data: result.data ?? null,
            }),
          ),
        ]),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('ceo_v2_tool_summarize_timeout')), summarizeDeadlineMs);
        }),
      ]);
      const summaryText = String((summarized as any)?.content ?? '').trim();
      const summary =
        summaryText.length > 0
          ? summaryText.slice(0, 2200)
          : memoryLikeTool
            ? this.buildDirectMemoryHitsSummary(result.toolName, result.data)
            : rawText.slice(0, CeoV2ToolsService.MAX_TOOL_RESULT_CHARS);
      return {
        ...result,
        data: {
          summarized: true,
          summary,
        },
      };
    } catch {
      return {
        ...result,
        data: {
          summarized: true,
          summary: memoryLikeTool
            ? this.buildDirectMemoryHitsSummary(result.toolName, result.data)
            : rawText.slice(0, CeoV2ToolsService.MAX_TOOL_RESULT_CHARS),
        },
      };
    }
  }

  private maybeCompressFactsResult(result: CeoV2ToolResult): CeoV2ToolResult {
    const rawText = JSON.stringify(result.data ?? null);
    if (rawText.length <= CeoV2ToolsService.MAX_TOOL_RESULT_CHARS) return result;
    const queryType = String((result.data as any)?.queryType ?? '');
    const facts = ((result.data as any)?.facts ?? {}) as Record<string, unknown>;
    const counts = ((facts?.counts ?? {}) as Record<string, unknown>) ?? {};
    const roomMembers = Array.isArray(facts?.roomMembers) ? facts.roomMembers.slice(0, 12) : [];
    const companyPeople = Array.isArray(facts?.companyPeople) ? facts.companyPeople.slice(0, 12) : [];
    const roleMatches = Array.isArray(facts?.roleMatches) ? facts.roleMatches.slice(0, 12) : [];
    const orgNodes = Array.isArray((facts?.orgStructure as any)?.tree) ? (facts.orgStructure as any).tree.length : 0;
    const summary = this.buildFactsSummary(queryType, facts);
    return {
      ...result,
      data: {
        summarized: true,
        summary,
        factsDigest: {
          queryType,
          counts,
          roomMembers,
          companyPeople,
          roleMatches,
          orgNodes,
        },
      },
    };
  }

  private async executeMemorySearch(
    input: {
      companyId: string;
      roomId: string;
      traceId: string;
      ceoAgentId: string;
      humanSenderId?: string | null;
      toolCall: CeoV2ToolCall;
    },
    args: Record<string, unknown>,
  ): Promise<CeoV2ToolResult> {
    const query = String(args.query ?? '').trim();
    if (!query) return this.errorResult(input.toolCall, 'MEMORY_QUERY_REQUIRED');
    const namespaces = await this.capabilityPolicy.allowedMemoryNamespaces({
      companyId: input.companyId,
      roomId: input.roomId,
      requester: { agentId: input.ceoAgentId, role: 'ceo', departmentSlug: null, userId: input.humanSenderId ?? null },
      includeConversationState: true,
    });
    if (!namespaces.length) return this.errorResult(input.toolCall, 'MEMORY_NAMESPACE_FORBIDDEN');
    const hinted = Array.isArray(args.namespacesHint)
      ? args.namespacesHint.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const effectiveNamespaces = hinted.length ? namespaces.filter((x) => hinted.includes(x)) : namespaces;
    const finalNamespaces = effectiveNamespaces.length ? effectiveNamespaces : namespaces;
    const topK = this.readTopK(args.topK, 6, 12);
    const result = await this.memoryGateway.queryScoped({
      companyId: input.companyId,
      traceId: input.traceId,
      requester: { agentId: input.ceoAgentId, role: 'ceo', departmentSlug: null, userId: input.humanSenderId ?? null },
      namespacesAllowed: finalNamespaces,
      query,
      topK,
      roomId: input.roomId,
    });
    const hits = Array.isArray((result as any)?.hits) ? (result as any).hits : [];
    return {
      toolCallId: String(input.toolCall.id ?? ''),
      toolName: 'memory.search',
      ok: true,
      data: {
        query,
        topK,
        hits: hits.slice(0, topK),
        hitCount: hits.length,
        namespacesUsed: finalNamespaces,
      },
      error: null,
    };
  }

  private async executeFactsQuery(
    input: {
      companyId: string;
      roomId: string;
      threadId?: string | null;
      traceId: string;
      ceoAgentId: string;
      humanSenderId?: string | null;
      toolCall: CeoV2ToolCall;
    },
    args: Record<string, unknown>,
  ): Promise<CeoV2ToolResult> {
    const queryType = this.readFactsQueryType(args.queryType);
    if (!queryType) return this.errorResult(input.toolCall, 'FACTS_QUERY_TYPE_INVALID');
    const roleQuery = queryType === 'role_presence' ? String(args.roleQuery ?? '').trim() || null : null;
    const result = await this.factsGateway.query({
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId ?? null,
      traceId: input.traceId,
      locale: null,
      requester: { agentId: input.ceoAgentId, role: 'ceo', departmentSlug: null, userId: input.humanSenderId ?? null },
      queryType,
      roleQuery,
    });
    return {
      toolCallId: String(input.toolCall.id ?? ''),
      toolName: 'facts.company.query',
      ok: true,
      data: {
        queryType,
        ask: String(args.ask ?? '').slice(0, 300),
        summary: this.buildFactsSummary(queryType, ((result ?? null) as unknown as Record<string, unknown>)),
        facts: result ?? null,
      },
      error: null,
    };
  }

  private buildFactsSummary(queryType: string, facts: Record<string, unknown>): string {
    const counts = ((facts?.counts ?? {}) as Record<string, unknown>) ?? {};
    const readNames = (arr: unknown, field = 'displayName') =>
      Array.isArray(arr)
        ? arr
            .map((x) => {
              const rec = (x ?? {}) as Record<string, unknown>;
              const name = String(rec[field] ?? rec.name ?? rec.memberId ?? rec.id ?? '').trim();
              if (!name) return '';
              const role = String(rec.role ?? '').trim();
              return role ? `${name}(${role})` : name;
            })
            .filter(Boolean)
            .slice(0, 8)
        : [];
    if (queryType === 'room_members') {
      const names = readNames((facts as any)?.roomMembers);
      return `群聊成员共 ${Number(counts.roomMembers ?? names.length ?? 0)} 人：${names.join('、') || '暂无可读成员名单'}`;
    }
    if (queryType === 'company_people') {
      const names = readNames((facts as any)?.companyPeople);
      return `公司在职智能体/人员记录 ${Number(counts.companyPeople ?? names.length ?? 0)} 条；样例：${names.join('、') || '暂无'}`;
    }
    if (queryType === 'role_presence') {
      const names = readNames((facts as any)?.roleMatches, 'displayName');
      return `角色匹配 ${Number(counts.roleMatches ?? names.length ?? 0)} 人：${names.join('、') || '无匹配'}。`;
    }
    if (queryType === 'org_structure') {
      const nodes = Array.isArray((facts as any)?.orgStructure?.tree) ? (facts as any).orgStructure.tree.length : 0;
      return `组织结构节点数：${nodes}`;
    }
    if (queryType === 'department_roster' || queryType === 'node_roster') {
      const pack = (facts as any)?.departmentRoster;
      const members = Array.isArray(pack?.members) ? pack.members : [];
      const names = members
        .map((m: Record<string, unknown>) => {
          const name = String(m.displayName ?? m.agentId ?? '').trim();
          const role = String(m.role ?? '').trim();
          return role ? `${name}(${role})` : name;
        })
        .filter(Boolean)
        .slice(0, 12);
      return `部门编制 ${Number(pack?.counts?.total ?? members.length ?? 0)} 人：${names.join('、') || '系统登记为空'}`;
    }
    return '事实查询完成。';
  }

  private async executeDepartmentKnowledge(
    input: {
      companyId: string;
      roomId: string;
      traceId: string;
      ceoAgentId: string;
      humanSenderId?: string | null;
      toolCall: CeoV2ToolCall;
    },
    args: Record<string, unknown>,
  ): Promise<CeoV2ToolResult> {
    const department = String(args.department ?? '').trim();
    const query = String(args.query ?? '').trim();
    if (!department) return this.errorResult(input.toolCall, 'DEPARTMENT_REQUIRED');
    if (!query) return this.errorResult(input.toolCall, 'DEPARTMENT_QUERY_REQUIRED');
    const topK = this.readTopK(args.topK, 6, 10);
    const namespaces = await this.capabilityPolicy.allowedMemoryNamespaces({
      companyId: input.companyId,
      roomId: input.roomId,
      requester: { agentId: input.ceoAgentId, role: 'ceo', departmentSlug: null, userId: input.humanSenderId ?? null },
      includeConversationState: true,
    });
    if (!namespaces.length) return this.errorResult(input.toolCall, 'DEPARTMENT_MEMORY_NAMESPACE_FORBIDDEN');
    const normalizedDepartment = department.toLowerCase();
    const departmentNamespaces = namespaces.filter((x) => x.toLowerCase().includes(normalizedDepartment));
    const effectiveNamespaces = departmentNamespaces.length ? departmentNamespaces : namespaces;
    const result = await this.memoryGateway.queryScoped({
      companyId: input.companyId,
      traceId: input.traceId,
      requester: { agentId: input.ceoAgentId, role: 'ceo', departmentSlug: null, userId: input.humanSenderId ?? null },
      namespacesAllowed: effectiveNamespaces,
      query: `${department} ${query}`.trim(),
      topK,
      roomId: input.roomId,
    });
    const hits = Array.isArray((result as any)?.hits) ? (result as any).hits : [];
    return {
      toolCallId: String(input.toolCall.id ?? ''),
      toolName: 'department.knowledge.query',
      ok: true,
      data: {
        department,
        query,
        topK,
        hits: hits.slice(0, topK),
        hitCount: hits.length,
      },
      error: null,
    };
  }

  private readFactsQueryType(value: unknown): FactsQueryType | null {
    const q = String(value ?? '').trim();
    if (
      q === 'company_people' ||
      q === 'room_members' ||
      q === 'role_presence' ||
      q === 'org_structure' ||
      q === 'department_roster' ||
      q === 'node_roster'
    ) {
      return q;
    }
    return null;
  }

  private readTopK(value: unknown, fallback: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const v = Math.trunc(n);
    if (v < 1) return 1;
    if (v > max) return max;
    return v;
  }

  private normalizeArgs(args: unknown): Record<string, unknown> {
    if (!args) return {};
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
    return args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  }

  private errorResult(toolCall: CeoV2ToolCall, reason: string): CeoV2ToolResult {
    return {
      toolCallId: String(toolCall?.id ?? ''),
      toolName: String(toolCall?.name ?? ''),
      ok: false,
      data: null,
      error: reason,
    };
  }
}
