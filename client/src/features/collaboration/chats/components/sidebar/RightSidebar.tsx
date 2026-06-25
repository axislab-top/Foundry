import { ArrowLeft, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../../store/chatStore";
import type { MobileView } from "../../store/chatStore";
import type { RoomMember } from "../../api/collaborationApi";
import type { ChatRoomListItem, RichCardQuickAction, TaskSummary } from "../../utils/messageExtraction";
import type { OrchestrationRunSnapshot } from "../MessageProcessingChip";
import type { CollaborationProgramView } from "../../utils/programLifecycle";
import type { DispatchPlanDraftCardModel } from "../DispatchPlanDraftCard";
import type { PendingApprovalCard as SidebarApprovalCard } from "../ApprovalSidebarCard";
import type { DistributionDraftRow } from "../DistributionDraftTable";
import type { StrategyGoalDraftCardModel } from "../StrategyGoalDraftCard";
import type { CeoV2ExecutionRibbonModel } from "../../utils/ceoV2Metadata";
import type { GovernanceTimelineEntry } from "../../utils/governanceTimeline.types";
import MembersPanel from "../MembersPanel";
import ApprovalSidebarCard from "../ApprovalSidebarCard";
import ProgramPanel from "../ProgramPanel";
import TaskCommandPanel from "../TaskCommandPanel";
import GovernanceTimelinePanel from "../GovernanceTimelinePanel";
import TaskSidebarCard from "../TaskSidebarCard";
import { StrategyGoalDraftCard } from "../StrategyGoalDraftCard";
import RichCardQuickReplyRow from "../RichCardQuickReplyRow";
import CeoV2ExecutionStatusCard from "../CeoV2ExecutionStatusCard";
import DistributionDraftTable from "../DistributionDraftTable";

interface RightSidebarProps {
  activeRoom: ChatRoomListItem | null;
  mainCollaborationRoomId: string | null;
  taskSummaryCollapsed: boolean;
  setTaskSummaryCollapsed: (v: boolean) => void;
  // Strategy draft
  showStrategyDraftInTaskSummary: boolean;
  latestStrategyGoalDraft: { model: StrategyGoalDraftCardModel; messageId?: string } | null;
  orchestratedStrategyPlanReadonly: { model: StrategyGoalDraftCardModel } | null;
  sidebarStrategyDraftQuickActions: RichCardQuickAction[];
  // Dispatch plan
  showDispatchPlanDraftInTaskSummary: boolean;
  latestDispatchPlanDraft: { model: DispatchPlanDraftCardModel; messageId?: string } | null;
  openDispatchPlanModal: (card: DispatchPlanDraftCardModel) => void;
  // Distribution draft
  latestDistributionDraftRows: DistributionDraftRow[] | null;
  // CEO v2 ribbon
  latestCeoV2Ribbon: CeoV2ExecutionRibbonModel;
  sidebarPipelineVisible: boolean;
  // Pipeline
  pipelineOrchestrationRun: OrchestrationRunSnapshot | null;
  goalCards: TaskSummary[];
  loadingGoals: boolean;
  activeProgram: CollaborationProgramView | null;
  // Governance
  governanceTimelineEntries: GovernanceTimelineEntry[];
  // Members
  roomMembers: RoomMember[];
  agentDisplayMap: Record<string, { name: string; role?: string }>;
  loadingMembers: boolean;
  // Approvals
  visiblePendingApprovals: SidebarApprovalCard[];
  approvalSubmittingMap: Record<string, boolean>;
  handleApprovalAction: (approvalId: string, approved: boolean) => void;
  // Task actions
  handleDeleteTask: (task: TaskSummary) => void;
  openTaskDetail: (taskId: string) => void;
  handleExecutionConfirm: () => void;
  handleRichCardQuickAction: (action: RichCardQuickAction) => void;
  primaryDeptTaskId: string | null;
  isCompanyManager: boolean;
  deletingTaskId: string | null;
  highlightedTaskId: string | null;
  sending: boolean;
  // Form state
  setStrategyFormOpen: (v: boolean) => void;
  setDistributionFormOpen: (v: boolean) => void;
  setDispatchPlanFormOpen: (v: boolean) => void;
  // Mobile
  mobileView: MobileView;
  onMobileBack: () => void;
}

export default function RightSidebar({
  activeRoom,
  mainCollaborationRoomId,
  taskSummaryCollapsed,
  setTaskSummaryCollapsed,
  showStrategyDraftInTaskSummary,
  latestStrategyGoalDraft,
  orchestratedStrategyPlanReadonly,
  sidebarStrategyDraftQuickActions,
  showDispatchPlanDraftInTaskSummary,
  latestDispatchPlanDraft,
  openDispatchPlanModal,
  latestDistributionDraftRows,
  latestCeoV2Ribbon,
  sidebarPipelineVisible,
  pipelineOrchestrationRun,
  goalCards,
  loadingGoals,
  activeProgram,
  governanceTimelineEntries,
  roomMembers,
  agentDisplayMap,
  loadingMembers,
  visiblePendingApprovals,
  approvalSubmittingMap,
  handleApprovalAction,
  handleDeleteTask,
  openTaskDetail,
  handleExecutionConfirm,
  handleRichCardQuickAction,
  primaryDeptTaskId,
  isCompanyManager,
  deletingTaskId,
  highlightedTaskId,
  sending,
  setStrategyFormOpen,
  setDistributionFormOpen,
  setDispatchPlanFormOpen,
  mobileView,
  onMobileBack,
}: RightSidebarProps) {
  const navigate = useNavigate();

  return (
    <>
      <div
        className={`flex h-full min-h-0 w-full flex-col border-l border-gray-100 bg-gray-50/50 transition-all duration-300 ease-out ${
          taskSummaryCollapsed
            ? "pointer-events-none overflow-hidden opacity-0"
            : "overflow-y-auto opacity-100"
        }`}
      >
        <div className="flex h-full min-h-0 flex-col gap-3 p-3">
          {/* Mobile back button — only visible on small screens when in sidebar view */}
          {mobileView === "sidebar" && (
            <button
              type="button"
              onClick={onMobileBack}
              className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:hidden"
              aria-label="返回聊天"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回聊天
            </button>
          )}
          {/* Dispatch Plan v2 draft (if applicable) */}
          {showDispatchPlanDraftInTaskSummary && latestDispatchPlanDraft ? (
            <button
              type="button"
              onClick={() => openDispatchPlanModal(latestDispatchPlanDraft.model)}
              className="w-full rounded-xl border border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_4%,var(--background))] px-3 py-2.5 text-left shadow-sm transition-colors hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]"
            >
              <div className="text-[11px] font-semibold text-[var(--text-primary)]">CEO 执行计划</div>
              <p className="mt-1 text-[10px] leading-snug text-[var(--text-secondary)]">
                {latestDispatchPlanDraft.model.pendingConfirm
                  ? "待确认下发 · 点击查看完整计划"
                  : "点击查看完整执行计划"}
              </p>
            </button>
          ) : null}

          {/* Strategy draft (if applicable) */}
          {showStrategyDraftInTaskSummary && latestStrategyGoalDraft && (
            <div className="space-y-2">
              <StrategyGoalDraftCard card={latestStrategyGoalDraft.model} variant="sidebar" />
              <RichCardQuickReplyRow
                actions={sidebarStrategyDraftQuickActions}
                sending={sending}
                disabled={sending}
                tone="emphasized"
                onPick={(a) => void handleRichCardQuickAction(a)}
              />
              {activeRoom?.kind === "main" && mainCollaborationRoomId ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))]"
                  onClick={() => setStrategyFormOpen(true)}
                >
                  表单编辑
                </button>
              ) : null}
            </div>
          )}

          {orchestratedStrategyPlanReadonly && mainCollaborationRoomId ? (
            <div className="space-y-2">
              <StrategyGoalDraftCard
                card={orchestratedStrategyPlanReadonly.model}
                variant="sidebar"
                surface="locked"
              />
            </div>
          ) : null}

          {activeRoom?.kind === "main" && latestCeoV2Ribbon.show && !sidebarPipelineVisible ? (
            <div className="space-y-2 rounded-xl border border-indigo-200/90 bg-gradient-to-b from-indigo-50/90 to-white p-3 shadow-sm">
              <div className="text-[11px] font-semibold text-indigo-950">公司执行流水线</div>
              <p className="text-[10px] leading-snug text-indigo-900/85">
                反映主群内 CEO v2 最新消息中的编排模式与执行摘要（DAG / 波次）。
              </p>
              <CeoV2ExecutionStatusCard model={latestCeoV2Ribbon} compact />
            </div>
          ) : null}

          {activeRoom?.kind === "main" &&
          mainCollaborationRoomId &&
          latestDistributionDraftRows &&
          latestDistributionDraftRows.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-3 shadow-sm">
              <div className="text-[11px] font-semibold text-sky-900">部门分工草稿</div>
              <p className="text-[10px] leading-snug text-sky-800/90">
                与群内分工表一致；确认下发前可用表单整表修改。行数须与当前表一致。
              </p>
              <DistributionDraftTable rows={latestDistributionDraftRows} />
              <button
                type="button"
                className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-[11px] font-medium text-sky-900 hover:bg-sky-50/80"
                onClick={() => setDistributionFormOpen(true)}
              >
                表单编辑部门分工
              </button>
            </div>
          ) : null}

          {/* Members */}
          <MembersPanel
            members={roomMembers}
            agentDisplayMap={agentDisplayMap}
            loading={loadingMembers}
          />

          {/* Approvals */}
          <ApprovalSidebarCard
            approvals={visiblePendingApprovals as SidebarApprovalCard[]}
            submittingMap={approvalSubmittingMap}
            onApprove={(id) => handleApprovalAction(id, true)}
            onReject={(id) => handleApprovalAction(id, false)}
            onViewAll={() => navigate("/governance/approvals")}
          />

          {/* Program SSOT */}
          {activeRoom?.kind === "main" ? (
            <ProgramPanel
              program={activeProgram}
              sending={sending}
              onConfirmExecution={() => void handleExecutionConfirm()}
            />
          ) : null}

          {/* Execution pipeline */}
          {sidebarPipelineVisible ? (
            <TaskCommandPanel
              run={pipelineOrchestrationRun}
              roomKind={activeRoom?.kind}
              goalTasks={goalCards}
              showEmptyHint={false}
              showGovernanceHints={activeRoom?.kind === "main"}
              onOpenTaskCenter={() => navigate("/tasks/center")}
              onOpenTaskDetail={openTaskDetail}
              onQuickReport={
                primaryDeptTaskId ? () => openTaskDetail(primaryDeptTaskId) : undefined
              }
              onQuickCoordination={
                primaryDeptTaskId ? () => openTaskDetail(primaryDeptTaskId) : undefined
              }
              isCompanyManager={isCompanyManager}
            />
          ) : null}

          {/* Tasks */}
          {activeRoom?.kind === "main" && governanceTimelineEntries.length > 0 ? (
            <GovernanceTimelinePanel
              entries={governanceTimelineEntries}
              onFocusTask={openTaskDetail}
            />
          ) : null}

          {activeRoom?.kind === "department" ? (
            <p className="rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2 text-[10px] leading-relaxed text-gray-600">
              点击子目标或顶栏卡片打开<strong className="text-gray-800">任务详情</strong>；负责人可在此发起「主群汇总回报」或「跨部门协调」。
            </p>
          ) : null}
          <TaskSidebarCard
            tasks={goalCards}
            loading={loadingGoals}
            deletingId={deletingTaskId}
            onDelete={handleDeleteTask}
            onOpenTask={openTaskDetail}
            highlightedTaskId={highlightedTaskId}
          />
        </div>
      </div>

      {taskSummaryCollapsed ? (
        <button
          type="button"
          onClick={() => setTaskSummaryCollapsed(false)}
          className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-l-xl border border-r-0 border-blue-200 bg-blue-600 px-3 py-3 text-xs font-semibold text-white shadow-md hover:bg-blue-700 max-md:hidden"
          aria-label="展开任务概要"
          title="展开任务概要"
        >
          <ChevronLeft className="h-4 w-4" />
          任务概要
        </button>
      ) : null}
    </>
  );
}
