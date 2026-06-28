import type { CollaborationRoomCollaborationMode } from '@contracts/types';

/** 将 RPC/DB 原始值规范为房间协作模式；无法识别时回落到 discussion（与历史默认一致）。 */
export function normalizeRoomCollaborationMode(raw: unknown): CollaborationRoomCollaborationMode {
  const v = String(raw ?? '').trim();
  if (v === 'discussion' || v === 'direct' || v === 'execution' || v === 'approval_wait') {
    return v;
  }
  return 'discussion';
}

/**
 * RPC/JSON 上协作模式字段名可能为 camelCase 或 snake_case；
 * 缺省返回 `undefined`（勿与「显式空串」混淆）。
 */
export function readCollaborationModeFromRoomPayload(room: object | null | undefined): unknown {
  if (!room || typeof room !== 'object') return undefined;
  const o = room as Record<string, unknown>;
  if (o.collaborationMode !== undefined && o.collaborationMode !== null) return o.collaborationMode;
  if (o.collaboration_mode !== undefined && o.collaboration_mode !== null) return o.collaboration_mode;
  return undefined;
}
