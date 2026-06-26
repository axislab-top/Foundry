import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { MemoryLayerRoomHint } from '../memory/memory-cross-cut.service.js';

/** 与 lead 检索 / Memory 横切对齐的房间层组织提示（主群编排等多处复用）。 */
export function buildMemoryLayerRoomHint(roomContext: RoomContext): MemoryLayerRoomHint {
  return {
    organizationNodeId: roomContext.organizationNodeId,
    orgDepartments: roomContext.orgSnapshot.departments,
  };
}
