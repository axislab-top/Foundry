import type { ExecutionLogEntry } from "@/features/tasks/api/tasksTypes";

type Props = {
  logs: ExecutionLogEntry[];
};

export default function PatrolRunDetail({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-xs text-gray-400">暂无步骤记录</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="divide-y divide-gray-100">
        {logs.map((log) => (
          <div key={log.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[72px_minmax(0,1fr)]">
            <span className="font-mono text-[11px] text-gray-400">
              {new Date(log.createdAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800">{log.stepType}</p>
              {log.message ? <p className="mt-0.5 text-xs text-gray-500">{log.message}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
