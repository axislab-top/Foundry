import { Injectable } from '@nestjs/common';
import type { AgentSkillsChangedEvent } from '@contracts/events';
import { ToolRegistry } from '@service/ai';
import { registerBuiltinSkillHandlers } from '../tools/register-builtins.js';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * LangGraph / execution 接入：刷新 ToolRegistry；内置 handler 在构造时注册。
 */
export interface AiRuntimeAdapter {
  onAgentEvent(eventType: string, payload: Record<string, unknown>): Promise<void>;
  onOrganizationNodeMoved(payload: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class SkillAwareAiRuntimeAdapter implements AiRuntimeAdapter {
  constructor(
    private readonly registry: ToolRegistry,
    config: ConfigService,
  ) {
    registerBuiltinSkillHandlers(registry, {
      allowUnsafeStubs: config.getWorkerAllowUnsafeSkillStubs(),
    });
  }

  async onAgentEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    if (eventType === 'agent.skills.changed') {
      const data = payload.data as AgentSkillsChangedEvent['data'] | undefined;
      if (data?.companyId && data.agentId && data.skills) {
        this.registry.setAgentTools(data.companyId, data.agentId, data.skills);
      }
    }
  }

  async onOrganizationNodeMoved(_payload: Record<string, unknown>): Promise<void> {
    // 后续：失效 org-tree 缓存或刷新继承 Skills
  }
}
