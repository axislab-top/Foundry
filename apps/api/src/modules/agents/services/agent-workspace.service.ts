import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { Task } from '../../tasks/entities/task.entity.js';
import { Agent } from '../entities/agent.entity.js';

export type AgentWorkspaceStepDto = {
  id: string;
  title: string;
  status: string;
  progress: number;
  assigneeId: string | null;
  updatedAt: string;
};

export type AgentWorkspacePrimaryTaskDto = {
  id: string;
  title: string;
  status: string;
  progress: number;
  blockedReason: string | null;
  updatedAt: string;
  steps: AgentWorkspaceStepDto[];
};

export type AgentWorkspaceDto = {
  agent: {
    id: string;
    name: string;
    role: string;
    status: string;
    organizationNodeId: string | null;
    expertise: string | null;
    avatarUrl: string | null;
  };
  primaryTask: AgentWorkspacePrimaryTaskDto | null;
};

const ACTIVE_WORK_STATUSES = [
  'in_progress',
  'review',
  'awaiting_approval',
  'awaiting_supervision',
  'blocked',
  'paused',
] as const;

@Injectable()
export class AgentWorkspaceService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
  ) {}

  async getWorkspace(companyId: string, agentId: string): Promise<AgentWorkspaceDto> {
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Agent 不存在',
      });
    }

    const primary = await this.tasksRepo
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .andWhere('t.assignee_type = :assigneeType', { assigneeType: 'agent' })
      .andWhere('t.assignee_id = :agentId', { agentId })
      .andWhere('t.status IN (:...statuses)', { statuses: [...ACTIVE_WORK_STATUSES] })
      .orderBy('t.updated_at', 'DESC')
      .getOne();

    let primaryTask: AgentWorkspacePrimaryTaskDto | null = null;
    if (primary) {
      const children = await this.tasksRepo.find({
        where: { companyId, parentId: primary.id },
        order: { createdAt: 'ASC' },
      });
      primaryTask = {
        id: primary.id,
        title: primary.title,
        status: primary.status,
        progress: primary.progress,
        blockedReason: primary.blockedReason,
        updatedAt: primary.updatedAt.toISOString(),
        steps: children.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          progress: c.progress,
          assigneeId: c.assigneeId,
          updatedAt: c.updatedAt.toISOString(),
        })),
      };
    }

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        organizationNodeId: agent.organizationNodeId,
        expertise: agent.expertise,
        avatarUrl: agent.avatarUrl,
      },
      primaryTask,
    };
  }
}
