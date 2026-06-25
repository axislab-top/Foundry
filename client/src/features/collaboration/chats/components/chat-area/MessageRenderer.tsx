import { memo, useMemo } from "react";
import type { CollaborationMessage, MainRoomDispatchPlanState } from "../../api/collaborationApi";
import type { ChatRoomListItem, RichCardQuickAction, ApprovalResumeRichCard, TaskSummary } from "../../utils/messageExtraction";
import type { OrchestrationRunSnapshot } from "../MessageProcessingChip";
import type { CollaborationProgramView } from "../../utils/programLifecycle";
import type { DispatchPlanDraftCardModel } from "../DispatchPlanDraftCard";
import MessageBubble, { type MessageData } from "../MessageBubble";
import MessageProcessingChip from "../MessageProcessingChip";
import CeoPipelineProgressChip from "../CeoPipelineProgressChip";
import ReplayProcessingStatusChip from "../ReplayProcessingStatusChip";
import ExecutionProgressChip from "../ExecutionProgressChip";
import CeoAlignmentCard, { hasCeoAlignmentCard } from "../CeoAlignmentCard";
import TaskIntentCandidateCard, { hasTaskIntentCandidate } from "../TaskIntentCandidateCard";
import CeoV2ExecutionStatusCard from "../CeoV2ExecutionStatusCard";
import { StrategyGoalDraftCard } from "../StrategyGoalDraftCard";
import { DispatchPlanDraftCard } from "../DispatchPlanDraftCard";
import DistributionDraftTable from "../DistributionDraftTable";
import DispatchCompileErrorCard from "../DispatchCompileErrorCard";
import WaveSupervisionCard from "../WaveSupervisionCard";
import MainRoomDispatchItemCard from "../MainRoomDispatchItemCard";
import TaskStageCard from "../TaskStageCard";
import DepartmentDispatchCard from "../DepartmentDispatchCard";
import ReportSummaryCard from "../ReportSummaryCard";
import CoordinationRequestCard from "../CoordinationRequestCard";
import EmployeeDeliverableCard from "../EmployeeDeliverableCard";
import GovernanceSummaryCard from "../GovernanceSummaryCard";
import SupervisionDeliverableDigestCard from "../SupervisionDeliverableDigestCard";
import CompletionSummaryCard from "../CompletionSummaryCard";
import RichCardQuickReplyRow from "../RichCardQuickReplyRow";
import ApprovalResumeCard from "../ApprovalResumeCard";
import {
  extractCeoV2DistributionDraft,
  extractDistributionDraftFromMessageContent,
  extractStrategyGoalDraftCard,
  parseStrategyGoalDraftFromMessageContent,
  extractStrategyGoalDraftActions,
  DEFAULT_STRATEGY_GOAL_DRAFT_ACTIONS,
} from "../../utils/messageExtraction";
import {
  extractDispatchPlanDraftFromMetadata,
  parseDispatchPlanDraftFromMessageContent,
} from "../../utils/dispatchPlanDraft";
import {
  resolveDispatchPlanQuickActions,
  shouldShowDispatchPlanQuickActions,
} from "../../utils/dispatchPlanDraftDisplay";
import { shouldHideRichCardPlainText } from "../../utils/richCardMessageDisplay";
import { parseCeoV2ExecutionRibbon } from "../../utils/ceoV2Metadata";
import { resolveOrchestrationLifecycle } from "../../utils/collaborationLifecycle";
import {
  parseCeoPipelineProgress,
  parseProcessingStatus,
} from "../../utils/replayMetadata";
import { applyMainRoomDispatchItemAckStatus } from "../../utils/mainRoomDispatchAck";
import {
  extractCoordinationRequestRichCard,
  extractDepartmentDispatchRichCard,
  extractEmployeeDeliverableRichCard,
  extractMainRoomDispatchItemRichCard,
  extractReportSummaryRichCard,
  extractTaskStageRichCard,
  parseCompletionSummaryDepartments,
  extractSupervisionDeliverableDigestRichCard,
} from "../../utils/rich-card-extractors";
import { extractDispatchCompileIssues } from "../../utils/dispatchCompileIssues";

interface MessageRendererProps {
  message: CollaborationMessage;
  activeRoom: ChatRoomListItem | null;
  activeRoomId: string | null;
  orchestrationRunsByMessageId: Record<string, OrchestrationRunSnapshot>;
  activeProgram: CollaborationProgramView | null;
  routingSourceMessageId: string | null;
  activeReplyMessageId: string | null;
  ackedSubGoalTaskIds: Set<string>;
  dispatchPlanDraftState: MainRoomDispatchPlanState | null;
  sending: boolean;
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
}

export default memo(function MessageRenderer({
  message: m,
  activeRoom,
  activeRoomId,
  orchestrationRunsByMessageId,
  activeProgram,
  routingSourceMessageId,
  activeReplyMessageId,
  ackedSubGoalTaskIds,
  dispatchPlanDraftState,
  sending,
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
}: MessageRendererProps) {
  const sender = useMemo(() => resolveSenderProfile(m), [m, resolveSenderProfile]);

  const richData = useMemo(() => {
    const isAgent = m.senderType === "agent";
    const metadata = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
    const isStreaming = Boolean(metadata && (metadata as any).isStreaming);
    const resumeCard = extractApprovalResumeRichCard(metadata);
    const distributionDraftRows = isAgent
      ? extractCeoV2DistributionDraft(metadata as Record<string, unknown> | null) ??
        extractDistributionDraftFromMessageContent(m.content)
      : null;
    const goalDraftFromMeta =
      isAgent && metadata ? extractStrategyGoalDraftCard(metadata as Record<string, unknown>) : null;
    const goalDraftParsedModel =
      isAgent && !goalDraftFromMeta ? parseStrategyGoalDraftFromMessageContent(m.content) : null;
    const goalDraftCard = goalDraftFromMeta ?? goalDraftParsedModel;
    const dispatchPlanFromMeta =
      isAgent && metadata
        ? extractDispatchPlanDraftFromMetadata(metadata as Record<string, unknown>)
        : null;
    const dispatchPlanCard =
      dispatchPlanFromMeta ??
      (isAgent ? parseDispatchPlanDraftFromMessageContent(m.content) : null);
    const dispatchPlanFromStructuredMetadata = Boolean(dispatchPlanFromMeta);
    let goalDraftQuickActions =
      isAgent && metadata ? extractStrategyGoalDraftActions(metadata as Record<string, unknown>) : null;
    if (goalDraftCard && (!goalDraftQuickActions || goalDraftQuickActions.length === 0)) {
      goalDraftQuickActions = DEFAULT_STRATEGY_GOAL_DRAFT_ACTIONS;
    }
    const dispatchPlanQuickActions: RichCardQuickAction[] | null =
      dispatchPlanCard &&
      !goalDraftCard &&
      shouldShowDispatchPlanQuickActions({
        card: dispatchPlanCard,
        dispatchPlanDraftState,
        messageId: m.id,
      })
        ? resolveDispatchPlanQuickActions({
            card: dispatchPlanCard,
            dispatchPlanDraftState,
          })
        : null;
    const strategyGoalDraftFromStructuredMetadata = Boolean(goalDraftFromMeta);
    const ceoV2Ribbon = parseCeoV2ExecutionRibbon(
      isAgent && metadata ? (metadata as Record<string, unknown>) : null,
      m.messageType,
    );
    const mainRoomDispatchItemCardRaw =
      metadata ? extractMainRoomDispatchItemRichCard(metadata as Record<string, unknown>) : null;
    const mainRoomDispatchItemCard = mainRoomDispatchItemCardRaw
      ? applyMainRoomDispatchItemAckStatus(mainRoomDispatchItemCardRaw, ackedSubGoalTaskIds)
      : null;
    const taskStageCard =
      metadata ? extractTaskStageRichCard(metadata as Record<string, unknown>) : null;
    const departmentDispatchCard =
      metadata ? extractDepartmentDispatchRichCard(metadata as Record<string, unknown>) : null;
    const reportSummaryCard =
      metadata ? extractReportSummaryRichCard(metadata as Record<string, unknown>) : null;
    const coordinationRequestCard =
      metadata ? extractCoordinationRequestRichCard(metadata as Record<string, unknown>) : null;
    const employeeDeliverableCard =
      metadata ? extractEmployeeDeliverableRichCard(metadata as Record<string, unknown>) : null;
    const isDistCompletionSummary =
      metadata?.kind === "main_room_distribution_completion_summary";
    const isWaveSupervision =
      metadata?.kind === "main_room_wave_supervision_nudge";
    const supervisionDigestCard =
      metadata
        ? extractSupervisionDeliverableDigestRichCard(metadata as Record<string, unknown>)
        : null;
    const dispatchCompileIssues = metadata
      ? extractDispatchCompileIssues(metadata as Record<string, unknown>)
      : null;
    const isGovernanceSummary =
      metadata?.source === "task_governance_summary_generated";
    const governanceSummaryAudience =
      isGovernanceSummary && typeof metadata?.audience === "string"
        ? metadata.audience
        : null;
    const completionDepartments =
      isDistCompletionSummary && metadata && !supervisionDigestCard
        ? parseCompletionSummaryDepartments(metadata as Record<string, unknown>, m.content)
        : [];
    const hideRichCardPlainText = shouldHideRichCardPlainText({
      goalDraftCard,
      dispatchPlanCard: goalDraftCard ? null : dispatchPlanCard,
      hasStructuredGovernanceCard: Boolean(
        isWaveSupervision ||
          supervisionDigestCard ||
          (isDistCompletionSummary && completionDepartments.length > 0) ||
          mainRoomDispatchItemCard ||
          taskStageCard ||
          departmentDispatchCard ||
          reportSummaryCard ||
          coordinationRequestCard ||
          employeeDeliverableCard ||
          isGovernanceSummary ||
          (dispatchCompileIssues && dispatchCompileIssues.length > 0),
      ),
    });
    const humanOrchestrationRun =
      m.senderType === "human" ? orchestrationRunsByMessageId[m.id] : undefined;
    const messageMetadata = metadata as Record<string, unknown> | null | undefined;
    const ceoPipelineProgress = parseCeoPipelineProgress(messageMetadata);
    const processingStatusView = parseProcessingStatus(messageMetadata);
    const orchestrationLifecycle = humanOrchestrationRun
      ? resolveOrchestrationLifecycle(humanOrchestrationRun)
      : null;
    const showOrchestrationChip =
      humanOrchestrationRun &&
      orchestrationLifecycle !== "completed" &&
      orchestrationLifecycle !== "failed" &&
      orchestrationLifecycle !== "skipped";

    return {
      isStreaming,
      resumeCard,
      distributionDraftRows,
      goalDraftCard,
      dispatchPlanCard,
      dispatchPlanFromStructuredMetadata,
      goalDraftQuickActions,
      dispatchPlanQuickActions,
      strategyGoalDraftFromStructuredMetadata,
      ceoV2Ribbon,
      mainRoomDispatchItemCard,
      taskStageCard,
      departmentDispatchCard,
      reportSummaryCard,
      coordinationRequestCard,
      employeeDeliverableCard,
      isDistCompletionSummary,
      isWaveSupervision,
      supervisionDigestCard,
      dispatchCompileIssues,
      isGovernanceSummary,
      governanceSummaryAudience,
      completionDepartments,
      hideRichCardPlainText,
      humanOrchestrationRun,
      messageMetadata,
      ceoPipelineProgress,
      processingStatusView,
      showOrchestrationChip,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, dispatchPlanDraftState, ackedSubGoalTaskIds, orchestrationRunsByMessageId, extractApprovalResumeRichCard]);

  return (
    <MessageBubble
      message={m as MessageData}
      sender={sender}
      isStreaming={richData.isStreaming}
      isHighlighted={activeReplyMessageId === m.id}
      hidePlainText={richData.hideRichCardPlainText}
    >
      {richData.showOrchestrationChip ? (
        <MessageProcessingChip
          run={richData.humanOrchestrationRun}
          program={activeRoom?.kind === "main" ? activeProgram : null}
          showRoutingHint={
            !hasThinkingForMessage(m.id) &&
            (routingSourceMessageId === m.id ||
              richData.humanOrchestrationRun!.stage === "before_runMainRoomFlow")
          }
        />
      ) : null}
      {richData.ceoPipelineProgress ? <CeoPipelineProgressChip progress={richData.ceoPipelineProgress} /> : null}
      {richData.processingStatusView && activeRoom?.kind === "main" ? (
        <ReplayProcessingStatusChip status={richData.processingStatusView} />
      ) : null}
      {m.messageType === "tool_call" && richData.messageMetadata ? (
        <ExecutionProgressChip
          skillName={
            typeof richData.messageMetadata.skillName === "string"
              ? richData.messageMetadata.skillName
              : typeof richData.messageMetadata.toolName === "string"
                ? richData.messageMetadata.toolName
                : null
          }
          taskId={typeof richData.messageMetadata.taskId === "string" ? richData.messageMetadata.taskId : null}
        />
      ) : null}
      {hasCeoAlignmentCard(richData.messageMetadata) ? (
        <CeoAlignmentCard
          metadata={richData.messageMetadata}
          sending={sending}
          onConfirmExecution={() => void handleExecutionConfirm()}
          onContinueAligning={handleContinueAlignment}
        />
      ) : null}
      {activeRoom?.kind !== "main" && hasTaskIntentCandidate(richData.messageMetadata) ? (
        <TaskIntentCandidateCard
          metadata={richData.messageMetadata}
          onPatchSpec={handleTaskIntentPatchSpec}
          onConfirm={handleTaskIntentConfirm}
        />
      ) : null}
      {richData.ceoV2Ribbon.show ? <CeoV2ExecutionStatusCard model={richData.ceoV2Ribbon} /> : null}
      {richData.strategyGoalDraftFromStructuredMetadata ? (
        <p className="text-[12px] leading-relaxed text-gray-600">
          请核对下方交付蓝图；要改内容在输入框说明，或点快捷操作。
        </p>
      ) : richData.dispatchPlanFromStructuredMetadata ? (
        <p className="text-[12px] leading-relaxed text-gray-600">
          {richData.dispatchPlanCard?.dispatched
            ? "执行计划已确定，CEO 将按顺序向各部门派活。"
            : richData.dispatchPlanCard?.pendingConfirm
              ? "请点击下方卡片查看完整计划，并确认是否向各部门下发。"
              : "请点击下方卡片查看完整执行计划。"}
        </p>
      ) : null}
      {richData.resumeCard ? <ApprovalResumeCard card={richData.resumeCard} /> : null}
      {richData.distributionDraftRows && richData.distributionDraftRows.length > 0 ? (
        <DistributionDraftTable rows={richData.distributionDraftRows} />
      ) : null}
      {richData.goalDraftCard ? <StrategyGoalDraftCard card={richData.goalDraftCard} /> : null}
      {richData.dispatchPlanCard && !richData.goalDraftCard ? (
        <DispatchPlanDraftCard
          card={richData.dispatchPlanCard}
          mode="compact"
          onOpenDetail={() => openDispatchPlanModal(richData.dispatchPlanCard!)}
        />
      ) : null}
      {richData.dispatchCompileIssues && richData.dispatchCompileIssues.length > 0 ? (
        <DispatchCompileErrorCard issues={richData.dispatchCompileIssues} />
      ) : null}
      {richData.isWaveSupervision && richData.messageMetadata ? (
        <WaveSupervisionCard
          waveDepartments={
            Array.isArray(richData.messageMetadata.waveDepartments)
              ? (richData.messageMetadata.waveDepartments as unknown[]).map((x) => String(x ?? ""))
              : undefined
          }
          parentGoalTaskId={
            typeof richData.messageMetadata.parentGoalTaskId === "string"
              ? richData.messageMetadata.parentGoalTaskId
              : null
          }
          triggerCompletedTaskId={
            typeof richData.messageMetadata.triggerCompletedTaskId === "string"
              ? richData.messageMetadata.triggerCompletedTaskId
              : null
          }
          summary={m.content}
          onFocusTask={openTaskDetail}
        />
      ) : null}
      {richData.mainRoomDispatchItemCard ? (
        <MainRoomDispatchItemCard card={richData.mainRoomDispatchItemCard} />
      ) : null}
      {richData.taskStageCard ? <TaskStageCard card={richData.taskStageCard} /> : null}
      {richData.departmentDispatchCard ? (
        <DepartmentDispatchCard
          card={richData.departmentDispatchCard}
          onFocusTask={focusTaskInSidebar}
          onOpenTask={openTaskDetail}
        />
      ) : null}
      {richData.reportSummaryCard ? (
        <ReportSummaryCard card={richData.reportSummaryCard} onFocusTask={focusTaskInSidebar} />
      ) : null}
      {richData.coordinationRequestCard ? (
        <CoordinationRequestCard
          card={richData.coordinationRequestCard}
          onFocusTask={focusTaskInSidebar}
        />
      ) : null}
      {richData.employeeDeliverableCard ? (
        <EmployeeDeliverableCard
          card={richData.employeeDeliverableCard}
          onFocusTask={openTaskDetail}
        />
      ) : null}
      {richData.isGovernanceSummary ? (
        <GovernanceSummaryCard
          content={m.content}
          audience={richData.governanceSummaryAudience}
        />
      ) : null}
      {richData.supervisionDigestCard ? (
        <SupervisionDeliverableDigestCard
          card={richData.supervisionDigestCard}
          onFocusTask={focusTaskInSidebar}
        />
      ) : richData.isDistCompletionSummary && richData.completionDepartments.length > 0 ? (
        <CompletionSummaryCard
          completedCount={
            typeof richData.messageMetadata?.completedChildCount === "number"
              ? richData.messageMetadata.completedChildCount
              : richData.completionDepartments.length
          }
          departments={richData.completionDepartments}
        />
      ) : null}
      {richData.goalDraftQuickActions && richData.goalDraftQuickActions.length > 0 ? (
        <RichCardQuickReplyRow
          actions={richData.goalDraftQuickActions}
          sending={sending}
          disabled={sending}
          tone="emphasized"
          onPick={(a) => void handleRichCardQuickAction(a)}
        />
      ) : null}
      {richData.dispatchPlanQuickActions && richData.dispatchPlanQuickActions.length > 0 ? (
        <RichCardQuickReplyRow
          actions={richData.dispatchPlanQuickActions}
          sending={sending}
          disabled={sending}
          tone="emphasized"
          onPick={(a) => void handleRichCardQuickAction(a)}
        />
      ) : null}
    </MessageBubble>
  );
}, (prev, next) => {
  // Custom comparison: skip re-render if message data + key state are identical
  return (
    prev.message === next.message &&
    prev.message.metadata === next.message.metadata &&
    prev.sending === next.sending &&
    prev.activeReplyMessageId === next.activeReplyMessageId &&
    prev.activeRoom === next.activeRoom &&
    prev.dispatchPlanDraftState === next.dispatchPlanDraftState &&
    prev.ackedSubGoalTaskIds === next.ackedSubGoalTaskIds &&
    prev.routingSourceMessageId === next.routingSourceMessageId &&
    prev.orchestrationRunsByMessageId === next.orchestrationRunsByMessageId
  );
});
