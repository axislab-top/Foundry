import { ArrowLeft, Wifi, WifiOff, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import type { MobileView } from "../../store/chatStore";
import type { ChatRoomListItem } from "../../utils/messageExtraction";
import type { CeoV2ExecutionRibbonModel } from "../../utils/ceoV2Metadata";

interface ChatHeaderProps {
  activeRoom: ChatRoomListItem | null;
  mainRoomCollaborationModeLabel: string;
  latestCeoV2Ribbon: CeoV2ExecutionRibbonModel;
  mobileView: MobileView;
  onMobileBack: () => void;
  onToggleSidebar: () => void;
}

export default function ChatHeader({
  activeRoom,
  mainRoomCollaborationModeLabel,
  latestCeoV2Ribbon,
  mobileView,
  onMobileBack,
  onToggleSidebar,
}: ChatHeaderProps) {
  const wsStatus = useChatStore((s) => s.wsStatus);
  const wsLastError = useChatStore((s) => s.wsLastError);
  const taskSummaryCollapsed = useChatStore((s) => s.taskSummaryCollapsed);
  const setTaskSummaryCollapsed = useChatStore((s) => s.setTaskSummaryCollapsed);

  return (
    <div className="border-b border-gray-100 px-3 py-2.5 md:px-5 md:py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {/* Mobile back button — only visible on small screens when in chat view */}
          {mobileView === "chat" && (
            <button
              type="button"
              onClick={onMobileBack}
              className="flex items-center justify-center rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 md:hidden"
              aria-label="返回房间列表"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-900">
              {activeRoom?.title ?? "协作空间"}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-gray-400">
              {activeRoom?.subtitle ?? "—"}
              {activeRoom?.kind === "main" && " · 启用前置意图识别"}
              {activeRoom?.kind === "main" && latestCeoV2Ribbon.show ? (
                <span className="text-indigo-600">
                  {" "}
                  · {latestCeoV2Ribbon.semanticsLabel ?? "公司执行流水线"}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeRoom?.kind === "main" ? (
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1e3a5f]/20 bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-[#1e3a5f]"
              title="协作模式由服务端在对齐/确认后同步"
            >
              {mainRoomCollaborationModeLabel}
            </div>
          ) : null}
          {/* WS status */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
              wsStatus === "connected"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : wsStatus === "connecting"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
            title={wsLastError || "实时连接状态"}
          >
            {wsStatus === "connected" ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {wsStatus === "connected" ? "实时" : wsStatus === "connecting" ? "连接中" : "离线"}
          </div>
          {/* Sidebar toggle — desktop: collapse/expand; mobile: switch to sidebar view */}
          <button
            type="button"
            onClick={() => {
              const isMobileLayout = window.matchMedia("(max-width: 767px)").matches;
              if (isMobileLayout && mobileView === "chat") {
                onToggleSidebar();
                return;
              }
              setTaskSummaryCollapsed(!taskSummaryCollapsed);
            }}
            className="flex rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            title={taskSummaryCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {taskSummaryCollapsed ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
