import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCompanyStore } from "@/shared/store/companyStore";
import { useChatStore } from "../store/chatStore";
import { listRooms, getRoom, markRoomRead, listRoomMembers } from "../api/collaborationApi";
import { pollListRoomsUntilMain } from "../utils/waitForMainRoom";
import { normalizeCollaborationRooms, sortCollaborationRooms, type ChatRoomListItem } from "../utils/messageExtraction";
import { listCompanyDepartments } from "@/features/memory/shared/companyDepartmentsApi";
import { getMyActiveCompanyMembership } from "@/shared/api/companyMembershipApi";
import { getTask } from "@/features/tasks/api/tasksApi";

type ChatsLocationState = {
  bootstrapMainRoom?: boolean;
};

export function useRoomData() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeCompany = useCompanyStore((s) => s.activeCompany);

  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const setActiveRoomId = useChatStore((s) => s.setActiveRoomId);
  const setRooms = useChatStore((s) => s.setRooms);
  const setLoadingRooms = useChatStore((s) => s.setLoadingRooms);
  const setMainRoomBootstrapping = useChatStore((s) => s.setMainRoomBootstrapping);
  const setError = useChatStore((s) => s.setError);
  const setCompanyDepartmentOptions = useChatStore((s) => s.setCompanyDepartmentOptions);
  const setCompanyMembershipRole = useChatStore((s) => s.setCompanyMembershipRole);
  const setDetailTaskId = useChatStore((s) => s.setDetailTaskId);
  const setDetailTask = useChatStore((s) => s.setDetailTask);
  const setRoomMembers = useChatStore((s) => s.setRoomMembers);
  const setLoadingMembers = useChatStore((s) => s.setLoadingMembers);

  // Load rooms
  useEffect(() => {
    if (!activeCompany?.id) return;
    let disposed = false;

    const applyNormalizedRooms = (normalized: ReturnType<typeof normalizeCollaborationRooms>) => {
      const sorted = sortCollaborationRooms(normalized);
      setRooms(sorted);
      const deepLinkRoom = searchParams.get("room")?.trim();
      const deepLinkMatch = deepLinkRoom && sorted.some((r) => r.id === deepLinkRoom);
      const main = sorted.find((r) => r.kind === "main");
      const nextActive = deepLinkMatch ? deepLinkRoom! : (main?.id ?? sorted[0]?.id ?? "");
      setActiveRoomId(nextActive);
    };

    void (async () => {
      setLoadingRooms(true);
      setMainRoomBootstrapping(false);
      setError("");
      const bootstrapFromCreate =
        (location.state as ChatsLocationState | null)?.bootstrapMainRoom === true;

      try {
        let rows = await listRooms();
        if (disposed) return;
        let normalized = normalizeCollaborationRooms(rows);
        const hasMain = normalized.some((r) => r.kind === "main");

        if (!hasMain && (bootstrapFromCreate || normalized.length === 0)) {
          setMainRoomBootstrapping(true);
          const main = await pollListRoomsUntilMain();
          if (disposed) return;
          setMainRoomBootstrapping(false);
          if (main) {
            rows = await listRooms();
            if (disposed) return;
            normalized = normalizeCollaborationRooms(rows);
            if (bootstrapFromCreate) {
              navigate(".", { replace: true, state: {} });
            }
          } else {
            setError("主群未就绪，请刷新页面；若仍失败，请确认 API/Worker 与消息队列已启动。");
          }
        }

        applyNormalizedRooms(normalized);
      } catch (e: unknown) {
        if (disposed) return;
        setError(e instanceof Error ? e.message : "加载群聊列表失败");
      } finally {
        if (!disposed) setLoadingRooms(false);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [activeCompany?.id, searchParams, location.state, navigate, setRooms, setActiveRoomId, setLoadingRooms, setMainRoomBootstrapping, setError]);

  // Load room detail to sync collaborationMode (must not depend on `rooms` — setRooms would loop)
  useEffect(() => {
    if (!activeCompany?.id || !activeRoomId) return;
    const activeKind = useChatStore.getState().rooms.find((x) => x.id === activeRoomId)?.kind;
    if (activeKind !== "main" && activeKind !== "department") return;
    let disposed = false;
    void getRoom(activeRoomId)
      .then((full) => {
        if (disposed || !full) return;
        const mode = full.collaborationMode ?? "discussion";
        const currentRooms = useChatStore.getState().rooms;
        const current = currentRooms.find((row) => row.id === activeRoomId);
        if (!current || current.collaborationMode === mode) return;
        setRooms(
          currentRooms.map((row: ChatRoomListItem) =>
            row.id === activeRoomId ? { ...row, collaborationMode: mode } : row,
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [activeCompany?.id, activeRoomId, setRooms]);

  // Load room members when active room changes
  useEffect(() => {
    if (!activeRoomId) {
      setRoomMembers([]);
      return;
    }
    let disposed = false;
    setLoadingMembers(true);
    listRoomMembers(activeRoomId)
      .then((members) => {
        if (disposed) return;
        setRoomMembers(members ?? []);
      })
      .catch(() => {
        if (!disposed) setRoomMembers([]);
      })
      .finally(() => {
        if (!disposed) setLoadingMembers(false);
      });
    return () => {
      disposed = true;
    };
  }, [activeRoomId, setRoomMembers, setLoadingMembers]);

  // Load company departments for main room
  useEffect(() => {
    const activeKind = useChatStore.getState().rooms.find((r) => r.id === activeRoomId)?.kind;
    if (activeKind !== "main") {
      setCompanyDepartmentOptions([]);
      return;
    }
    let disposed = false;
    listCompanyDepartments()
      .then((rows) => {
        if (disposed) return;
        setCompanyDepartmentOptions(rows.map((d) => ({ slug: d.slug, name: d.name })));
      })
      .catch(() => {
        if (!disposed) setCompanyDepartmentOptions([]);
      });
    return () => {
      disposed = true;
    };
  }, [activeRoomId, setCompanyDepartmentOptions]);

  // Load company membership role
  useEffect(() => {
    if (!activeCompany?.id) {
      setCompanyMembershipRole(null);
      return;
    }
    void getMyActiveCompanyMembership(activeCompany.id)
      .then((m) => setCompanyMembershipRole(m?.role ?? null))
      .catch(() => setCompanyMembershipRole(null));
  }, [activeCompany?.id, setCompanyMembershipRole]);

  // Load detail task
  useEffect(() => {
    const detailTaskId = useChatStore.getState().detailTaskId;
    if (!detailTaskId) {
      setDetailTask(null);
      return;
    }
    void getTask(detailTaskId)
      .then((t) => setDetailTask(t))
      .catch(() => setDetailTask(null));
  }, [setDetailTaskId, setDetailTask]);

  const switchRoom = useCallback(
    (roomId: string) => {
      setActiveRoomId(roomId);
      useChatStore.getState().setMobileView("chat");
      // 标记已读：清除本地未读 + 调用后端 API
      const room = useChatStore.getState().rooms.find((r) => r.id === roomId);
      if (room && (room.unreadCount ?? 0) > 0) {
        useChatStore.getState().clearRoomUnread(roomId);
        markRoomRead(roomId).catch(() => undefined);
      }
    },
    [setActiveRoomId],
  );

  return { switchRoom };
}
