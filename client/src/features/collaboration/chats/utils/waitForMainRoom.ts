import { findMainRoom, listRooms, type CollaborationRoom } from "@/features/collaboration/chats/api/collaborationApi";

export function findMainCollaborationRoom(
  rows: CollaborationRoom[],
): CollaborationRoom | undefined {
  return rows.find((r) => String(r.roomType ?? "").toLowerCase() === "main");
}

export async function pollListRoomsUntilMain(options?: {
  intervalMs?: number;
  maxAttempts?: number;
}): Promise<CollaborationRoom | null> {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 15;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await findMainRoom();
    } catch {
      // findMain 失败时仍尝试从列表解析
    }
    const rows = await listRooms();
    const main = findMainCollaborationRoom(rows);
    if (main) return main;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return null;
}