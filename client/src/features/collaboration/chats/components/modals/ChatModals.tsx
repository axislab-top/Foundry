import type { ChatRoomListItem, RichCardQuickAction } from "../../utils/messageExtraction";
import type { DispatchAssignmentForm, DepartmentSlugOption } from "../../MainRoomDraftFormDialogs";
import type { DistributionDraftRow } from "../DistributionDraftTable";
import type { StrategyGoalDraftCardModel } from "../StrategyGoalDraftCard";
import type { DispatchPlanDraftCardModel } from "../DispatchPlanDraftCard";
import type { MainRoomDispatchPlanState } from "../../api/collaborationApi";
import type { TaskItem } from "@/features/tasks/api/tasksTypes";
import type { OnboardingRole } from "@/features/onboarding";
import {
  DispatchPlanEditModal,
  DistributionDraftEditModal,
  StrategyGoalEditModal,
} from "../../MainRoomDraftFormDialogs";
import DispatchPlanViewModal from "../DispatchPlanViewModal";
import TaskDetailDrawer from "@/features/tasks/components/TaskDetailDrawer";
import { CeoBriefingModal } from "@/features/onboarding";
import {
  resolveDispatchPlanQuickActions,
} from "../../utils/dispatchPlanDraftDisplay";

interface ChatModalsProps {
  // Strategy edit modal
  strategyFormOpen: boolean;
  setStrategyFormOpen: (v: boolean) => void;
  latestStrategyGoalDraft: { model: StrategyGoalDraftCardModel; messageId?: string } | null;
  mainCollaborationRoomId: string | null;
  afterMainRoomDraftPatch: (kind: "strategy" | "distribution" | "dispatch_plan") => void;
  // Dispatch plan edit modal
  dispatchPlanFormOpen: boolean;
  setDispatchPlanFormOpen: (v: boolean) => void;
  dispatchPlanEditFormInitial: {
    goal: string;
    bodyMarkdown: string;
    executionOrder?: string;
    assignments: DispatchAssignmentForm[];
  } | null;
  dispatchPlanDraftState: MainRoomDispatchPlanState | null;
  companyDepartmentOptions: DepartmentSlugOption[];
  // Distribution draft edit modal
  distributionFormOpen: boolean;
  setDistributionFormOpen: (v: boolean) => void;
  latestDistributionDraftRows: DistributionDraftRow[] | null;
  // Dispatch plan view modal
  dispatchPlanModalOpen: boolean;
  dispatchPlanModalCard: DispatchPlanDraftCardModel | null;
  closeDispatchPlanModal: () => void;
  handleRichCardQuickAction: (action: RichCardQuickAction) => void;
  sending: boolean;
  // Task detail drawer
  detailTask: TaskItem | null;
  closeTaskDetail: () => void;
  activeRoom: ChatRoomListItem | null;
  activeRoomId: string | null;
  refreshAfterTaskChain: () => void;
  // CEO briefing modal
  ceoBriefingOpen: boolean;
  onboardingRole: OnboardingRole;
  displayName: string;
  activeCompanyName: string;
  handleCeoBriefingStart: () => void;
  handleCeoBriefingLater: () => void;
}

export default function ChatModals({
  strategyFormOpen,
  setStrategyFormOpen,
  latestStrategyGoalDraft,
  mainCollaborationRoomId,
  afterMainRoomDraftPatch,
  dispatchPlanFormOpen,
  setDispatchPlanFormOpen,
  dispatchPlanEditFormInitial,
  dispatchPlanDraftState,
  companyDepartmentOptions,
  distributionFormOpen,
  setDistributionFormOpen,
  latestDistributionDraftRows,
  dispatchPlanModalOpen,
  dispatchPlanModalCard,
  closeDispatchPlanModal,
  handleRichCardQuickAction,
  sending,
  detailTask,
  closeTaskDetail,
  activeRoom,
  activeRoomId,
  refreshAfterTaskChain,
  ceoBriefingOpen,
  onboardingRole,
  displayName,
  activeCompanyName,
  handleCeoBriefingStart,
  handleCeoBriefingLater,
}: ChatModalsProps) {
  return (
    <>
      {latestStrategyGoalDraft && mainCollaborationRoomId ? (
        <StrategyGoalEditModal
          open={strategyFormOpen}
          roomId={mainCollaborationRoomId}
          initialGoal={latestStrategyGoalDraft.model.strategyGoal}
          initialPhases={latestStrategyGoalDraft.model.strategicPhases}
          onClose={() => setStrategyFormOpen(false)}
          onSaved={() => afterMainRoomDraftPatch("strategy")}
        />
      ) : null}
      {dispatchPlanEditFormInitial && mainCollaborationRoomId ? (
        <DispatchPlanEditModal
          open={dispatchPlanFormOpen}
          roomId={mainCollaborationRoomId}
          initialGoal={dispatchPlanEditFormInitial.goal}
          initialBodyMarkdown={dispatchPlanEditFormInitial.bodyMarkdown}
          initialAssignments={dispatchPlanEditFormInitial.assignments}
          initialExecutionOrder={dispatchPlanEditFormInitial.executionOrder}
          planRevision={dispatchPlanDraftState?.planRevision as number | undefined}
          departmentOptions={companyDepartmentOptions}
          onClose={() => setDispatchPlanFormOpen(false)}
          onSaved={() => afterMainRoomDraftPatch("dispatch_plan")}
        />
      ) : null}
      {latestDistributionDraftRows && latestDistributionDraftRows.length > 0 && mainCollaborationRoomId ? (
        <DistributionDraftEditModal
          open={distributionFormOpen}
          roomId={mainCollaborationRoomId}
          initialRows={latestDistributionDraftRows}
          onClose={() => setDistributionFormOpen(false)}
          onSaved={() => afterMainRoomDraftPatch("distribution")}
        />
      ) : null}
      <DispatchPlanViewModal
        open={dispatchPlanModalOpen}
        card={dispatchPlanModalCard}
        quickActions={resolveDispatchPlanQuickActions({
          card: dispatchPlanModalCard,
          dispatchPlanDraftState,
        })}
        sending={sending}
        onClose={closeDispatchPlanModal}
        onPickAction={(a) => void handleRichCardQuickAction(a)}
        showEditForm={Boolean(mainCollaborationRoomId && dispatchPlanModalCard && !dispatchPlanModalCard.dispatched)}
        onEditForm={() => {
          closeDispatchPlanModal();
          setDispatchPlanFormOpen(true);
        }}
      />
      <TaskDetailDrawer
        task={detailTask}
        onClose={closeTaskDetail}
        collaborationSourceRoomId={
          activeRoom?.kind === "department" ? activeRoomId : null
        }
        onChainActionComplete={refreshAfterTaskChain}
      />
      <CeoBriefingModal
        open={ceoBriefingOpen}
        role={onboardingRole}
        displayName={displayName}
        companyName={activeCompanyName}
        onStart={handleCeoBriefingStart}
        onLater={handleCeoBriefingLater}
      />
    </>
  );
}
