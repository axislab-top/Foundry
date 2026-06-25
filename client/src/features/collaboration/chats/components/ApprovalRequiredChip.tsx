import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

export default function ApprovalRequiredChip({
  taskTitle,
  className = "",
}: {
  taskTitle?: string;
  className?: string;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/governance/approvals")}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 ${className}`}
    >
      <ShieldAlert className="h-3.5 w-3.5" />
      {taskTitle ? `「${taskTitle}」待审批` : "待人工审批"}
      <span className="text-[10px] font-normal text-amber-800/90">→ 审批中心</span>
    </button>
  );
}
