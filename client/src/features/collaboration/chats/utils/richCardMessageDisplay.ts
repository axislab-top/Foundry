import type { DispatchPlanDraftCardModel } from "../components/DispatchPlanDraftCard";
import type { StrategyGoalDraftCardModel } from "../components/StrategyGoalDraftCard";

/** 富卡片已结构化展示时，隐藏气泡内重复的纯文本正文 */
export function shouldHideRichCardPlainText(params: {
  goalDraftCard: StrategyGoalDraftCardModel | null;
  dispatchPlanCard: DispatchPlanDraftCardModel | null;
  /** 波次推进、结案 digest、部门派单、回报/协调、员工交付、编译错误等结构化卡片 */
  hasStructuredGovernanceCard?: boolean;
}): boolean {
  if (params.hasStructuredGovernanceCard) return true;
  if (params.goalDraftCard && params.goalDraftCard.strategicPhases.length > 0) return true;
  if (params.dispatchPlanCard && !params.goalDraftCard && params.dispatchPlanCard.assignments.length > 0) {
    return true;
  }
  return false;
}
