import type { ApprovalItem } from "@/features/approvals/api/approvalsApi";

export default function ApprovalTimeline({ item }: { item: ApprovalItem }) {
  const events = [
    { key: "created", label: "审批创建", at: item.createdAt, detail: item.createdBy ? `创建人 ${item.createdBy.slice(0, 8)}` : "" },
    {
      key: "resolved",
      label: item.status === "pending" ? "待处理" : `审批${item.status}`,
      at: item.resolvedAt || item.updatedAt,
      detail: item.resolvedBy ? `处理人 ${item.resolvedBy.slice(0, 8)}` : item.rejectionReason || "",
    },
  ];
  return (
    <div className="space-y-2">
      {events.map((evt) => (
        <div key={evt.key} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
          <div className="text-xs font-semibold text-[var(--text-primary)]">{evt.label}</div>
          <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{new Date(evt.at).toLocaleString()}</div>
          {evt.detail ? <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{evt.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

