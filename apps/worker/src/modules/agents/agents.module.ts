import { Module } from '@nestjs/common';
import { ToolRegistry } from '@service/ai';
import { ConfigModule } from '../../common/config/config.module.js';
import { SkillAwareAiRuntimeAdapter } from './adapters/ai-runtime.adapter.js';
import { AgentEventsListener } from './listeners/agent-events.listener.js';
import { OrganizationNodeMovedAgentsListener } from './listeners/organization-node-moved.listener.js';
import { AgentExecutionService } from './services/agent-execution.service.js';
import { ExternalHttpSkillRunnerService } from './services/external-http-skill-runner.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    ToolRegistry,
    ExternalHttpSkillRunnerService,
    AgentExecutionService,
    SkillAwareAiRuntimeAdapter,
    AgentEventsListener,
    OrganizationNodeMovedAgentsListener,
  ],
  exports: [ToolRegistry, AgentExecutionService, SkillAwareAiRuntimeAdapter],
})
export class AgentsModule {}
