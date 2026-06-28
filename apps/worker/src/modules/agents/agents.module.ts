import { forwardRef, Module } from '@nestjs/common';
import { ToolRegistry } from '@service/ai';
import { ConfigModule } from '../../common/config/config.module.js';
import { SkillAwareAiRuntimeAdapter } from './adapters/ai-runtime.adapter.js';
import { AgentEventsListener } from './listeners/agent-events.listener.js';
import { OrganizationNodeMovedAgentsListener } from './listeners/organization-node-moved.listener.js';
import { AgentExecutionService } from './services/agent-execution.service.js';
import { PromptSkillCompletionService } from './services/prompt-skill-completion.service.js';
import { CompanyToolsetResolverService } from './services/company-toolset-resolver.service.js';
import { ExternalHttpSkillRunnerService } from './services/external-http-skill-runner.service.js';
import { ExecutionGuardService } from '../approval/execution-guard.service.js';
import { RunnerGracefulShutdownService } from './services/runner-graceful-shutdown.service.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';

@Module({
  imports: [ConfigModule, forwardRef(() => CollaborationModule)],
  providers: [
    ToolRegistry,
    ExternalHttpSkillRunnerService,
    ExecutionGuardService,
    RunnerGracefulShutdownService,
    AgentExecutionService,
    CompanyToolsetResolverService,
    PromptSkillCompletionService,
    SkillAwareAiRuntimeAdapter,
    AgentEventsListener,
    OrganizationNodeMovedAgentsListener,
  ],
  exports: [
    ToolRegistry,
    AgentExecutionService,
    CompanyToolsetResolverService,
    SkillAwareAiRuntimeAdapter,
    ExecutionGuardService,
  ],
})
export class AgentsModule {}
