/**
 * 直聊 Skill 使用指引（Progressive Disclosure 最佳实践）。
 *
 * - 目录（name + description）只通过 LLM function tools 暴露，不在 system 里重复列举。
 * - system 仅说明何时/如何调用；正文在模型调用 Skill 名后由 executeSkill 展开。
 */

export type DirectAgentSkillUsageGuidanceParams = {
  /** buildEffectiveOpenAiTools 注入了 foundry.tool_catalog 时为 true */
  usesToolCatalog: boolean;
  skillCount: number;
};

/**
 * 短行为指引：不重复 skill 名/描述（避免与 tool definition 双份 token）。
 */
export function buildDirectAgentSkillUsageGuidance(params: DirectAgentSkillUsageGuidanceParams): string {
  if (params.skillCount <= 0) return '';
  if (params.usesToolCatalog) {
    return [
      '【Skill 能力】你已绑定多项 Skill。请先调用 foundry.tool_catalog 查看可用 Skill 名称与简介；',
      '仅在任务需要时按名称调用对应 Skill（或 tool.* / mcp.*）；闲聊、简单确认无需调用。',
      '调用 Skill 名后会收到完整指令，请据此完成用户请求后再用中文回复用户。',
    ].join('');
  }
  return [
    '【Skill 能力】你已绑定 Skill，它们以 function tool 形式暴露（名称 + 短描述）。',
    '仅在任务需要时调用；闲聊、简单确认无需调用。调用 Skill 后会展开完整指令，请据此完成用户请求。',
    '跨部门协调（联络其他部门总监、摸底用人需求、派发任务）属于必须调用 Skill 的场景，不得口头承诺「稍后 @」而不调用。',
    '不要向用户提及内部 tool、Skill 或路由元数据。',
  ].join('');
}
