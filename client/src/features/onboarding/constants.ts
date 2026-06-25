import type { OnboardingRole, OnboardingStepId } from "./types";

export const ONBOARDING_STORAGE_PREFIX = "foundry.onboarding.v1";

export const EXAMPLE_FIRST_MESSAGE =
  "帮我梳理一下本周的产品优先级，并分配给相应部门";

export type ChecklistTaskDef = {
  stepId: OnboardingStepId;
  label: string;
  labelEn: string;
  route: string;
  required: boolean;
  roles: OnboardingRole[];
};

/** P0：3 项必做 + 2 项可选（仅 owner） */
export const CHECKLIST_TASKS: ChecklistTaskDef[] = [
  {
    stepId: "task_first_message",
    label: "发送第一条指令给 CEO",
    labelEn: "Send your first command",
    route: "/collaboration/chats",
    required: true,
    roles: ["owner", "member"],
  },
  {
    stepId: "task_daily_brief",
    label: "查看今日快报",
    labelEn: "Open Daily Brief",
    route: "/home/daily-brief",
    required: true,
    roles: ["owner", "member"],
  },
  {
    stepId: "task_agent_team",
    label: "认识您的 Agent 团队",
    labelEn: "Meet your Agent team",
    route: "/agent-team",
    required: true,
    roles: ["owner", "member"],
  },
  {
    stepId: "task_upload_file",
    label: "上传一份公司资料（可选）",
    labelEn: "Upload a company file (optional)",
    route: "/memory/files",
    required: false,
    roles: ["owner"],
  },
  {
    stepId: "task_approval",
    label: "完成一次审批（出现时）",
    labelEn: "Complete an approval (when available)",
    route: "/governance/approvals",
    required: false,
    roles: ["owner", "member"],
  },
];

export const REQUIRED_TASK_IDS = CHECKLIST_TASKS.filter((t) => t.required).map((t) => t.stepId);

export function getChecklistTasksForRole(role: OnboardingRole): ChecklistTaskDef[] {
  return CHECKLIST_TASKS.filter((t) => t.roles.includes(role));
}

export function countRequiredCompleted(
  steps: Partial<Record<OnboardingStepId, { completedAt: string }>>,
  role: OnboardingRole,
): number {
  return getChecklistTasksForRole(role)
    .filter((t) => t.required)
    .filter((t) => Boolean(steps[t.stepId]?.completedAt)).length;
}

export function countRequiredTotal(role: OnboardingRole): number {
  return getChecklistTasksForRole(role).filter((t) => t.required).length;
}
