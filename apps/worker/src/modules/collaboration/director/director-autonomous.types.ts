import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';

/**
 * W7：部门房 Director 自主路径输入（非 main room；由 {@link DepartmentDirectReplyService} 注入）。
 */
export type DirectorAutonomousDepartmentInput = {
  companyId: string;
  roomId: string;
  messageId: string;
  threadId?: string | null;
  contentText: string;
  roomContext: RoomContext;
  mentionedAgentIds?: string[];
  mentionedNodeIds?: string[];
  humanSenderId?: string | null;
  ceoAgentId?: string | null;
  /** 已由上层解析的部门 Director agent id */
  directorAgentId: string;
  /** W8：与灰度 `?ff=director_autonomous` 对齐 */
  clientFeatureFlags?: string[];
  /** 人类消息 metadata.messageCategory（如 task_publish） */
  messageCategory?: string | null;
};

/** LLM 分类器输出的委派草案（替代正文启发式拆行）。 */
export type DirectorAutonomousDelegationInput = DirectorAutonomousDepartmentInput & {
  delegationOutline: Array<{ title: string; suggestedExecutorAgentId?: string }>;
  classificationConfidence?: number;
  classificationExplanation?: string;
};
