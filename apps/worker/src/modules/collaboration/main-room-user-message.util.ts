/**
 * 主群轻量语义信号（规划衔接 / 寒暄判定）。**不**用于上下文注入门控（由 Context Grounding Planner 负责）。
 */

/** 用户是否在闲聊中带入目标/计划（直连路径轻量注入规划衔接，不触发工具） */
export function userMessageSuggestsPlanningContinuity(userMessage: string): boolean {
  const t = String(userMessage ?? '').trim();
  if (t.length < 4) return false;
  return /(目标|计划|规划|OKR|okr|里程碑|路线图|roadmap|季度|拆解|落地|执行|战略|复盘|优先级)/i.test(t);
}

/**
 * quick 助手回复是否明确邀请进入规划闭环（双信号，避免「顺带提到计划」误升级）。
 */
export function assistantReplySuggestsPlanningHandoff(assistantText: string): boolean {
  const t = String(assistantText ?? '').trim();
  if (t.length < 28) return false;
  const topic = /(OKR|okr|里程碑|路线图|roadmap|季度目标|战略规划|执行闭环|拆解.{0,6}目标|对齐.{0,6}目标|落地.{0,6}计划)/i.test(
    t,
  );
  const invite = /(下一步|要不要|建议你|若你|如果需要|咱们可以|可以继续|随时叫我|再告诉我|展开说说|细化)/i.test(t);
  return topic && invite;
}

/** 纯寒暄短句：不预约 planning_continuity_hint，避免过度升级 */
export function userMessageIsPureCasual(userMessage: string): boolean {
  const t = String(userMessage ?? '').trim();
  if (t.length === 0 || t.length > 48) return false;
  return (
    /^(在吗|在嘛|哈喽|嗨|你好|您好|谢谢|感谢|收到|好的|好哒|嗯嗯|嗯|OK|ok|再见|拜拜|辛苦啦|辛苦了)[\s！!。？?～~]*$/i.test(
      t,
    ) ||
    /^(你|您)(在吗|在嘛)[\s！!。？?～~]*$/i.test(t)
  );
}
