import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../config/config.service.js';

/** Payload aligned with apps/runner `RunnerExecuteDto` / `runner.execute`. */
export interface RunnerExecuteInput {
  companyId: string;
  runId: string;
  commandLine: string;
  executionTokenId?: string;
  persistent?: boolean;
  actor?: { id: string; roles?: string[] };
  skillSlug?: string;
  securityProfile?: string;
  /** 与 Runner OTel `foundry.skill_execution_id` 对齐；省略则由 Runner 生成 */
  skillExecutionId?: string;
  governance?: {
    timeoutSeconds?: number;
    maxInputSizeBytes?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    chunkStrategy?: 'none' | 'fixed' | 'semantic';
  };
}

export interface RunnerExecuteResult {
  ok: true;
  policyDecisionId: string;
  sandboxId: string;
  jobName: string;
  namespace: string;
  mode: 'mock' | 'kubernetes';
  /** Sprint 3：混合路由决策（Runner 返回） */
  hybridRouting?: { tier: string; runtimeClassName: string; reason: string };
  volumeSnapshots?: { pre?: string; post?: string };
  /** `runner.skill.execute` 返回，用于 OTel / 审计关联 */
  skillExecutionId?: string;
}

/**
 * P8.1：统一 Worker → apps/runner 的 `runner.execute` 调用。
 * 不重试（命令非幂等）；超时由 WORKER_RUNNER_EXECUTE_TIMEOUT_MS 控制。
 */
@Injectable()
export class RunnerExecutionClient {
  private readonly logger = new Logger(RunnerExecutionClient.name);

  constructor(
    @Inject('RUNNER_RPC_CLIENT') private readonly runner: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  async execute(input: RunnerExecuteInput): Promise<RunnerExecuteResult> {
    const ms = this.config.getRunnerExecuteTimeoutMs();
    const payload = {
      companyId: input.companyId,
      runId: input.runId,
      commandLine: input.commandLine,
      executionTokenId: input.executionTokenId?.trim() || undefined,
      persistent: input.persistent ?? true,
      actor: input.actor,
      skillSlug: input.skillSlug,
      securityProfile: input.securityProfile,
      skillExecutionId: input.skillExecutionId?.trim() || undefined,
      governance: input.governance,
      timeoutSeconds: (input as any).timeoutSeconds,
      maxInputSizeBytes: (input as any).maxInputSizeBytes,
      maxInputTokens: (input as any).maxInputTokens,
      maxOutputTokens: (input as any).maxOutputTokens,
      chunkStrategy: (input as any).chunkStrategy,
    };
    try {
      const result = await firstValueFrom(
        this.runner.send<RunnerExecuteResult>('runner.execute', payload).pipe(timeout(ms)),
      );
      if (!result?.ok) {
        throw new Error('runner.execute returned unexpected payload');
      }
      return result;
    } catch (e: unknown) {
      const msg = this.extractErrorMessage(e);
      this.logger.warn({ msg: 'runner_execute_failed', companyId: input.companyId, runId: input.runId, error: msg });
      throw new Error(`runner.execute failed: ${msg}`);
    }
  }

  /**
   * P10：Shell 类 Skill 经 `runner.skill.execute`（与 `runner.execute` 等价策略链，便于审计按 skill 维度过滤）。
   */
  async executeSkill(input: RunnerExecuteInput & { skillSlug: string }): Promise<RunnerExecuteResult> {
    const ms = this.config.getRunnerExecuteTimeoutMs();
    const payload = {
      companyId: input.companyId,
      runId: input.runId,
      commandLine: input.commandLine,
      executionTokenId: input.executionTokenId?.trim() || undefined,
      persistent: input.persistent ?? true,
      actor: input.actor,
      skillSlug: input.skillSlug,
      securityProfile: input.securityProfile,
      skillExecutionId: input.skillExecutionId?.trim() || undefined,
      departmentSlug: (input as any).departmentSlug,
      headAgentId: (input as any).headAgentId,
      requirePreSnapshot: (input as any).requirePreSnapshot,
      requirePostSnapshot: (input as any).requirePostSnapshot,
      governance: input.governance,
      timeoutSeconds: (input as any).timeoutSeconds,
      maxInputSizeBytes: (input as any).maxInputSizeBytes,
      maxInputTokens: (input as any).maxInputTokens,
      maxOutputTokens: (input as any).maxOutputTokens,
      chunkStrategy: (input as any).chunkStrategy,
    };
    try {
      const result = await firstValueFrom(
        this.runner.send<RunnerExecuteResult>('runner.skill.execute', payload).pipe(timeout(ms)),
      );
      if (!result?.ok) {
        throw new Error('runner.skill.execute returned unexpected payload');
      }
      return result;
    } catch (e: unknown) {
      const msg = this.extractErrorMessage(e);
      this.logger.warn({
        msg: 'runner_skill_execute_failed',
        companyId: input.companyId,
        runId: input.runId,
        skillSlug: input.skillSlug,
        error: msg,
      });
      throw new Error(`runner.skill.execute failed: ${msg}`);
    }
  }

  /** Sprint 3.2：商城 HTTP Skill → apps/runner `runner.skillSandbox.invokeHttp`（Job 内 wget）。 */
  async invokeSkillSandboxHttp(input: {
    companyId: string;
    runId: string;
    url: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
    actor?: { id: string; roles?: string[] };
    timeoutSeconds?: number;
    maxInputSizeBytes?: number;
    governance?: { timeoutSeconds?: number; maxInputSizeBytes?: number };
  }): Promise<{
    ok: true;
    jobName: string;
    namespace: string;
    mode: 'mock' | 'kubernetes';
    note: string;
  }> {
    const ms = this.config.getRunnerExecuteTimeoutMs();
    const payload = {
      companyId: input.companyId,
      runId: input.runId,
      url: input.url,
      method: input.method,
      body: input.body,
      actor: input.actor,
      governance: input.governance,
      timeoutSeconds: input.timeoutSeconds,
      maxInputSizeBytes: input.maxInputSizeBytes,
    };
    try {
      const result = await firstValueFrom(
        this.runner
          .send<{
            ok: true;
            jobName: string;
            namespace: string;
            mode: 'mock' | 'kubernetes';
            note: string;
          }>('runner.skillSandbox.invokeHttp', payload)
          .pipe(timeout(ms)),
      );
      if (!result?.ok) {
        throw new Error('runner.skillSandbox.invokeHttp returned unexpected payload');
      }
      return result;
    } catch (e: unknown) {
      const msg = this.extractErrorMessage(e);
      this.logger.warn({
        msg: 'runner_skill_sandbox_failed',
        companyId: input.companyId,
        runId: input.runId,
        error: msg,
      });
      throw new Error(`runner.skillSandbox.invokeHttp failed: ${msg}`);
    }
  }

  /**
   * Sprint 2 P9（调整版）：MCP Tool 执行（强制走 Runner 隔离 + 快照 + billing）。
   *
   * 注意：此接口是“能力路由”专用，避免业务直接复用 skillSandbox.invokeHttp（该入口不含快照/安全档位语义）。
   */
  async executeMcpJob(input: {
    companyId: string;
    runId: string;
    toolName: string;
    securityProfile?: string;
    url: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
    actor?: { id: string; roles?: string[] };
    departmentSlug?: string;
    headAgentId?: string;
    requireSnapshot?: boolean;
    timeoutSeconds?: number;
    maxInputSizeBytes?: number;
    governance?: { timeoutSeconds?: number; maxInputSizeBytes?: number };
  }): Promise<{
    ok: true;
    jobName: string;
    namespace: string;
    mode: 'mock' | 'kubernetes';
    note: string;
    volumeSnapshots?: { pre?: string; post?: string };
  }> {
    const ms = this.config.getRunnerExecuteTimeoutMs();
    const payload = {
      companyId: input.companyId,
      runId: input.runId,
      toolName: input.toolName,
      securityProfile: input.securityProfile,
      url: input.url,
      method: input.method,
      body: input.body,
      actor: input.actor,
      departmentSlug: input.departmentSlug,
      headAgentId: input.headAgentId,
      requireSnapshot: input.requireSnapshot,
      governance: input.governance,
      timeoutSeconds: input.timeoutSeconds,
      maxInputSizeBytes: input.maxInputSizeBytes,
    };
    try {
      const result = await firstValueFrom(
        this.runner
          .send<{
            ok: true;
            jobName: string;
            namespace: string;
            mode: 'mock' | 'kubernetes';
            note: string;
            volumeSnapshots?: { pre?: string; post?: string };
          }>('runner.mcp.execute', payload)
          .pipe(timeout(ms)),
      );
      if (!result?.ok) {
        throw new Error('runner.mcp.execute returned unexpected payload');
      }
      return result;
    } catch (e: unknown) {
      const msg = this.extractErrorMessage(e);
      this.logger.warn({
        msg: 'runner_mcp_execute_failed',
        companyId: input.companyId,
        runId: input.runId,
        toolName: input.toolName,
        error: msg,
      });
      throw new Error(`runner.mcp.execute failed: ${msg}`);
    }
  }

  private extractErrorMessage(e: unknown): string {
    if (e instanceof RpcException) {
      const err = e.getError();
      if (typeof err === 'string') return err;
      if (err && typeof err === 'object' && 'message' in err) {
        return String((err as { message: unknown }).message);
      }
    }
    if (e && typeof e === 'object' && 'message' in e) {
      return String((e as { message: unknown }).message);
    }
    return String(e);
  }
}
