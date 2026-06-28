import { Injectable } from '@nestjs/common';

export type GovernanceSummaryAudience = 'supervisor' | 'director' | 'ceo';

export interface GovernanceSummaryItem {
  taskId: string;
  status: string;
  progress: number | null;
  blockedReason?: string | null;
  reportFlow: string;
  visibilityScope: 'department' | 'executive';
}

@Injectable()
export class TaskGovernanceSummaryService {
  buildSummary(params: {
    audience: GovernanceSummaryAudience;
    items: GovernanceSummaryItem[];
  }): string {
    const title =
      params.audience === 'ceo'
        ? '【公司级任务治理摘要】'
        : params.audience === 'director'
          ? '【部门任务治理摘要】'
          : '【主管任务治理摘要】';

    if (params.items.length === 0) {
      return `${title} 暂无需要关注的任务。`;
    }

    const lines = params.items.slice(0, 10).map((item) => {
      const progress = item.progress == null ? '未知进度' : `${item.progress}%`;
      const blocked = item.blockedReason ? `，阻塞：${item.blockedReason}` : '';
      return `- 任务 ${item.taskId}｜状态 ${item.status}｜进度 ${progress}｜流程 ${item.reportFlow}${blocked}`;
    });

    return [title, ...lines].join('\n');
  }
}
