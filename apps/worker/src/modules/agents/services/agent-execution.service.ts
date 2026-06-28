import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ClientProxy } from '@nestjs/microservices';
import { createHash, randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import type {
  BillingConsumptionRequestedEvent,
  SkillExecutedEvent,
  SkillToolSnapshot,
} from '@contracts/events';
import {
  buildSkillCatalog,
  buildSkillInstructionsPayload,
  collectBoundMcpToolsFromSnapshots,
  filterSnapshotsBySkillIds,
  filterSnapshotsByToolsets,
  shouldExpandOnSkillNameCall,
  ToolRegistry,
} from '@service/ai';
import { skillRequiresExecutionToken } from '@foundry/approval-core';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';
import { ConfigService } from '../../../common/config/config.service.js';
import { CompanyToolsetResolverService } from './company-toolset-resolver.service.js';
import { ExecutionGuardService } from '../../approval/execution-guard.service.js';
import {
  ExternalHttpSkillRunnerService,
  normalizeExternalSkillUrl,
  type ExternalHttpSkillHandlerConfig,
} from './external-http-skill-runner.service.js';
import { RunnerExecutionClient } from '../../../common/runner/runner-execution.client.js';
import { executeIntentClassifyMcp } from '../../collaboration/ceo/mention-intent-moe.util.js';
import { RunnerGracefulShutdownService } from './runner-graceful-shutdown.service.js';
import {
  DIRECT_COLLAB_REPLY_DELEGATE,
  type DirectCollabReplyDelegate,
  type ExecuteDirectCollabHandoverParams,
} from '../direct-collab-reply-delegate.js';
import type { PromptSkillCompletionService } from './prompt-skill-completion.service.js';
import type { ExecuteSkillParams } from './agent-execution.types.js';

export type { PromptSkillMode, ExecuteSkillParams } from './agent-execution.types.js';

/** Shell 类 builtin：仅经 Runner Job 执行，禁止 ToolRegistry 内联 handler（见 register-builtins）。 */
const RUNNER_SHELL_BUILTIN_SKILLS = new Set(['code-run']);

export type { ExecuteDirectCollabHandoverParams } from '../direct-collab-reply-delegate.js';

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);
  private readonly uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private promptSkillCompletionCached?: PromptSkillCompletionService;

  private isExecutionIsolationV2Enabled(): boolean {
    const cfg = this.config as unknown as {
      getExecutionIsolationV2Enabled?: () => boolean;
      get?: <T>(key: string, defaultValue?: T) => T;
    };
    if (typeof cfg.getExecutionIsolationV2Enabled === 'function') {
      return cfg.getExecutionIsolationV2Enabled();
    }
    if (typeof cfg.get === 'function') {
      return Boolean(cfg.get<boolean>('EXECUTION_ISOLATION_V2_ENABLED', false));
    }
    return false;
  }

  private isMemoryMcpV2Enabled(): boolean {
    const cfg = this.config as unknown as {
      getMemoryMcpV2Enabled?: () => boolean;
      get?: <T>(key: string, defaultValue?: T) => T;
    };
    if (typeof cfg.getMemoryMcpV2Enabled === 'function') {
      return cfg.getMemoryMcpV2Enabled();
    }
    if (typeof cfg.get === 'function') {
      return Boolean(cfg.get<boolean>('MEMORY_MCP_V2_ENABLED', false));
    }
    return false;
  }

  constructor(
    private readonly registry: ToolRegistry,
    private readonly messagingService: MessagingService,
    private readonly externalHttp: ExternalHttpSkillRunnerService,
    private readonly config: ConfigService,
    private readonly companyToolsets: CompanyToolsetResolverService,
    private readonly executionGuard: ExecutionGuardService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly runnerExecution: RunnerExecutionClient,
    private readonly runnerShutdown: RunnerGracefulShutdownService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    @Inject(DIRECT_COLLAB_REPLY_DELEGATE)
    private readonly directCollabReply?: DirectCollabReplyDelegate,
  ) {}

  private async resolvePromptSkillCompletion(): Promise<PromptSkillCompletionService | undefined> {
    if (this.promptSkillCompletionCached) return this.promptSkillCompletionCached;
    try {
      const { PromptSkillCompletionService: Svc } = await import('./prompt-skill-completion.service.js');
      this.promptSkillCompletionCached = this.moduleRef.get(Svc, { strict: false });
      return this.promptSkillCompletionCached;
    } catch {
      return undefined;
    }
  }

  private isTransientRunnerError(err: unknown): boolean {
    const msg = String(err instanceof Error ? err.message : err).toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('503') ||
      msg.includes('unavailable') ||
      msg.includes('socket hang up')
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  /** W14：`COST_AWARE_ROUTING_ENABLED` 时对 Runner RPC 做有限次指数退避重试。 */
  private async withRunnerRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.config.isCostAwareRoutingEnabled()) {
      return await fn();
    }
    const delays = [250, 600, 1400] as const;
    let last: unknown;
    for (let i = 0; i <= delays.length; i += 1) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        if (i >= delays.length || !this.isTransientRunnerError(e)) {
          throw e;
        }
        this.logger.warn({
          msg: 'runner_execute_retry',
          label,
          attempt: i + 1,
          message: e instanceof Error ? e.message : String(e),
        });
        await this.sleep(delays[i]!);
      }
    }
    throw last;
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private isUuid(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const v = value.trim();
    return Boolean(v) && this.uuidLike.test(v);
  }

  private resolveBuiltinToolConfig(
    snap: SkillToolSnapshot | null | undefined,
    requestedToolName: string,
  ): { builtinHandler: string | null } {
    if (!snap || String(snap.implementationType ?? '').trim() !== 'builtin') {
      return { builtinHandler: null };
    }
    const hc = (snap.handlerConfig ?? null) as Record<string, unknown> | null;
    const builtinTools = hc && typeof hc === 'object' && !Array.isArray(hc) ? (hc as any).builtinTools : null;
    if (!Array.isArray(builtinTools) || builtinTools.length === 0) {
      return { builtinHandler: null };
    }
    const target = String(requestedToolName ?? '').trim();
    const hit = builtinTools.find((x: unknown) => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
      return String((x as any).name ?? '').trim() === target;
    }) as Record<string, unknown> | undefined;
    if (!hit) return { builtinHandler: null };
    const handler = typeof hit.builtinHandler === 'string' ? String(hit.builtinHandler).trim() : '';
    return { builtinHandler: handler || null };
  }

  /**
   * P11.1：统一执行前 MemoryGovernanceGuard。
   *
   * 规则：
   * - 仅在 EXECUTION_ISOLATION_V2_ENABLED=true 时启用（灰度保护）
   * - builtin / external / mcp 全部必须调用
   * - 被拒绝时硬阻断，并写 blocked_reason 日志
   */
  private async guardForExecution(params: {
    exec: ExecuteSkillParams;
    executionKind: 'builtin' | 'external_http' | 'mcp' | 'tool';
    skillSlug: string;
  }): Promise<void> {
    if (!this.isExecutionIsolationV2Enabled()) return;
    const actor = this.workerActor();
    const content = JSON.stringify({
      kind: params.executionKind,
      skillSlug: params.skillSlug,
      layer: params.exec.layer ?? null,
      argsPreview: params.exec.args ?? {},
    }).slice(0, 60_000);
    const payload = {
      companyId: params.exec.companyId,
      actor,
      namespace: `agent:${params.exec.agentId}`,
      content,
      sourceType: 'skill',
      metadata: {
        kind: 'execution_guard',
        executionKind: params.executionKind,
        skillSlug: params.skillSlug,
      },
      cycleDepth: 0,
      isSensitive: false,
    };
    const pattern = 'memory.governance.guardForExecution';
    const guard = await firstValueFrom(
      this.apiRpc
        .send<{ allowed: boolean; reason?: string; blockedReason?: string }>(pattern, payload)
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    ).catch(async () =>
      await firstValueFrom(
        this.apiRpc
          .send<{ allowed: boolean; reason?: string }>('memory.governance.guard', payload)
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      ),
    );
    if (guard && guard.allowed === false) {
      const blockedReason = (guard as any).blockedReason ?? guard.reason ?? 'unknown';
      this.logger.warn({
        msg: 'execution_guard_blocked',
        companyId: params.exec.companyId,
        agentId: params.exec.agentId,
        skillSlug: params.skillSlug,
        executionKind: params.executionKind,
        blocked_reason: blockedReason,
      });
      throw new Error(`execution_guard_blocked:${blockedReason}`);
    }
  }

  private isToolCall(name: string): boolean {
    const n = String(name ?? '').trim();
    return n.startsWith('tool.');
  }

  private resolveBoundToolFromSnapshots(
    snapshots: SkillToolSnapshot[],
    toolName: string,
  ): { tool: { name: string; description?: string; inputSchema?: any; securityProfile?: any; handlerConfig?: any; metadata?: any }; ownerSkill?: SkillToolSnapshot } | null {
    const target = String(toolName ?? '').trim();
    if (!target) return null;
    for (const snap of Array.isArray(snapshots) ? snapshots : []) {
      const list = (snap as any).boundTools;
      if (!Array.isArray(list) || list.length === 0) continue;
      const hit = list.find((t: any) => t && typeof t === 'object' && !Array.isArray(t) && String(t.name ?? '').trim() === target);
      if (hit) {
        return { tool: hit as any, ownerSkill: snap };
      }
    }
    return null;
  }

  private async executeToolViaRunnerSandbox(params: ExecuteSkillParams): Promise<unknown> {
    const snapshots = await this.registry.getToolSnapshotsDynamic(params.companyId, params.agentId);
    const resolved = this.resolveBoundToolFromSnapshots(snapshots, params.skillName);
    if (!resolved) {
      throw new Error(`Tool "${params.skillName}" is not bound to this agent (via any bound skill)`);
    }

    const handlerConfig = resolved.tool.handlerConfig && typeof resolved.tool.handlerConfig === 'object' && !Array.isArray(resolved.tool.handlerConfig)
      ? (resolved.tool.handlerConfig as Record<string, unknown>)
      : null;
    const kind = String((handlerConfig as any)?.kind ?? '').trim().toLowerCase();
    if (kind !== 'http') {
      throw new Error(`Tool "${params.skillName}" handlerConfig.kind must be "http" (got "${kind || 'unknown'}")`);
    }
    const url = String((handlerConfig as any)?.url ?? '').trim();
    if (!url) {
      throw new Error(`Tool "${params.skillName}" http handlerConfig.url is required`);
    }
    const method = String((handlerConfig as any)?.method ?? 'POST').trim().toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      throw new Error(`Tool "${params.skillName}" http method must be GET or POST`);
    }

    await this.guardForExecution({ exec: params, executionKind: 'tool', skillSlug: params.skillName });

    const bareToolName = params.skillName.replace(/^tool\./, '');
    let body: Record<string, unknown> =
      params.args && typeof params.args === 'object' && !Array.isArray(params.args)
        ? { ...(params.args as Record<string, unknown>) }
        : {};
    if (bareToolName === 'message_send_to_agent') {
      body = {
        ...body,
        companyId: String(body.companyId ?? params.companyId ?? '').trim() || params.companyId,
        senderAgentId: String(body.senderAgentId ?? params.agentId ?? '').trim() || params.agentId,
        expectReply: body.expectReply ?? true,
      };
    }

    if (this.isPlatformInternalToolUrl(url)) {
      const direct = await this.executePlatformInternalToolHttp({
        url,
        method: method as 'GET' | 'POST',
        body: method === 'GET' ? undefined : body,
      });
      this.logger.log({
        msg: 'platform_internal_tool_http_ok',
        toolName: params.skillName,
        companyId: params.companyId,
        agentId: params.agentId,
      });
      return direct;
    }

    const out = await this.withRunnerRetry('tool.sandbox_http', () =>
      this.runnerExecution.invokeSkillSandboxHttp({
        companyId: params.companyId,
        runId: params.traceId ?? randomUUID(),
        url,
        method: method as 'GET' | 'POST',
        body: method === 'GET' ? undefined : body,
        actor: this.workerActor(),
        governance: {
          timeoutSeconds: typeof (params as any).timeoutSeconds === 'number' ? (params as any).timeoutSeconds : undefined,
          maxInputSizeBytes: typeof (params as any).maxInputSizeBytes === 'number' ? (params as any).maxInputSizeBytes : undefined,
        },
      }),
    );
    return out;
  }

  /** 平台 `/internal/tools/*`：Worker 直连 API（token 已嵌入 seed URL），不经 Runner sandbox。 */
  private isPlatformInternalToolUrl(url: string): boolean {
    try {
      return new URL(url).pathname.includes('/internal/tools/');
    } catch {
      return false;
    }
  }

  private async executePlatformInternalToolHttp(params: {
    url: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
  }): Promise<unknown> {
    const timeoutMs = this.config.getApiRpcTimeoutMs();
    const res = await fetch(params.url, {
      method: params.method,
      headers: { 'content-type': 'application/json' },
      body: params.method === 'GET' ? undefined : JSON.stringify(params.body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`internal_tool_http_${res.status}:${text.slice(0, 800)}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { ok: true, raw: text.slice(0, 2000) };
    }
  }

  private async assertTemporaryAgentProjectScope(params: {
    companyId: string;
    agentId: string;
    projectId?: string | null;
  }): Promise<void> {
    const actor = this.workerActor();
    const agent = await firstValueFrom(
      this.apiRpc
        .send<{ metadata?: Record<string, unknown> | null }>('agents.findOne', {
          companyId: params.companyId,
          actor,
          id: params.agentId,
        })
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
    const meta = (agent as any)?.metadata as Record<string, unknown> | null | undefined;
    const employmentType =
      meta && typeof meta['employmentType'] === 'string' ? String(meta['employmentType']) : 'permanent';
    if (employmentType !== 'temporary') return;
    const boundProjectId = meta && typeof meta['projectId'] === 'string' ? String(meta['projectId']) : '';
    const pid = typeof params.projectId === 'string' ? params.projectId.trim() : '';
    if (!boundProjectId) {
      throw new Error('PROJECT_SCOPE_REQUIRED: temporary agent missing bound projectId');
    }
    if (!pid) {
      throw new Error('PROJECT_SCOPE_REQUIRED: projectId required for temporary agent');
    }
    if (pid !== boundProjectId) {
      throw new Error('PROJECT_SCOPE_REQUIRED: temporary agent project mismatch');
    }
  }

  private async assertExternalSkillBudgetAllowance(
    params: ExecuteSkillParams,
    _snap: { name: string; metadata?: Record<string, unknown> | null },
  ): Promise<void> {
    const actor = this.workerActor();
    const estimatedCost = this.config.getExternalSkillBudgetEstimate();
    const agentId = this.isUuid(params.agentId) ? params.agentId : undefined;
    const allowance = await firstValueFrom(
      this.apiRpc
        .send<{ allowed: boolean; reason?: string; warning?: string }>('billing.checkAllowance', {
          companyId: params.companyId,
          actor,
          estimatedCost,
          ...(agentId ? { agentId } : {}),
        })
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
    if (allowance?.warning) {
      this.logger.warn('billing.checkAllowance soft budget warning (external skill)', {
        companyId: params.companyId,
        agentId: params.agentId,
        warning: allowance.warning,
      });
    }
    if (!allowance?.allowed) {
      if (allowance?.reason === 'execution_paused') {
        throw new Error(`execution paused: ${allowance.reason}`);
      }
      this.logger.warn('billing.checkAllowance disallowed (non-pause); continuing per soft budget policy', {
        companyId: params.companyId,
        agentId: params.agentId,
        reason: allowance?.reason,
      });
    }
  }

  /**
   * MCP tools 的预算预检（双重防护：Runner sandbox 内也会做 checkAllowance，但 Worker 必须在执行前先做一次硬阻断）。
   */
  private async assertMcpBudgetAllowance(params: ExecuteSkillParams, tool: McpToolDefinition): Promise<void> {
    const actor = this.workerActor();
    const estimatedCost = this.config.getExternalSkillBudgetEstimate();
    const agentId = this.isUuid(params.agentId) ? params.agentId : undefined;
    const allowance = await firstValueFrom(
      this.apiRpc
        .send<{ allowed: boolean; reason?: string; warning?: string }>('billing.checkAllowance', {
          companyId: params.companyId,
          actor,
          estimatedCost,
          ...(agentId ? { agentId } : {}),
        })
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
    if (allowance?.warning) {
      this.logger.warn('billing.checkAllowance soft budget warning (mcp)', {
        companyId: params.companyId,
        agentId: params.agentId,
        toolName: tool.name,
        warning: allowance.warning,
      });
    }
    if (allowance && allowance.allowed === false && allowance.reason === 'execution_paused') {
      throw new Error(`execution paused: ${allowance.reason}`);
    }
  }

  /**
   * Execute an MCP tool via Runner sandbox HTTP invocation (strict per-agent/per-layer isolation).
   *
   * Hard redlines:
   * - Must call `assertMcpToolBound(...)` before ANY runner invocation.
   * - Must NOT fall back to inline execution.
   */
  private async assertMcpInCapabilityScope(params: ExecuteSkillParams): Promise<void> {
    const ids = (Array.isArray(params.capabilitySkillIds) ? params.capabilitySkillIds : [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean);
    if (!ids.length) return;
    const snapshots = await this.registry.getToolSnapshotsDynamic(params.companyId, params.agentId);
    const filtered = filterSnapshotsBySkillIds(snapshots, ids);
    const allowed = new Set(collectBoundMcpToolsFromSnapshots(filtered).map((t) => t.name));
    const name = String(params.skillName ?? '').trim();
    if (!allowed.has(name)) {
      throw new Error(
        `MCP_TOOL_NOT_IN_CAPABILITY_SCOPE: tool "${name}" is not bound on configured skills [${ids.slice(0, 12).join(', ')}]`,
      );
    }
  }

  private async executeMcpViaRunnerSandbox(params: ExecuteSkillParams): Promise<unknown> {
    const layer = typeof params.layer === 'string' ? params.layer.trim() : undefined;
    await this.assertMcpInCapabilityScope(params);
    try {
      await this.registry.assertMcpToolBoundAsync(params.companyId, params.agentId, params.skillName, layer);
    } catch (e: unknown) {
      const msg = 'MCP tool not bound to this agent/layer';
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`${msg}: ${detail}`);
    }
    const tools = await this.registry.getMcpToolsDynamic(params.companyId, params.agentId, layer);
    const tool = tools.find((t) => t.name === params.skillName);
    if (!tool) {
      throw new Error(`MCP tool not bound to this agent/layer: tool "${params.skillName}" missing definition`);
    }

    await this.guardForExecution({ exec: params, executionKind: 'mcp', skillSlug: tool.name });

    const transport = (tool as any).transport as any;
    /**
     * Fallback MCP：仅在 Agent/公司已显式绑定 `mcp.collaboration.intent_classify` 时可达（不在 resolveRuntime 默认注入）。
     * 执行仍走本地 MoE 逻辑 + Billing 预检（与 HTTP MCP 一致闸门）。
     */
    if (tool.name === 'mcp.collaboration.intent_classify') {
      await this.assertMcpBudgetAllowance(params, tool);
      return executeIntentClassifyMcp((params.args ?? {}) as Record<string, unknown>);
    }
    if (!transport || transport.kind !== 'http' || typeof transport.url !== 'string' || !transport.url.trim()) {
      throw new Error(`MCP tool "${tool.name}" missing http transport.url`);
    }
    const url = transport.url.trim();
    const methodRaw = String(transport.method ?? 'POST').toUpperCase();
    const method = methodRaw === 'GET' ? 'GET' : 'POST';
    await this.assertMcpBudgetAllowance(params, tool);
    const runId = params.traceId?.trim() || randomUUID();
    const gov = (tool as any)?.metadata?.governance as any;
    const out = await this.withRunnerRetry('mcp.sandbox', () =>
      this.isExecutionIsolationV2Enabled() || this.isMemoryMcpV2Enabled()
        ? this.runnerExecution.executeMcpJob({
            companyId: params.companyId,
            runId,
            toolName: tool.name,
            securityProfile: String(tool.securityProfile ?? 'safe'),
            url,
            method,
            body: method === 'GET' ? undefined : params.args ?? {},
            actor: this.workerActor(),
            requireSnapshot: true,
            governance: gov && typeof gov === 'object' ? gov : undefined,
            timeoutSeconds: typeof gov?.timeoutSeconds === 'number' ? Math.floor(gov.timeoutSeconds) : undefined,
            maxInputSizeBytes: typeof gov?.maxInputSizeBytes === 'number' ? Math.floor(gov.maxInputSizeBytes) : undefined,
          })
        : this.runnerExecution.invokeSkillSandboxHttp({
            companyId: params.companyId,
            runId,
            url,
            method,
            body: method === 'GET' ? undefined : params.args ?? {},
            actor: this.workerActor(),
            governance: gov && typeof gov === 'object' ? { timeoutSeconds: gov.timeoutSeconds, maxInputSizeBytes: gov.maxInputSizeBytes } : undefined,
            timeoutSeconds: typeof gov?.timeoutSeconds === 'number' ? Math.floor(gov.timeoutSeconds) : undefined,
            maxInputSizeBytes: typeof gov?.maxInputSizeBytes === 'number' ? Math.floor(gov.maxInputSizeBytes) : undefined,
          }),
    );
    this.logger.log({
      msg: 'runner_mcp_skill_sandbox_ok',
      toolName: tool.name,
      companyId: params.companyId,
      agentId: params.agentId,
      layer: layer ?? null,
      jobName: out.jobName,
      mode: out.mode,
    });
    return {
      ok: true,
      toolName: tool.name,
      runnerSkillSandbox: out,
      note: out.note,
    };
  }

  /**
   * P8/P10：`code-run` 等 shell 能力唯一入口 — apps/runner **`runner.skill.execute`**
   *（与 `runner.execute` 共享策略 / 审批 / Billing / gVisor Job）。
   * `args.command` 为单行 shell 命令；高危命令由 Runner CommandPolicyEngine 判定（needsApproval → 传 executionToken）。
   */
  private async executeBuiltinViaRunner(
    params: ExecuteSkillParams,
    snap: SkillToolSnapshot,
  ): Promise<unknown> {
    await this.guardForExecution({ exec: params, executionKind: 'builtin', skillSlug: params.skillName });
    const resolvedBuiltin = this.resolveBuiltinToolConfig(snap, params.skillName);
    const runnerSkillName = resolvedBuiltin.builtinHandler ?? params.skillName;
    const raw = params.args.command;
    const commandLine = typeof raw === 'string' ? raw.trim() : '';
    if (!commandLine) {
      throw new Error(`Skill "${params.skillName}" requires args.command (non-empty shell command string)`);
    }
    const runId = params.traceId?.trim() || randomUUID();
    const runnerToken = params.executionTokenId?.trim();
    const skillExecutionId = params.skillExecutionId?.trim() || randomUUID();
    const meta = (snap as { metadata?: Record<string, unknown> | null }).metadata ?? {};
    const securityProfile =
      runnerSkillName === 'code-run'
        ? 'shell'
        : typeof meta.securityProfile === 'string'
          ? meta.securityProfile
          : typeof meta['security_profile'] === 'string'
            ? String(meta['security_profile'])
            : 'safe';
    // Sprint 2 P11：灰度开启时强制 pre/post 快照
    const out = await this.withRunnerRetry('builtin.execute_skill', () =>
      this.runnerExecution.executeSkill({
        companyId: params.companyId,
        runId,
        commandLine,
        executionTokenId: runnerToken,
        persistent: true,
        actor: this.workerActor(),
        skillSlug: runnerSkillName,
        securityProfile,
        skillExecutionId,
        // P0-Phase5: governance passthrough to Runner for job enforcement
        timeoutSeconds: typeof (snap as any)?.timeoutSeconds === 'number' ? Math.floor((snap as any).timeoutSeconds) : undefined,
        maxInputSizeBytes: typeof (snap as any)?.maxInputSizeBytes === 'number' ? Math.floor((snap as any).maxInputSizeBytes) : undefined,
        maxInputTokens: typeof (snap as any)?.maxInputTokens === 'number' ? Math.floor((snap as any).maxInputTokens) : undefined,
        maxOutputTokens: typeof (snap as any)?.maxOutputTokens === 'number' ? Math.floor((snap as any).maxOutputTokens) : undefined,
        chunkStrategy: typeof (snap as any)?.chunkStrategy === 'string' ? String((snap as any).chunkStrategy) : undefined,
        requirePreSnapshot: this.isExecutionIsolationV2Enabled() ? true : undefined,
        requirePostSnapshot: this.isExecutionIsolationV2Enabled() ? true : undefined,
      } as any),
    );
    this.logger.log({
      msg: 'runner_execute_ok',
      skillName: params.skillName,
      runnerSkillName,
      companyId: params.companyId,
      sandboxId: out.sandboxId,
      jobName: out.jobName,
      policyDecisionId: out.policyDecisionId,
      mode: out.mode,
      skillExecutionId,
      executionTokenId: runnerToken,
    });
    return {
      ok: true,
      skillName: params.skillName,
      runnerSkillName,
      runner: out,
      note: 'stdout/stderr are collected by the Runner Job; use job logs or future streaming (mock mode has no captured stdout in Worker).',
    };
  }

  /**
   * Sprint 3.2：外部 HTTP Skill 经 Runner Job 内 wget（须 handlerConfig.runnerSandbox / marketplaceRunner 或环境变量强制）。
   */
  private async executeExternalViaRunnerSandbox(
    params: ExecuteSkillParams,
    snap: SkillToolSnapshot,
  ): Promise<unknown> {
    await this.guardForExecution({ exec: params, executionKind: 'external_http', skillSlug: params.skillName });
    const handlerConfig = (snap.handlerConfig ?? null) as unknown as ExternalHttpSkillHandlerConfig | null;
    if (!handlerConfig || handlerConfig.kind !== 'http') {
      throw new Error(`Skill "${params.skillName}" external handlerConfig.kind must be "http"`);
    }
    const url = normalizeExternalSkillUrl(handlerConfig);
    const methodRaw = (handlerConfig.method ?? 'POST').toUpperCase();
    const method = methodRaw === 'GET' ? 'GET' : 'POST';
    const runId = params.traceId?.trim() || randomUUID();
    /**
     * Sprint 2 P11：EXECUTION_ISOLATION_V2_ENABLED=true 时，外部 HTTP Skill 也必须走 Runner（且强制快照）。
     * - runner.skill.execute 语义是 shell/命令；这里仍复用 sandbox http job，但通过 Runner 执行。
     * - 兼容：开关关闭时保持旧行为。
     */
    const out = await this.withRunnerRetry('external.http_sandbox', () =>
      this.isExecutionIsolationV2Enabled()
        ? this.runnerExecution.executeMcpJob({
            companyId: params.companyId,
            runId,
            toolName: `skill.http:${params.skillName}`,
            securityProfile: String((snap as any)?.securityProfile ?? 'network'),
            url,
            method,
            body: method === 'GET' ? undefined : params.args ?? {},
            actor: this.workerActor(),
            requireSnapshot: true,
            timeoutSeconds: typeof (snap as any)?.timeoutSeconds === 'number' ? Math.floor((snap as any).timeoutSeconds) : undefined,
            maxInputSizeBytes: typeof (snap as any)?.maxInputSizeBytes === 'number' ? Math.floor((snap as any).maxInputSizeBytes) : undefined,
          })
        : this.runnerExecution.invokeSkillSandboxHttp({
            companyId: params.companyId,
            runId,
            url,
            method,
            body: method === 'GET' ? undefined : params.args ?? {},
            actor: this.workerActor(),
            timeoutSeconds: typeof (snap as any)?.timeoutSeconds === 'number' ? Math.floor((snap as any).timeoutSeconds) : undefined,
            maxInputSizeBytes: typeof (snap as any)?.maxInputSizeBytes === 'number' ? Math.floor((snap as any).maxInputSizeBytes) : undefined,
          }),
    );
    this.logger.log({
      msg: 'runner_skill_sandbox_ok',
      skillName: params.skillName,
      companyId: params.companyId,
      jobName: out.jobName,
      mode: out.mode,
    });
    return {
      ok: true,
      skillName: params.skillName,
      runnerSkillSandbox: out,
      note: out.note,
    };
  }

  private static readonly BILLING_IDEMPOTENCY_KEY_MAX = 128;

  /** billing_records.idempotency_key varchar(128) */
  private clampBillingIdempotencyKey(raw: string): string {
    const key = String(raw ?? '').trim();
    if (key.length <= AgentExecutionService.BILLING_IDEMPOTENCY_KEY_MAX) return key;
    const digest = createHash('sha256').update(key).digest('hex').slice(0, 48);
    return `skill:${digest}`;
  }

  private buildSkillBillingIdempotencyKey(params: ExecuteSkillParams): string {
    const tracePart = String(params.traceId ?? '').trim() || randomUUID();
    const raw = `skill:${params.companyId}:${params.agentId}:${params.skillName}:${tracePart}`;
    return this.clampBillingIdempotencyKey(raw);
  }

  private async publishSkillBilling(
    params: ExecuteSkillParams,
    skillId: string | null,
    durationMs: number,
  ): Promise<void> {
    const idempotencyKey = this.buildSkillBillingIdempotencyKey(params);
    const event: BillingConsumptionRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.consumption.requested',
      aggregateId: skillId ?? params.skillName,
      aggregateType: 'billing',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        recordType: 'skill',
        agentId: params.agentId,
        skillId: skillId ?? undefined,
        skillCallUnits: Math.max(1, Math.ceil(durationMs / 60_000)),
        idempotencyKey,
        metadata: { skillName: params.skillName, durationMs },
      },
    };
    await this.messagingService.publish(event, {
      routingKey: 'billing.consumption.requested',
      persistent: true,
    });
  }

  /**
   * W10：员工自主路径专用入口（`EMPLOYEE_AUTONOMOUS` + `MULTI_AGENT_GRAPH_V2` 双开关），行为等同 {@link executeSkill}。
   */
  async executeSkillEmployeeAutonomous(
    params: ExecuteSkillParams,
  ): Promise<{ result: unknown; durationMs: number }> {
    if (!this.config.isEmployeeAutonomousEnabled() || !this.config.isMultiAgentGraphV2Enabled()) {
      throw new Error('employee_autonomous_skill_gate_off');
    }
    return this.executeSkill(params);
  }

  async executeSkill(params: ExecuteSkillParams): Promise<{ result: unknown; durationMs: number }> {
    const started = Date.now();
    if (this.runnerShutdown.isDraining()) {
      throw new Error('runner_draining_shutdown');
    }
    let skillId: string | null = params.skillId ?? null;

    if (String(params.skillName ?? '').trim() === 'foundry.tool_catalog') {
      const snapshots = await this.registry.getToolSnapshotsDynamic(params.companyId, params.agentId);
      let filtered = snapshots;
      const capIds = params.capabilitySkillIds ?? [];
      if (capIds.length) {
        filtered = filterSnapshotsBySkillIds(filtered, capIds);
      }
      const enabledToolsets = await this.companyToolsets.getEnabledToolsets(params.companyId);
      if (enabledToolsets.length) {
        filtered = filterSnapshotsByToolsets(filtered, enabledToolsets);
      }
      const catalog = buildSkillCatalog(filtered);
      const q = String((params.args as { query?: string } | undefined)?.query ?? '')
        .trim()
        .toLowerCase();
      const skills = q
        ? catalog.filter(
            (e) =>
              e.name.toLowerCase().includes(q) ||
              String(e.description ?? '')
                .toLowerCase()
                .includes(q),
          )
        : catalog;
      const durationMs = Date.now() - started;
      return {
        result: { kind: 'tool_catalog', skills: skills.slice(0, 64) },
        durationMs,
      };
    }

    // MCP isolation: MUST be checked before any other tool execution logic (prompt-injection hard guard).
    if (this.registry.isMcpTool(params.skillName)) {
      let result: unknown;
      try {
        await this.assertTemporaryAgentProjectScope({
          companyId: params.companyId,
          agentId: params.agentId,
          projectId: params.projectId,
        });
        result = await this.executeMcpViaRunnerSandbox(params);
      } catch (e: any) {
        const durationMs = Date.now() - started;
        await this.publishExecuted(
          params,
          skillId,
          {
            ok: false,
            error: e?.message ?? String(e),
          },
          durationMs,
        );
        throw e;
      }
      const durationMs = Date.now() - started;
      const resultSummary =
        result !== null && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : { value: result };
      await this.publishExecuted(params, skillId, resultSummary, durationMs);
      await this.publishSkillBilling(params, skillId, durationMs);
      return { result, durationMs };
    }

    // Tool execution: supports `tool.<name>` bound via skills → tool bindings.
    if (this.isToolCall(params.skillName)) {
      let result: unknown;
      try {
        await this.assertTemporaryAgentProjectScope({
          companyId: params.companyId,
          agentId: params.agentId,
          projectId: params.projectId,
        });
        result = await this.executeToolViaRunnerSandbox(params);
      } catch (e: any) {
        const durationMs = Date.now() - started;
        await this.publishExecuted(
          params,
          skillId,
          {
            ok: false,
            error: e?.message ?? String(e),
          },
          durationMs,
        );
        throw e;
      }
      const durationMs = Date.now() - started;
      const resultSummary =
        result !== null && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : { value: result };
      await this.publishExecuted(params, skillId, resultSummary, durationMs);
      await this.publishSkillBilling(params, skillId, durationMs);
      return { result, durationMs };
    }
    const snapshots = await this.registry.getToolSnapshotsDynamic(params.companyId, params.agentId);
    const snap = snapshots.find((s) => s.name === params.skillName);
    if (snap) {
      skillId = snap.id;
    }
    let result: unknown;
    try {
      await this.assertTemporaryAgentProjectScope({
        companyId: params.companyId,
        agentId: params.agentId,
        projectId: params.projectId,
      });
      if (!snap) {
        // Keep existing error semantics aligned with ToolRegistry.execute.
        throw new Error(`Skill "${params.skillName}" is not bound to this agent`);
      }

      // Permission check shared across implementations.
      this.registry.assertCanExecute(snap, {
        companyId: params.companyId,
        agentId: params.agentId,
        traceId: params.traceId,
        roles: params.roles,
      });

      const snapMeta = (snap as { metadata?: Record<string, unknown> | null }).metadata;
      if (skillRequiresExecutionToken(snapMeta ?? undefined)) {
        const tok = params.executionTokenId?.trim();
        if (!tok) {
          throw new Error(
            `M4: execution token required for high-risk skill "${params.skillName}" (metadata.approvalRiskLevel L2/L3)`,
          );
        }
        await this.executionGuard.validateAndConsumeToken({
          companyId: params.companyId,
          executionTokenId: tok,
          action: `skill:${params.skillName}`,
        });
      }

      const progressive = this.config.isSkillProgressiveDisclosureEnabled();
      const expandOnCall =
        shouldExpandOnSkillNameCall(snap, { progressiveDisclosure: progressive }) && !params.forceExecute;

      if (expandOnCall) {
        const mode = params.promptSkillMode ?? 'auto';
        if (mode === 'complete') {
          const promptSkillCompletion = await this.resolvePromptSkillCompletion();
          if (!promptSkillCompletion) {
            throw new Error('prompt_skill_completion_unavailable');
          }
          result = await promptSkillCompletion.complete({ exec: params, snap });
        } else {
          result = buildSkillInstructionsPayload(snap, params.args);
        }
      } else if (snap.implementationType === 'external') {
        await this.assertExternalSkillBudgetAllowance(params, snap);
        const hc = (snap.handlerConfig ?? null) as Record<string, unknown> | null;
        const viaRunner =
          hc?.runnerSandbox === true ||
          hc?.marketplaceRunner === true ||
          process.env.WORKER_FORCE_EXTERNAL_SKILLS_VIA_RUNNER === 'true';
        if (viaRunner) {
          result = await this.executeExternalViaRunnerSandbox(params, snap);
        } else {
          result = await this.externalHttp.execute(snap, params.args, { traceId: params.traceId });
        }
      } else if (
        RUNNER_SHELL_BUILTIN_SKILLS.has(params.skillName) ||
        RUNNER_SHELL_BUILTIN_SKILLS.has(
          this.resolveBuiltinToolConfig(snap, params.skillName).builtinHandler ?? '',
        )
      ) {
        result = await this.executeBuiltinViaRunner(params, snap);
      } else {
        // builtin (default): echo 等非 shell handler
        result = await this.registry.executeDynamic(
          params.companyId,
          params.agentId,
          params.skillName,
          params.args,
          {
            companyId: params.companyId,
            agentId: params.agentId,
            traceId: params.traceId,
            roles: params.roles,
          },
        );
      }
    } catch (e: any) {
      const durationMs = Date.now() - started;
      await this.publishExecuted(params, skillId, {
        ok: false,
        error: e?.message ?? String(e),
      }, durationMs);
      throw e;
    }
    const durationMs = Date.now() - started;
    const resultSummary = this.toResultSummaryForEvent(result);
    await this.publishExecuted(params, skillId, resultSummary, durationMs);
    await this.publishSkillBilling(params, skillId, durationMs);
    return { result, durationMs };
  }

  private toResultSummaryForEvent(result: unknown): Record<string, unknown> {
    if (result !== null && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (r.kind === 'skill_instructions') {
        return {
          ok: true,
          kind: 'skill_instructions',
          skillName: r.skillName,
          expanded: true,
          truncated: r.truncated ?? false,
          boundToolsCount: Array.isArray(r.boundTools) ? r.boundTools.length : 0,
        };
      }
      return r;
    }
    return { value: result };
  }

  /**
   * Phase 3.5：主群定向 Agent 直连发言执行入口（具体模型调用由 Collaboration 注册的 delegate 完成）。
   */
  async executeDirect(
    params: ExecuteDirectCollabHandoverParams,
  ): Promise<import('../direct-collab-reply-delegate.js').DirectCollabGeneratedReply | null> {
    if (!this.directCollabReply) {
      this.logger.warn({
        msg: 'execute_direct_delegate_unavailable',
        companyId: params.companyId,
        agentId: params.agentId,
      });
      return null;
    }
    return this.directCollabReply.executeDirect(params);
  }

  private async publishExecuted(
    params: ExecuteSkillParams,
    skillId: string | null,
    resultSummary: Record<string, unknown>,
    durationMs: number,
  ): Promise<void> {
    const event: SkillExecutedEvent = {
      eventId: randomUUID(),
      eventType: 'skill.executed',
      aggregateId: skillId ?? params.skillName,
      aggregateType: 'skill',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        agentId: params.agentId,
        skillId,
        skillName: params.skillName,
        traceId: params.traceId,
        argsSummary: params.args,
        resultSummary,
        durationMs,
        billingUnits: null,
        executedAt: new Date().toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
  }
}
