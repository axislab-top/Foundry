import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { runnerEnvSchema } from './config/runner-env.schema.js';
import { ApiRpcClientModule } from './clients/api-rpc.client.module.js';
import { HealthController } from './health/health.controller.js';
import { RunnerRpcController } from './rpc/runner.rpc.controller.js';
import { CommandPolicyEngine } from './policy/command-policy.engine.js';
import { SandboxService } from './sandbox/sandbox.service.js';
import { GvisorJobRunner } from './runtime/gvisor-job.runner.js';
import { ExecutionService } from './execution/execution.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const { error, value } = runnerEnvSchema.validate(config, {
          allowUnknown: true,
          stripUnknown: false,
        });
        if (error) {
          throw error;
        }
        return value;
      },
    }),
    ApiRpcClientModule,
  ],
  controllers: [HealthController, RunnerRpcController],
  providers: [
    CommandPolicyEngine,
    SandboxService,
    GvisorJobRunner,
    ExecutionService,
  ],
})
export class AppModule {}
