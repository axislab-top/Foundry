import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEPT_PIPELINE_KIND,
  type DeptPipelineChildMetadata,
  type DeptTaskPipelineParentMetadata,
} from '@contracts/types';
import { Agent } from '../../agents/entities/agent.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import type { Actor } from '../../../common/types/user.types.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { Task } from '../entities/task.entity.js';
import { TaskDependency } from '../entities/task-dependency.entity.js';
import { TasksService } from './tasks.service.js';
import { TaskDistributionPlannerService } from './task-distribution-planner.service.js';

export type PipelineStepInput = {
  title: string;
  description?: string;
  expectedOutput?: string;
  assigneeType: 'agent' | 'organization_node';
  assigneeId: string;
};

@Injectable()
export class DepartmentTaskPipelineService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskDistributionPlanner: TaskDistributionPlannerService,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(TaskDependency) private readonly taskDepsRepo: Repository<TaskDependency>,
    @InjectRepository(Agent) private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNode) private readonly nodesRepo: Repository<OrganizationNode>,
  ) {}

  async assertOwnerOrAdminPipelineManager(companyId: string, actor: Actor): Promise<void> {
    await this.tasksService.assertCanManageDepartmentPipeline(companyId, actor);
  }

  /**
   * 在已存在的父任务下创建串行子任务链并写入 deptPipeline 元数据。
   */
  async createSequentialPipeline(
    companyId: string,
    actor: Actor,
    input: {
      parentTaskId: string;
      departmentOrganizationNodeId: string;
      requireCeoSupervision: boolean;
      steps: PipelineStepInput[];
      program?: DeptTaskPipelineParentMetadata['program'];
    },
  ): Promise<{ parent: Record<string, unknown>; childIds: string[] }> {
    await this.assertOwnerOrAdminPipelineManager(companyId, actor);
    if (!input.steps?.length) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'steps 不能为空' });
    }
    const parent = await this.tasksRepo.findOne({
      where: { id: input.parentTaskId, companyId },
    });
    if (!parent) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '父任务不存在' });
    }
    const node = await this.nodesRepo.findOne({
      where: { id: input.departmentOrganizationNodeId, companyId },
    });
    if (!node || node.type !== 'department') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'departmentOrganizationNodeId 必须是本公司部门节点',
      });
    }

    const deptPipeline: DeptTaskPipelineParentMetadata = {
      kind: DEPT_PIPELINE_KIND,
      departmentOrganizationNodeId: input.departmentOrganizationNodeId,
      requireCeoSupervision: input.requireCeoSupervision,
      supervision: { state: 'idle' },
      program: input.program,
    };
    parent.metadata = { ...(parent.metadata ?? {}), deptPipeline };
    await this.tasksRepo.save(parent);

    const director = await this.agentsRepo.findOne({
      where: {
        companyId,
        role: 'director',
        status: 'active',
        organizationNodeId: input.departmentOrganizationNodeId,
      } as any,
    });
    if (!director) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '目标部门未找到 active director Agent',
      });
    }

    const planned = this.taskDistributionPlanner.buildDepartmentDistributions({
      parentTaskId: parent.id,
      parentTitle: parent.title,
      departmentRoomId: input.departmentOrganizationNodeId,
      directorAgentId: director.id,
      doneConditions: [],
      priority: parent.priority,
      dueDate: parent.dueDate ? parent.dueDate.toISOString() : null,
    });

    const childIds: string[] = [];
    for (let i = 0; i < planned.length; i += 1) {
      const item = planned[i]!;
      const meta: DeptPipelineChildMetadata = {
        pipelineRole: 'employee_step',
        plannedDistribution: {
          parentTaskId: parent.id,
          distributionPlanTaskId: item.distributionPlanTaskId ?? null,
          executionProfile: item.executionProfile ?? null,
        },
      };
      const created = await this.tasksService.create(
        {
          parentId: parent.id,
          title: item.title,
          description: item.description ?? undefined,
          expectedOutput: item.doneConditions?.join('；') || item.description,
          assigneeType: 'agent',
          assigneeId: item.directorAgentId,
          dependsOnTaskIds: item.distributionDependsOnTaskIds?.length ? item.distributionDependsOnTaskIds : undefined,
          metadata: meta as unknown as Record<string, unknown>,
        },
        actor,
        { trustedInternal: true, source: 'bootstrap' },
      );
      const id = String((created as { id?: string }).id ?? '');
      if (!id) throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '子任务创建失败' });
      childIds.push(id);
    }

    const firstId = childIds[0]!;
    await this.tasksService.updateProgress(
      firstId,
      { status: 'in_progress', progress: 0 },
      actor,
    );

    return { parent: (await this.tasksService.findOne(parent.id, actor)) as Record<string, unknown>, childIds };
  }

  /**
   * 插入跨部门 handoff 子任务，并把 successor 的前置依赖从 predecessor 改为依赖 handoff。
   */
  async createCrossDepartmentHandoff(
    companyId: string,
    actor: Actor,
    input: {
      parentTaskId: string;
      predecessorTaskId: string;
      successorTaskId: string;
      targetOrganizationNodeId: string;
      title: string;
      description?: string;
      requestingDirectorAgentId?: string;
    },
  ): Promise<{ handoffTaskId: string }> {
    await this.assertOwnerOrAdminPipelineManager(companyId, actor);
    if (input.predecessorTaskId === input.successorTaskId) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'predecessor 与 successor 不能相同' });
    }
    if (input.targetOrganizationNodeId === (await this.getParentDeptNodeId(companyId, input.parentTaskId))) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '不能向本部门节点发 handoff' });
    }
    const parent = await this.tasksRepo.findOne({ where: { id: input.parentTaskId, companyId } });
    if (!parent) throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '父任务不存在' });
    const dp = parent.metadata?.deptPipeline as DeptTaskPipelineParentMetadata | undefined;
    if (dp?.kind !== DEPT_PIPELINE_KIND) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '父任务未启用部门编排元数据' });
    }

    const targetNode = await this.nodesRepo.findOne({
      where: { id: input.targetOrganizationNodeId, companyId },
    });
    if (!targetNode || targetNode.type !== 'department') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '目标必须是部门组织节点' });
    }
    const director = await this.agentsRepo.findOne({
      where: {
        companyId,
        role: 'director',
        status: 'active',
        organizationNodeId: input.targetOrganizationNodeId,
      } as any,
    });
    if (!director) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '目标部门未找到 active director Agent',
      });
    }

    const predEdge = await this.taskDepsRepo.findOne({
      where: {
        companyId,
        taskId: input.successorTaskId,
        dependsOnTaskId: input.predecessorTaskId,
      },
    });
    if (!predEdge) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '未找到 successor→predecessor 依赖边，无法插入 handoff',
      });
    }

    const childMeta: DeptPipelineChildMetadata = {
      pipelineRole: 'cross_department_handoff',
      handoff: {
        targetOrganizationNodeId: input.targetOrganizationNodeId,
        requestingDirectorAgentId: input.requestingDirectorAgentId,
        returnSummaryRequired: true,
      },
    };

    const handoffRow = await this.tasksService.create(
      {
        parentId: parent.id,
        title: input.title,
        description: input.description,
        assigneeType: 'agent',
        assigneeId: director.id,
        dependsOnTaskIds: [input.predecessorTaskId],
        metadata: childMeta as unknown as Record<string, unknown>,
      },
      actor,
      { trustedInternal: true, source: 'bootstrap' },
    );
    const handoffTaskId = String((handoffRow as { id?: string }).id ?? '');
    if (!handoffTaskId) throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'handoff 创建失败' });

    await this.taskDepsRepo.delete({
      companyId,
      taskId: input.successorTaskId,
      dependsOnTaskId: input.predecessorTaskId,
    });
    await this.taskDepsRepo.insert({
      companyId,
      taskId: input.successorTaskId,
      dependsOnTaskId: handoffTaskId,
    });

    return { handoffTaskId };
  }

  private async getParentDeptNodeId(companyId: string, parentTaskId: string): Promise<string | null> {
    const parent = await this.tasksRepo.findOne({ where: { id: parentTaskId, companyId } });
    const dp = parent?.metadata?.deptPipeline as DeptTaskPipelineParentMetadata | undefined;
    return dp?.departmentOrganizationNodeId ?? null;
  }
}
