import { Link } from "react-router-dom";

export default function HeartbeatConfigPanel() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">调度说明</h3>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-gray-600">
        <p>
          CEO 心跳与 pending 任务扫描由系统按固定周期运行（默认约 10 分钟一次），无需手动触发。
        </p>
        <p className="text-gray-500">
          主群已不再推送各部门 Director 日报，避免空报告干扰协作频道。
        </p>
        <p>
          需要自定义定时任务，请前往{" "}
          <Link to="/tasks/schedules" className="text-[#2d5a8e] hover:text-[#1e3a5f]">
            定时 Playbook
          </Link>
          。
        </p>
      </div>
    </div>
  );
}
