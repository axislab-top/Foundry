import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { validateRpcDto } from '../common/rpc-validation.js';
import { CommandPolicyEngine } from '../policy/command-policy.engine.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { ExecutionService } from '../execution/execution.service.js';
import {
  RunnerExecuteDto,
  RunnerPolicyEvaluateDto,
  RunnerSpaceEnsureDto,
} from './runner-dto.js';

/**
 * 任何业务模块不得绕过本控制器向宿主机或 Worker 容器下发命令；
 * 新增执行能力只能扩展本 RPC 与 ExecutionService。
 */
@Controller()
export class RunnerRpcController {
  private readonly logger = new Logger(RunnerRpcController.name);

  constructor(
    private readonly sandbox: SandboxService,
    private readonly policy: CommandPolicyEngine,
    private readonly execution: ExecutionService,
  ) {}

  @MessagePattern('runner.space.ensure')
  async spaceEnsure(@Payload() payload: unknown) {
    const dto = validateRpcDto(RunnerSpaceEnsureDto, payload);
    this.logger.debug({ pattern: 'runner.space.ensure', companyId: dto.companyId });
    const space = await this.sandbox.getOrCreateSpace(
      dto.companyId,
      dto.persistent ?? true,
    );
    return {
      sandboxId: space.sandboxId,
      pvcName: space.pvcName,
      namespace: space.namespace,
    };
  }

  @MessagePattern('runner.policy.evaluate')
  async policyEvaluate(@Payload() payload: unknown) {
    const dto = validateRpcDto(RunnerPolicyEvaluateDto, payload);
    return this.policy.evaluate(dto.commandLine);
  }

  @MessagePattern('runner.execute')
  async execute(@Payload() payload: unknown) {
    const dto = validateRpcDto(RunnerExecuteDto, payload);
    return this.execution.execute(dto);
  }
}
