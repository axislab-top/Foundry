import ApprovalWorkbenchPage from "@/features/approvals/components/ApprovalWorkbenchPage";

export default function PendingApprovalsPage() {
  return (
    <ApprovalWorkbenchPage
      view="pending"
      title="待审批"
      description="协作空间中的待处理审批任务，支持快速处理与批量操作。"
    />
  );
}

