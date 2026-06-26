/**
 * 用户在与战略目标草稿交互时的短语解析。
 *
 * 主群 goal_lock **执行入口**已改为 replay 委托 + `heavyPipelineKind` + Redis 校验；本模块保留供单测与辅助匹配（如 `isExplicitExecutionIntentMessage`）。
 */

/** 「定稿并下发编排」类短句（保守匹配）。 */
export function isFinalizeGoalLockMessage(rawText: string): boolean {
  const t = String(rawText ?? '').trim().replace(/\s+/g, '');
  if (t.length < 2 || t.length > 120) return false;
  if (
    /^(定稿|确认下发|同意执行|确认执行|开始编排|下发任务|执行拆解)$/.test(t) ||
    /^确认进入.*执行/.test(t)
  ) {
    return true;
  }
  if (t.length <= 48) {
    if (/定稿并下发|同意并开始|确认并开始编排|确认并开始部门编排|开始分配任务|开始部门编排/.test(t)) return true;
    if (/可以开始|开始执行|就这样开始|进入编排|继续编排/.test(t)) return true;
  }
  if (t.length <= 12) {
    if (/^(可以了|开始吧|就这样吧|就这样|好了|行|确认|ok)$/.test(t)) return true;
  }
  if (t.length <= 24) {
    if (/^(直接开始|你来定|按你的来|不用问了|别问了|符合预期)$/.test(t)) return true;
  }
  return false;
}

/** 用户表达需正式编排/执行，但未必是「定稿确认」短句（Ask 模式升级信号等）。 */
export function isExplicitExecutionIntentMessage(rawText: string): boolean {
  const t = String(rawText ?? '').trim().replace(/\s+/g, '');
  if (t.length < 4 || t.length > 500) return false;
  if (isFinalizeGoalLockMessage(rawText)) return true;
  if (
    /(帮我做|请执行|安排.{0,6}部门|下发任务|启动编排|开始编排|跨部门落地|正式编排|进入执行|发布任务|分工落地)/.test(
      t,
    )
  ) {
    return true;
  }
  if (t.length <= 80 && /(执行|落地|编排|下发).{0,8}(吧|了|一下)/.test(t)) return true;
  return false;
}
