import type { CollaborationDeliverableArtifactRow } from './employee-deliverable-artifacts.util.js';

export type PostEmployeeDeliverableParams = {
  companyId: string;
  actor: { id: string; roles: string[] };
  roomId: string;
  agentId: string;
  traceId: string;
  taskId: string;
  skillName: string;
  skillExecutionId: string;
  department?: string | null;
  artifacts: CollaborationDeliverableArtifactRow[];
  previewFallback?: string;
  threadId?: string | null;
};

/** 员工交付消息正文：同事口吻，非系统通知腔。 */
export function buildEmployeeDeliverableVisibleContent(
  artifacts: CollaborationDeliverableArtifactRow[],
  skillName: string,
  previewFallback?: string,
): string {
  const named = artifacts.find((a) => String(a.label ?? '').trim())?.label?.trim();
  const hasFile = artifacts.some((a) => String(a.fileAssetId ?? '').trim() || String(a.uri ?? '').trim());
  const preview =
    artifacts.find((a) => String(a.content ?? '').trim() && a.type !== 'skill')?.content?.slice(0, 200) ||
    previewFallback?.slice(0, 200) ||
    '';

  if (hasFile) {
    const subject = named || '这份交付';
    return preview ? `${subject}好了：${preview}` : `${subject}好了，请查收附件。`;
  }
  if (preview) {
    return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
  }
  return `这边已按「${skillName}」完成，请过目。`;
}

export function buildEmployeeDeliverableMessagePayload(params: PostEmployeeDeliverableParams): {
  content: string;
  metadata: Record<string, unknown>;
} {
  const content = buildEmployeeDeliverableVisibleContent(
    params.artifacts,
    params.skillName,
    params.previewFallback,
  ).slice(0, 4000);

  return {
    content,
    metadata: {
      traceId: params.traceId,
      taskId: params.taskId,
      agentId: params.agentId,
      skillName: params.skillName,
      at: new Date().toISOString(),
      roomId: params.roomId,
      ...(params.threadId ? { threadId: params.threadId, collaborationThreadId: params.threadId } : {}),
      richCard: {
        cardType: 'employee_deliverable',
        taskId: params.taskId,
        skillExecutionId: params.skillExecutionId,
        skillName: params.skillName,
        department: params.department ?? null,
        status: 'completed',
        artifacts: params.artifacts,
      },
    },
  };
}
