import { Injectable } from '@nestjs/common';
import { BatchRecruitDto } from '../dto/batch-recruit.dto.js';
import { CreateAgentDto } from '../dto/create-agent.dto.js';
import { RecruitTemplateDto } from '../dto/recruit-template.dto.js';
import { Agent } from '../entities/agent.entity.js';
import { AgentsService } from './agents.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class AgentRecruiterService {
  constructor(private readonly agentsService: AgentsService) {}

  recruitOne(dto: CreateAgentDto, actor: Actor): Promise<Agent> {
    return this.agentsService.create(dto, actor);
  }

  recruitFromTemplate(
    organizationNodeId: string,
    template: RecruitTemplateDto,
    actor: Actor,
  ): Promise<Agent> {
    return this.agentsService.recruitFromTemplate(organizationNodeId, template, actor);
  }

  batchRecruit(dto: BatchRecruitDto, actor: Actor): Promise<Agent[]> {
    return this.agentsService.batchRecruit(dto, actor);
  }
}
