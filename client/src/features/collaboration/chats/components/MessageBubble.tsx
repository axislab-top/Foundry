import { motion } from "framer-motion";
import { Bot, Sparkles } from "lucide-react";

export type MessageData = {
  id: string;
  senderType: "human" | "agent";
  senderId: string;
  content: string;
  createdAt: string;
  messageType?: string;
  metadata?: Record<string, unknown> | null;
};

type SenderProfile = {
  name: string;
  avatarText: string;
  avatarClass: string;
  roleLabel?: string;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({
  message,
  sender,
  isStreaming,
  isHighlighted,
  hidePlainText,
  children,
}: {
  message: MessageData;
  sender: SenderProfile;
  isStreaming?: boolean;
  isHighlighted?: boolean;
  /** 富卡片已展示结构化内容时，隐藏气泡内重复正文 */
  hidePlainText?: boolean;
  children?: React.ReactNode;
}) {
  const isAgent = message.senderType === "agent";
  const isSystem = message.messageType === "system";
  const isSystemApproval = isAgent && message.senderId === "system-approval";
  const meta = message.metadata ?? {};
  const isMainRoomDeptDispatch =
    meta.kind === "main_room_dept_dispatch" || meta.mainRoomDeptDispatch === true;
  const isMainRoomDirectorAck = meta.kind === "main_room_director_ack";
  const isMainRoomDeptProgressRelay = meta.kind === "main_room_dept_progress_relay";
  const isMainRoomDistSummary = meta.kind === "main_room_distribution_completion_summary";
  const isMainRoomWaveSupervision = meta.kind === "main_room_wave_supervision_nudge";

  return (
    <motion.div
      id={`message-${message.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2.5 ${isAgent ? "items-start" : "items-start justify-end"}`}
    >
      {/* Agent avatar (left side) */}
      {isAgent && (
        <div
          className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-sm ${
            isSystemApproval
              ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200"
              : sender.avatarClass
          }`}
        >
          {isSystemApproval ? "审" : sender.avatarText}
        </div>
      )}

      {/* Message content */}
      <div className={`flex min-w-0 max-w-[80%] flex-col ${isAgent ? "" : "items-end"}`}>
        {/* Sender name + role */}
        <div className={`mb-1 flex items-center gap-1.5 ${isAgent ? "" : "flex-row-reverse"}`}>
          {isAgent && sender.roleLabel && (
            <span className="rounded bg-gray-100 px-1.5 py-px text-[9px] font-medium text-gray-500">
              {sender.roleLabel}
            </span>
          )}
          <span className="text-[11px] font-medium text-gray-500">{sender.name}</span>
        </div>

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-3.5 py-2.5 shadow-sm transition-all duration-200 ${
            isHighlighted
              ? "ring-2 ring-blue-300 ring-offset-1"
              : ""
          } ${
            isSystem
              ? "border border-amber-200 bg-amber-50/80"
              : isAgent
                ? "rounded-tl-md border border-gray-100 bg-white"
                : "rounded-tr-md bg-[#d9fdd3]"
          }`}
        >
          {/* Streaming indicator */}
          {isStreaming && (
            <div className="mb-1.5 flex items-center gap-1 text-[10px] text-blue-500">
              <Sparkles className="h-3 w-3 animate-pulse" />
              <span>正在生成回复…</span>
            </div>
          )}

          {isAgent && isMainRoomDeptDispatch && (
            <div className="mb-1.5 space-y-0.5">
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
                CEO 派活
              </span>
            </div>
          )}
          {isMainRoomDirectorAck && (
            <div className="mb-1.5">
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-900">
                主管接单
              </span>
            </div>
          )}
          {isAgent && isMainRoomDeptProgressRelay && (
            <div className="mb-1.5">
              <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-900">
                部门进展
              </span>
            </div>
          )}
          {isAgent && isMainRoomDistSummary && (
            <div className="mb-1.5 space-y-0.5">
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                编排结案
              </span>
              <p className="text-[10px] leading-snug text-emerald-800/90">
                本轮部门子目标均已闭环，可在侧栏查看主目标与子任务状态。
              </p>
            </div>
          )}
          {isAgent && isMainRoomWaveSupervision && (
            <div className="mb-1.5 space-y-0.5">
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-900">
                编排监督 · 阶段推进
              </span>
              <p className="text-[10px] leading-snug text-sky-800/90">
                依赖队列已解锁下一波部门子任务；侧栏目标树将随子任务状态同步。
              </p>
            </div>
          )}

          {/* Text content */}
          {message.content && !hidePlainText && (
            <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-800">
              {isStreaming ? (
                <>
                  {message.content}
                  <span className="inline-block h-4 w-0.5 animate-pulse bg-blue-400 align-text-bottom" />
                </>
              ) : (
                message.content
              )}
            </div>
          )}

          {/* Rich card slots */}
          {children && <div className="mt-2">{children}</div>}
        </div>

        {/* Timestamp */}
        <div className={`mt-1 flex items-center gap-1 ${isAgent ? "" : "flex-row-reverse"}`}>
          <span className="text-[10px] text-gray-400">{formatTime(message.createdAt)}</span>
        </div>
      </div>

      {/* Human avatar (right side) */}
      {!isAgent && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-200">
          {sender.avatarText}
        </div>
      )}
    </motion.div>
  );
}
