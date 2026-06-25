import type { CollaborationMessage } from "../api/collaborationApi";



export type DeptMessageVisibilityOptions = {

  /** 部门群 execution 模式：展示派单与交付系统消息 */

  collaborationMode?: string | null;

};



function messageMetadata(message: CollaborationMessage): Record<string, unknown> | null {

  return message.metadata && typeof message.metadata === "object"

    ? (message.metadata as Record<string, unknown>)

    : null;

}



function richCardType(meta: Record<string, unknown> | null): string {

  if (!meta) return "";

  const rc = meta.richCard;

  if (rc && typeof rc === "object" && !Array.isArray(rc)) {

    return String((rc as Record<string, unknown>).cardType ?? "").trim();

  }

  return "";

}



export function messageThreadId(message: CollaborationMessage): string {

  const meta = messageMetadata(message);

  const tid = String(meta?.threadId ?? meta?.collaborationThreadId ?? "").trim();

  return tid && tid.toLowerCase() !== "main" ? tid : "main";

}



/** 员工交付卡：产品可见产出，任何模式下都不应隐藏。 */

export function hasEmployeeDeliverableCard(message: CollaborationMessage): boolean {

  return richCardType(messageMetadata(message)) === "employee_deliverable";

}



/** 「执行」Tab 应展示的消息（派单、交付、执行线程上下文）。 */

export function isDeptExecutionTabMessage(

  message: CollaborationMessage,

  executionThreadId?: string | null,

): boolean {

  if (hasEmployeeDeliverableCard(message)) return true;

  const meta = messageMetadata(message);

  const cardType = richCardType(meta);

  if (cardType === "department_dispatch") return true;

  const src = String(meta?.source ?? "").trim();

  if (src === "task_dispatch" || src === "department_task_dispatch") return true;

  const execId = String(executionThreadId ?? "").trim();

  if (execId && messageThreadId(message) === execId) return true;

  return false;

}



/** 部门群默认隐藏的「系统/工程镜像」消息（discussion 对话模式）。 */

export function isDeptChatNoise(

  message: CollaborationMessage,

  options?: DeptMessageVisibilityOptions,

): boolean {

  const meta = messageMetadata(message);

  const src = String(meta?.source ?? "").trim();

  const messageType = String(message.messageType ?? "").trim();

  const cardType = richCardType(meta);

  // 用户可见产出：派单卡与交付物始终展示，不因协作模式折叠
  if (cardType === "employee_deliverable" || cardType === "department_dispatch") {
    return false;
  }



  if (messageType === "tool_call") return true;



  if (messageType === "system") {

    if (src === "department_task_stage_message") return true;

    if (src === "task_dispatch") return true;

  }



  if (src === "director_dept_report_summary") return true;

  if (src === "director_employee_collab_w10") return true;



  return false;

}



/** @deprecated 使用 isDeptChatNoise */

export function isDeptSystemStageNoise(message: CollaborationMessage): boolean {

  return isDeptChatNoise(message) && String(message.messageType ?? "") === "system";

}



export function countDeptChatNoise(

  messages: CollaborationMessage[],

  options?: DeptMessageVisibilityOptions,

): number {

  return messages.filter((m) => isDeptChatNoise(m, options)).length;

}



/** @deprecated 使用 countDeptChatNoise */

export function countDeptSystemStageNoise(messages: CollaborationMessage[]): number {

  return countDeptChatNoise(messages);

}


