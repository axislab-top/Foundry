import type { MentionAliasConfig } from './types.js';

/**
 * 不在代码里维护职务/部门清单。
 * 请在管理后台为公司配置 collaboration mention aliases（或依赖 Agent 显示名 / 括号内别称的自动命中）。
 */
export const DEFAULT_MENTION_ALIASES: MentionAliasConfig[] = [];
