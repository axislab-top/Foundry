export type GovernanceTimelineEntry = {
  id: string;
  kind: "wave" | "completion" | "report" | "coordination" | "dispatch" | "ack" | "progress" | "deliverable" | "digest";
  at: string;
  title: string;
  detail?: string;
  taskId?: string;
};
