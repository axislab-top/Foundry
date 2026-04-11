import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { RUNNER_EXEC_ACTION } from '../constants/runner.constants.js';
import { CommandPolicyEngine } from '../policy/command-policy.engine.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { GvisorJobRunner } from '../runtime/gvisor-job.runner.js';
import type { RunnerExecuteDto } from '../rpc/runner-dto.js';

/**
 * **禁止在本进程内对用户输入使用 `child_process` / `spawn` / `exec`；**
 * 用户命令只能经 `GvisorJobRunner` 落为 Kubernetes Job（mock 模式下仅记录合成 jobName）。
 * 任何业务不得绕过 `RunnerRpcController` / `ExecutionService` 向宿主机或 Worker 进程注入 shell。
 *
 * ---
 * **审批令牌（executionToken）与 `needsApproval` 流程**
 *
 * 1. `CommandPolicyEngine.evaluate` 若返回 `decision === 'needsApproval'`，说明命令在 allowlist 上但带高危参数，
 *    或属于高危模式；此时 **不得** 直接创建 Job。
 * 2. **令牌从哪里来**：调用方（通常为 API `ApprovalModule` 或上游编排）先创建审批请求，用户批准后签发 **一次性**
 *    execution token（API 侧记录 `tokenId`）。RPC 调用 `runner.execute` 时必须在 DTO 中携带 `executionTokenId`（UUID）。
 *    该 token 的 `action` 必须与 `RUNNER_EXEC_ACTION`（`runner.exec`）一致，否则 API 侧会拒绝消费。
 * 3. **Runner 内消费**：`consumeExecutionToken` 通过 `API_RPC_CLIENT` 向 `api-rpc-queue` 发送
 *    `approval.consumeExecutionToken`，payload 含 `actor`（默认可用 `RUNNER_SYSTEM_ACTOR_ID`）、`companyId`、
 *    `tokenId`、`action: runner.exec`。
 * 4. **成功**：`firstValueFrom` 正常返回后，认为该次执行已获授权，继续 `getOrCreateSpace` → `runCommand`。
 * 5. **失败**：RPC 抛错或超时被捕获，包装为 `RpcException`（403，`execution_token_rejected: ...`），**不**创建 Job。
 * 6. 若策略为 `needsApproval` 但 **未** 传 `executionTokenId`，直接 `RpcException`（403，`command_requires_approval_token`），
 *    不调用 API。
 */
@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly policy: CommandPolicyEngine,
    private readonly sandbox: SandboxService,
    private readonly jobs: GvisorJobRunner,
    private readonly config: ConfigService,
    @Optional() @Inject('API_RPC_CLIENT') private readonly apiRpc?: ClientProxy,
  ) {}

  async execute(dto: RunnerExecuteDto) {
    const policyResult = this.policy.evaluate(dto.commandLine);
    this.logger.log({
      policyDecisionId: policyResult.policyDecisionId,
      decision: policyResult.decision,
      companyId: dto.companyId,
      runId: dto.runId,
    });

    if (policyResult.decision === 'deny') {
      throw new RpcException({
        status: 403,
        message: policyResult.reason ?? 'command_denied',
        policyDecisionId: policyResult.policyDecisionId,
      });
    }

    if (policyResult.decision === 'needsApproval') {
      if (!dto.executionTokenId?.trim()) {
        throw new RpcException({
          status: 403,
          message:
            'command_requires_approval_token: create approval with action runner.exec then pass executionTokenId',
          policyDecisionId: policyResult.policyDecisionId,
        });
      }
      await this.consumeExecutionToken(dto);
    }

    const space = await this.sandbox.getOrCreateSpace(
      dto.companyId,
      dto.persistent ?? true,
    );

    const job = await this.jobs.runCommand({
      companyId: dto.companyId,
      runId: dto.runId,
      commandLine: dto.commandLine,
      pvcName: space.pvcName,
      namespace: space.namespace,
    });

    return {
      ok: true as const,
      policyDecisionId: policyResult.policyDecisionId,
      sandboxId: space.sandboxId,
      jobName: job.jobName,
      namespace: job.namespace,
      mode: job.mode,
    };
  }

  private async consumeExecutionToken(dto: RunnerExecuteDto): Promise<void> {
    if (!this.apiRpc) {
      throw new RpcException({
        status: 500,
        message: 'API_RPC_CLIENT not configured; cannot consume execution token',
      });
    }
    const systemActorId = this.config.get<string>('RUNNER_SYSTEM_ACTOR_ID');
    const actor = dto.actor ?? { id: systemActorId, roles: ['system'] };
    try {
      await firstValueFrom(
        this.apiRpc
          .send('approval.consumeExecutionToken', {
            actor,
            companyId: dto.companyId,
            tokenId: dto.executionTokenId,
            action: RUNNER_EXEC_ACTION,
          })
          .pipe(timeout(30_000)),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn({ msg: 'consume_token_failed', error: msg });
      throw new RpcException({
        status: 403,
        message: `execution_token_rejected: ${msg}`,
      });
    }
  }
}
