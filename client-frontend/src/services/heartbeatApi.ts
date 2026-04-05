import { listAgents } from './agentsApi';
import { findMainRoom, listMessages } from './collaborationApi';
import { getBillingSummary, getCompanySummary } from './dashboardApi';
import type { Agent } from './agentsApi';
import type { BillingDashboardSummary, CompanyDashboardSummary } from './dashboardTypes';
import type { ChatMessage } from './collaborationApi';
import type { TaskEntity } from './tasksApi';
import { listTasks } from './tasksApi';

export interface HeartbeatReport {
  company: CompanyDashboardSummary;
  billing: BillingDashboardSummary;
  tasks: TaskEntity[];
  agents: Agent[];
  recentMessages: ChatMessage[];
  generatedAt: string;
}

export async function getHeartbeatReport(): Promise<HeartbeatReport> {
  const [company, billing, tasks, agents, mainRoom] = await Promise.all([
    getCompanySummary(),
    getBillingSummary(),
    listTasks({ page: 1, pageSize: 30, rootOnly: true }),
    listAgents({ page: 1, pageSize: 30 }),
    findMainRoom(),
  ]);

  let recentMessages: ChatMessage[] = [];
  if (mainRoom?.id) {
    const result = await listMessages(mainRoom.id, { limit: 12 });
    recentMessages = result.items;
  }

  return {
    company,
    billing,
    tasks: tasks.items ?? [],
    agents: agents.items ?? [],
    recentMessages,
    generatedAt: new Date().toISOString(),
  };
}
