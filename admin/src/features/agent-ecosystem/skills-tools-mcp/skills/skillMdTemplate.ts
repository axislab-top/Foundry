/** Client-side SKILL.md starter (mirrors @foundry/skill-md default; kept local to avoid bundling api package). */
export function defaultSkillMdTemplate(name = 'my-skill'): string {
  return `---
name: ${name}
description: Describe what this skill does and when the agent should activate it (include keywords).
category: General
implementationType: prompt
toolSchema: {"type":"object","properties":{}}
---

# ${name}

## 何时使用

- （列出触发场景）

## 步骤

1. …

## 输出格式

- …

## 边界

- …

## 相关工具

- （可选）说明应调用的 tool.* / mcp.* 名称
`;
}
