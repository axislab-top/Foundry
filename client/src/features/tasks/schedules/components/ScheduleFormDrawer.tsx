import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { drawerTransition, drawerVariants } from "@/features/projects/model/constants";
import type { CreateScheduledPlaybookPayload, ScheduleKind, ScheduledPlaybookViewModel } from "../schedules-types";

type AgentOption = { id: string; name: string };

type Props = {
  agents: AgentOption[];
  initial?: ScheduledPlaybookViewModel | null;
  submitting?: boolean;
  onSubmit: (data: CreateScheduledPlaybookPayload) => void;
  onClose: () => void;
};

const WEEKDAY_OPTIONS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" },
];

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]/20";

export default function ScheduleFormDrawer({ agents, initial, submitting, onSubmit, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [assigneeAgentId, setAssigneeAgentId] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState<"none" | "main_room">("main_room");
  const [requiresHumanApproval, setRequiresHumanApproval] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setDescription(initial.description ?? "");
    setScheduleKind(initial.scheduleKind);
    setTimeOfDay(initial.timeOfDay ?? "09:00");
    setDaysOfWeek(initial.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setCronExpression(initial.cronExpression ?? "0 9 * * *");
    setTimezone(initial.timezone);
    setAssigneeAgentId(initial.assigneeAgentId);
    setDeliveryChannel(initial.deliveryChannel);
    setRequiresHumanApproval(initial.requiresHumanApproval);
  }, [initial]);

  useEffect(() => {
    if (!assigneeAgentId && agents[0]) setAssigneeAgentId(agents[0].id);
  }, [agents, assigneeAgentId]);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !assigneeAgentId) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      scheduleKind,
      timeOfDay: scheduleKind === "cron" ? undefined : timeOfDay,
      daysOfWeek: scheduleKind === "weekly" ? daysOfWeek : undefined,
      cronExpression: scheduleKind === "cron" ? cronExpression.trim() : undefined,
      timezone,
      assigneeAgentId,
      deliveryChannel,
      requiresHumanApproval,
      playbookArgs: {
        playbookName: name.trim(),
        objective: description.trim() || name.trim(),
      },
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-xl"
        variants={drawerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={drawerTransition}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            {initial ? "编辑定时规则" : "新建定时规则"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-4 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">执行说明</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="例如：汇总各部门进度并输出风险清单"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">周期类型</label>
              <select
                value={scheduleKind}
                onChange={(e) => setScheduleKind(e.target.value as ScheduleKind)}
                className={inputClass}
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="cron">Cron 高级</option>
              </select>
            </div>
            {scheduleKind !== "cron" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">时刻</label>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            ) : null}
            {scheduleKind === "weekly" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">星期</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleDay(opt.value)}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        daysOfWeek.includes(opt.value)
                          ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {scheduleKind === "cron" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Cron 表达式</label>
                <input
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className={inputClass}
                  placeholder="0 9 * * *"
                />
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">时区</label>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">执行 Agent</label>
              <select
                value={assigneeAgentId}
                onChange={(e) => setAssigneeAgentId(e.target.value)}
                required
                className={inputClass}
              >
                <option value="">选择 Agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={deliveryChannel === "main_room"}
                onChange={(e) => setDeliveryChannel(e.target.checked ? "main_room" : "none")}
              />
              完成后推送到主群
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={requiresHumanApproval}
                onChange={(e) => setRequiresHumanApproval(e.target.checked)}
              />
              执行前需人工审批
            </label>
            <p className="rounded-lg border border-gray-200 bg-[#f8f9fa] px-3 py-2 text-[11px] leading-relaxed text-gray-500">
              触发精度受系统 Heartbeat 调度影响（约 ±10 分钟）。公司级自治巡检请使用
              「自治 Heartbeat」页面。
            </p>
          </div>
          <div className="border-t border-gray-200 px-5 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e] disabled:opacity-50"
              >
                {submitting ? "保存中…" : initial ? "保存" : "创建"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </>
  );
}
