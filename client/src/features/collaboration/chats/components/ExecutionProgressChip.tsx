import { Wrench } from "lucide-react";

export default function ExecutionProgressChip({
  skillName,
  taskId,
}: {
  skillName?: string | null;
  taskId?: string | null;
}) {
  const label = String(skillName ?? "").trim() || "执行中";
  return (
    <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-[#e5e7eb] bg-white px-2 py-0.5 text-[10px] text-gray-600">
      <Wrench className="h-3 w-3 text-[#3b82f6]" aria-hidden />
      <span>{label}</span>
      {taskId ? <span className="text-gray-400">· {taskId.slice(0, 8)}</span> : null}
    </div>
  );
}
