export type ExecutionStatus = "queued" | "running" | "failed" | "completed";

export type ExecutionItem = {
  id: string;
  title: string;
  status: ExecutionStatus;
  updatedAt: string;
};
