import type { TaskEntity } from '../../services/tasksApi';

/** 任务完成率：completed / 全部状态任务数（含 cancelled 仍计入分母，与「完成占比」常见定义一致可改为排除 cancelled） */
export function computeTaskCompletionPercent(byStatus: Record<string, number>): number {
  const completed = byStatus.completed ?? 0;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
}

export interface DepartmentLoadBar {
  organizationNodeId: string;
  name: string;
  activeTasks: number;
  /** 相对最高负载的百分比，用于柱高（全 0 时仍保留最小可视高度） */
  heightPct: number;
}

/** 部门任务负载 → 带名称的柱状数据（与 `/v1/dashboard` 的 departmentLoad 对齐） */
export function departmentLoadToBars(
  load: Array<{ organizationNodeId: string; name?: string; activeTasks: number }>,
): DepartmentLoadBar[] {
  if (load.length === 0) {
    return [];
  }
  const max = Math.max(...load.map((d) => d.activeTasks), 1);
  return load.map((d) => ({
    organizationNodeId: d.organizationNodeId,
    name: (d.name && d.name.trim()) || '未命名部门',
    activeTasks: d.activeTasks,
    heightPct: Math.max(6, Math.round((d.activeTasks / max) * 100)),
  }));
}

export function formatAmountDisplay(amount: string, currency: string): string {
  const sym = currency === 'CNY' || currency === 'RMB' ? '¥' : currency;
  const n = parseFloat(amount);
  if (Number.isNaN(n)) {
    return `${amount} ${sym}`.trim();
  }
  if (Math.abs(n) >= 1000) {
    return `${sym}${(n / 1000).toFixed(1)}k`;
  }
  return `${sym}${n.toFixed(0)}`;
}

const ROLE_LABEL: Record<string, string> = {
  ceo: '首席执行官',
  director: '总监',
  board_member: '董事',
  executor: '执行',
};

export function agentRoleLabel(role: string | undefined): string {
  if (!role) {
    return 'Agent';
  }
  return ROLE_LABEL[role] ?? role;
}

export function agentStatusClass(status: string | undefined): 'status-active' | 'status-busy' | 'status-idle' {
  if (status === 'suspended') {
    return 'status-busy';
  }
  if (status === 'inactive') {
    return 'status-idle';
  }
  return 'status-active';
}

export function agentStatusText(status: string | undefined): string {
  if (status === 'inactive') {
    return '空闲';
  }
  if (status === 'suspended') {
    return '暂停';
  }
  return '活跃';
}

export function taskRiskMeta(task: TaskEntity): {
  pct: number;
  label: string;
  className: string;
  dotColor: string;
} {
  const progress = typeof task.progress === 'number' ? task.progress : 0;
  const due = task.dueDate ? new Date(task.dueDate).getTime() : null;
  const now = Date.now();
  const overdue =
    due !== null &&
    !Number.isNaN(due) &&
    due < now &&
    task.status !== 'completed' &&
    task.status !== 'cancelled';

  if (overdue) {
    return {
      pct: progress,
      label: '超时',
      className: 'risk-high',
      dotColor: '#EF4444',
    };
  }
  if (progress < 40 && (task.status === 'in_progress' || task.status === 'pending')) {
    return {
      pct: progress,
      label: '延迟风险',
      className: 'risk-med',
      dotColor: '#F59E0B',
    };
  }
  if (progress >= 90 || task.status === 'completed') {
    return {
      pct: progress,
      label: '顺利',
      className: '',
      dotColor: '#22C55E',
    };
  }
  return {
    pct: progress,
    label: '进行中',
    className: '',
    dotColor: '#6366F1',
  };
}

const AVATAR_BG = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#A855F7', '#EC4899'];

export function avatarColor(index: number): string {
  return AVATAR_BG[index % AVATAR_BG.length];
}

export function initialsFromName(name: string | undefined): string {
  const s = (name || '?').trim();
  if (s.length <= 2) {
    return s.toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}
