import type { ApprovalScope } from "@/features/approvals/api/approvalsApi";

type Props = {
  scope: ApprovalScope;
  q: string;
  riskBand: "all" | "high" | "medium";
  status: string;
  actionType: string;
  onScopeChange: (v: ApprovalScope) => void;
  onQChange: (v: string) => void;
  onRiskBandChange: (v: "all" | "high" | "medium") => void;
  onStatusChange: (v: string) => void;
  onActionTypeChange: (v: string) => void;
};

export default function ApprovalFiltersBar(props: Props) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <select
          value={props.scope}
          onChange={(e) => props.onScopeChange(e.target.value as ApprovalScope)}
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
        >
          <option value="pending">待处理</option>
          <option value="resolved_mine">我已处理</option>
          <option value="company_all">全公司</option>
        </select>
        <input
          value={props.q}
          onChange={(e) => props.onQChange(e.target.value)}
          placeholder="搜索动作/内容"
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
        />
        <select
          value={props.riskBand}
          onChange={(e) => props.onRiskBandChange(e.target.value as "all" | "high" | "medium")}
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
        >
          <option value="all">风险全部</option>
          <option value="high">高风险</option>
          <option value="medium">中风险</option>
        </select>
        <input
          value={props.actionType}
          onChange={(e) => props.onActionTypeChange(e.target.value)}
          placeholder="动作类型前缀"
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
        />
        <input
          value={props.status}
          onChange={(e) => props.onStatusChange(e.target.value)}
          placeholder="状态过滤(逗号分隔)"
          className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}

