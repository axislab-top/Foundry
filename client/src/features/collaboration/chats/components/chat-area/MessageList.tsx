import { useCallback } from "react";
import { ChevronDown, ChevronUp, MessagesSquare } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import type { CollaborationMessage, MainRoomDispatchPlanState } from "../../api/collaborationApi";
import type { ChatRoomListItem, RichCardQuickAction, ApprovalResumeRichCard } from "../../utils/messageExtraction";
import type { OrchestrationRunSnapshot } from "../MessageProcessingChip";
import type { CollaborationProgramView } from "../../utils/programLifecycle";
import type { DispatchPlanDraftCardModel } from "../DispatchPlanDraftCard";
import type { TaskSummary } from "../../utils/messageExtraction";
import { useNavigate } from "react-router-dom";
import MessageRenderer from "./MessageRenderer";
import ThinkingBubble from "../ThinkingBubble";
import DepartmentSubGoalBar from "../DepartmentSubGoalBar";
import DispatchFailureBanner from "../DispatchFailureBanner";
import { type TaskSummary as TaskSummaryType } from "../../utils/messageExtraction";

interface MessageListProps {
  messageListRef: React.RefObject<HTMLDivElement | null>;
  messagesToRender: CollaborationMessage[];
  activeRoom: ChatRoomListItem | null;
  activeRoomId: string | null;
  loadingMessages: boolean;
  orchestrationRunsByMessageId: Record<string, OrchestrationRunSnapshot>;
  activeProgram: CollaborationProgramView | null;
  routingSourceMessageId: string | null;
  activeReplyMessageId: string | null;
  ackedSubGoalTaskIds: Set<string>;
  dispatchPlanDraftState: MainRoomDispatchPlanState | null;
  sending: boolean;
  goalCards: TaskSummaryType[];
  loadingGoals: boolean;
  deptChatNoiseCount: number;
  mainRoomDispatchItemCount: number;
  latestDispatchFlushFailed: { error: string } | null;
  latestDispatchSkipped: Array<{ departmentSlug: string; reason: string }>;
  activeThinkingEntries: Array<{ sourceMessageId: string; agentId: string; ceoLayer?: string; isSlow?: boolean; startedAt: string }>;
  resolveSenderProfile: (message: CollaborationMessage) => { name: string; avatarText: string; avatarClass: string };
  extractApprovalResumeRichCard: (metadata: Record<string, unknown> | null | undefined) => ApprovalResumeRichCard | null;
  hasThinkingForMessage: (messageId: string) => boolean;
  openTaskDetail: (taskId: string) => void;
  openDispatchPlanModal: (card: DispatchPlanDraftCardModel) => void;
  focusTaskInSidebar: (taskId: string) => void;
  handleRichCardQuickAction: (action: RichCardQuickAction) => void;
  handleExecutionConfirm: () => void;
  handleContinueAlignment: () => void;
  handleTaskIntentPatchSpec: (candidateId: string, patch: Record<string, unknown>) => void;
  handleTaskIntentConfirm: (candidateId: string) => void;
  handleBlockedEscalation: (task: TaskSummaryType) => void;
  showDeptSystemNotices: boolean;
  setShowDeptSystemNotices: (v: boolean) => void;
  mainRoomDispatchExpanded: boolean;
  setMainRoomDispatchExpanded: (v: boolean) => void;
}

export default function MessageList({
  messageListRef,
  messagesToRender,
  activeRoom,
  activeRoomId,
  loadingMessages,
  orchestrationRunsByMessageId,
  activeProgram,
  routingSourceMessageId,
  activeReplyMessageId,
  ackedSubGoalTaskIds,
  dispatchPlanDraftState,
  sending,
  goalCards,
  loadingGoals,
  deptChatNoiseCount,
  mainRoomDispatchItemCount,
  latestDispatchFlushFailed,
  latestDispatchSkipped,
  activeThinkingEntries,
  resolveSenderProfile,
  extractApprovalResumeRichCard,
  hasThinkingForMessage,
  openTaskDetail,
  openDispatchPlanModal,
  focusTaskInSidebar,
  handleRichCardQuickAction,
  handleExecutionConfirm,
  handleContinueAlignment,
  handleTaskIntentPatchSpec,
  handleTaskIntentConfirm,
  handleBlockedEscalation,
  showDeptSystemNotices,
  setShowDeptSystemNotices,
  mainRoomDispatchExpanded,
  setMainRoomDispatchExpanded,
}: MessageListProps) {
  const navigate = useNavigate();

  return (
    <>
      {activeRoom?.kind === "main" && latestDispatchFlushFailed ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 shadow-sm">
          <div className="text-[12px] font-semibold text-red-950">执行计划下发失败</div>
          <p className="mt-1 text-[11px] text-red-900">{latestDispatchFlushFailed.error}</p>
        </div>
      ) : null}
      {activeRoom?.kind === "main" && latestDispatchSkipped.length > 0 ? (
        <DispatchFailureBanner
          skipped={latestDispatchSkipped}
          onRetry={() => navigate("/tasks/center")}
        />
      ) : null}
      {activeRoom?.kind === "department" ? (
        <div className="shrink-0">
          <DepartmentSubGoalBar
            tasks={goalCards}
            loading={loadingGoals}
            onOpenTask={openTaskDetail}
            onReportBlocked={(task) => void handleBlockedEscalation(task)}
          />
        </div>
      ) : null}
      {activeRoom?.kind === "department" && deptChatNoiseCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowDeptSystemNotices(!showDeptSystemNotices)}
          className="mb-2 flex w-full shrink-0 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
        >
          {showDeptSystemNotices ? (
            <>
              <ChevronUp className="h-3 w-3" />
              收起 {deptChatNoiseCount} 条系统/工程通知
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              展开 {deptChatNoiseCount} 条系统/工程通知
            </>
          )}
        </button>
      ) : null}
      <div ref={messageListRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
      {loadingMessages ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
        </div>
      ) : messagesToRender.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-4 text-center text-gray-400">
          <MessagesSquare className="h-10 w-10" />
          <p className="mt-2 text-sm">暂无消息，开始对话吧</p>
        </div>
      ) : (
        <>
        {activeRoom?.kind === "main" &&
        mainRoomDispatchItemCount > 0 &&
        !mainRoomDispatchExpanded ? (
          <button
            type="button"
            onClick={() => setMainRoomDispatchExpanded(true)}
            className="mb-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-[12px] text-gray-600 hover:bg-gray-100"
          >
            已派 {mainRoomDispatchItemCount} 个部门 · 展开
          </button>
        ) : null}
        {messagesToRender.map((m) => (
          <MessageRenderer
            key={m.id}
            message={m}
            activeRoom={activeRoom}
            activeRoomId={activeRoomId}
            orchestrationRunsByMessageId={orchestrationRunsByMessageId}
            activeProgram={activeProgram}
            routingSourceMessageId={routingSourceMessageId}
            activeReplyMessageId={activeReplyMessageId}
            ackedSubGoalTaskIds={ackedSubGoalTaskIds}
            dispatchPlanDraftState={dispatchPlanDraftState}
            sending={sending}
            resolveSenderProfile={resolveSenderProfile}
            extractApprovalResumeRichCard={extractApprovalResumeRichCard}
            hasThinkingForMessage={hasThinkingForMessage}
            openTaskDetail={openTaskDetail}
            openDispatchPlanModal={openDispatchPlanModal}
            focusTaskInSidebar={focusTaskInSidebar}
            handleRichCardQuickAction={handleRichCardQuickAction}
            handleExecutionConfirm={handleExecutionConfirm}
            handleContinueAlignment={handleContinueAlignment}
            handleTaskIntentPatchSpec={handleTaskIntentPatchSpec}
            handleTaskIntentConfirm={handleTaskIntentConfirm}
          />
        ))}
        {activeThinkingEntries.map((entry) => {
          const syntheticMessage: CollaborationMessage = {
            id: `thinking:${entry.sourceMessageId}:${entry.agentId}`,
            roomId: activeRoomId ?? "",
            senderType: "agent",
            senderId: entry.agentId,
            messageType: "text",
            content: "",
            createdAt: entry.startedAt,
          };
          const sender = resolveSenderProfile(syntheticMessage);
          return (
            <ThinkingBubble
              key={`thinking:${entry.sourceMessageId}:${entry.agentId}`}
              sender={sender}
              ceoLayer={entry.ceoLayer}
              isSlow={entry.isSlow}
            />
          );
        })}
        </>
      )}
      </div>
    </>
  );
}
