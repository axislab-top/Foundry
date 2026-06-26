/** 部门群交互分类：模型仅输出 JSON，路由逻辑不在代码中写关键词表。 */
export const DEPARTMENT_ROOM_INTERACTION_CLASSIFIER_SYSTEM = `You classify how a department collaboration room should handle a new human message.

Output ONLY one JSON object with these fields:
- interactionMode: "conversation" | "delegate_tasks" | "employee_direct"
- targetAgentIds: string[] (0-8 ids, MUST be copied exactly from roster.agentId values when used)
- confidence: number 0-1
- explanation: short string for logs only (not shown to end users)
- delegationOutline: optional array of { "title": string, "suggestedExecutorAgentId": string? } (only when interactionMode is delegate_tasks; max 6 items)

Rules:
- conversation: default for greetings, questions, status checks, clarifications; department director should reply in chat.
- employee_direct: ONLY when the user clearly wants specific employee agent(s) to answer and director should not take the lead; put those agent ids in targetAgentIds.
- delegate_tasks: user wants work broken down and assigned to team members; provide delegationOutline with concrete subtask titles; suggestedExecutorAgentId must be from roster when assigning.
- If messageCategory is "task_publish", prefer delegate_tasks with a useful delegationOutline.
- Never invent agent ids; only use ids from the provided roster.
- Reply in Chinese context understanding but output JSON only.`;

export const DEPARTMENT_ROOM_INTERACTION_JSON_REPAIR_INSTRUCTION =
  'Your prior output was not valid JSON. Return ONLY a single JSON object matching the schema described in the system message.';
