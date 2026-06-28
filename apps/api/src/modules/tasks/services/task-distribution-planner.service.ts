import { Injectable } from '@nestjs/common';

export interface PlannedTaskDistributionItem {
  title: string;
  departmentRoomId: string;
  directorAgentId: string;
  description?: string | null;
  doneConditions?: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string | null;
  executionProfile?: 'solo_director' | 'director_delegates' | 'employee' | null;
  distributionPlanTaskId?: string | null;
  distributionDependsOnTaskIds?: string[];
}

@Injectable()
export class TaskDistributionPlannerService {
  buildDepartmentDistributions(params: {
    parentTaskId: string;
    parentTitle: string;
    departmentRoomId: string;
    directorAgentId: string;
    doneConditions?: string[];
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    dueDate?: string | null;
  }): PlannedTaskDistributionItem[] {
    const doneConditions = (params.doneConditions ?? []).filter((x) => typeof x === 'string' && x.trim());
    const titleBase = params.parentTitle.trim() || '部门任务';
    const planTaskId = `${params.parentTaskId}:plan`;
    const executeTaskId = `${params.parentTaskId}:execute`;
    const reviewTaskId = `${params.parentTaskId}:review`;
    return [
      {
        title: `${titleBase} · 方案拆解`,
        departmentRoomId: params.departmentRoomId,
        directorAgentId: params.directorAgentId,
        description: '由部门主管先完成任务拆解与分工，输出可执行方案。',
        doneConditions: [
          '拆解目标与范围',
          '明确负责人分工',
          '确认关键依赖与风险',
          ...doneConditions,
        ],
        priority: params.priority ?? 'normal',
        dueDate: params.dueDate ?? null,
        executionProfile: 'director_delegates',
        distributionPlanTaskId: planTaskId,
        distributionDependsOnTaskIds: [],
      },
      {
        title: `${titleBase} · 执行推进`,
        departmentRoomId: params.departmentRoomId,
        directorAgentId: params.directorAgentId,
        description: '根据拆解方案推进执行并协调员工任务。',
        doneConditions: ['员工任务已分发', '核心阻塞已处理', '执行状态可追踪'],
        priority: params.priority ?? 'normal',
        dueDate: params.dueDate ?? null,
        executionProfile: 'employee',
        distributionPlanTaskId: executeTaskId,
        distributionDependsOnTaskIds: [planTaskId],
      },
      {
        title: `${titleBase} · 复盘验收`,
        departmentRoomId: params.departmentRoomId,
        directorAgentId: params.directorAgentId,
        description: '对本轮部门任务进行复盘、验收和升级汇报。',
        doneConditions: ['完成结果验收', '风险与经验沉淀', '向上汇报已完成'],
        priority: params.priority ?? 'normal',
        dueDate: params.dueDate ?? null,
        executionProfile: 'solo_director',
        distributionPlanTaskId: reviewTaskId,
        distributionDependsOnTaskIds: [executeTaskId],
      },
    ];
  }
}
