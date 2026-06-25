export type OnboardingRole = "owner" | "member";

export type OnboardingStepId =
  | "company_founded_modal"
  | "ceo_briefing_modal"
  | "spotlight_compose"
  | "spotlight_execution"
  | "spotlight_daily_brief_nav"
  | "task_first_message"
  | "task_daily_brief"
  | "task_agent_team"
  | "task_upload_file"
  | "task_approval"
  | "hint_daily_brief"
  | "hint_agent_team"
  | "hint_approvals"
  | "hint_files"
  | "hint_tasks"
  | "hint_org";

export type OnboardingStepRecord = {
  completedAt: string;
  skipped?: boolean;
};

export type OnboardingProgress = {
  version: 1;
  role: OnboardingRole;
  steps: Partial<Record<OnboardingStepId, OnboardingStepRecord>>;
  checklistDismissed?: boolean;
  updatedAt: string;
};

export type OnboardingScope = {
  userId: string;
  companyId: string;
};

export type OnboardingLocationState = {
  onboardingJustFounded?: boolean;
};
