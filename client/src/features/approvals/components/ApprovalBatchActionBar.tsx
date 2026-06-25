type Props = {
  selectedCount: number;
  onApproveBatch: () => void;
  onRejectBatch: () => void;
  onClear: () => void;
};

export default function ApprovalBatchActionBar({ selectedCount, onApproveBatch, onRejectBatch, onClear }: Props) {
  if (!selectedCount) return null;
  return (
    <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
      <div className="text-xs text-blue-700">已选择 {selectedCount} 项</div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onApproveBatch} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white">
          批量通过
        </button>
        <button type="button" onClick={onRejectBatch} className="rounded-md bg-rose-600 px-2.5 py-1 text-xs text-white">
          批量拒绝
        </button>
        <button type="button" onClick={onClear} className="rounded-md border border-blue-200 px-2.5 py-1 text-xs text-blue-700">
          清空
        </button>
      </div>
    </div>
  );
}

