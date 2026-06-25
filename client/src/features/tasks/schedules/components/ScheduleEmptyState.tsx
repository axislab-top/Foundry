export default function ScheduleEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center shadow-sm">
      <p className="text-sm font-medium text-gray-800">还没有定时规则</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-500">
        创建规则后，系统会在指定时间自动为 Agent 创建并执行任务。也可在主群直接告诉 CEO：「以后每天 9 点做 XX」。
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e]"
      >
        新建规则
      </button>
    </div>
  );
}
