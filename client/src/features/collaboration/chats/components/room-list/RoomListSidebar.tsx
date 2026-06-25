import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2 } from "lucide-react";
import { useCompanyStore } from "@/shared/store/companyStore";
import { fetchAgents } from "@/features/organization/api/organizationApi";
import { organizationKeys } from "@/features/organization/api/queryKeys";
import { useChatStore } from "../../store/chatStore";
import { findOrCreateDirectRoom, markRoomRead } from "../../api/collaborationApi";
import { normalizeCollaborationRooms } from "../../utils/messageExtraction";
import RoomListItem, { type RoomListItemData } from "../RoomListItem";

type ListItem =
  | { type: "room"; room: RoomListItemData }
  | { type: "agent"; agent: { id: string; name: string; role: string }; roomId?: string };

export default function RoomListSidebar() {
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const setActiveRoomId = useChatStore((s) => s.setActiveRoomId);
  const setMobileView = useChatStore((s) => s.setMobileView);
  const loadingRooms = useChatStore((s) => s.loadingRooms);
  const mainRoomBootstrapping = useChatStore((s) => s.mainRoomBootstrapping);
  const lastMessageByRoomId = useChatStore((s) => s.lastMessageByRoomId);
  const rooms = useChatStore((s) => s.rooms);
  const errorText = useChatStore((s) => s.errorText);
  const [openingAgentId, setOpeningAgentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const agentsQuery = useQuery({
    queryKey: organizationKeys.agents(activeCompany?.id),
    queryFn: fetchAgents,
    enabled: Boolean(activeCompany?.id),
    staleTime: 60_000,
  });

  const agents = agentsQuery.data ?? [];

  // Map agentId → direct room
  const directRoomByAgentId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rooms) {
      if (r.kind === "direct" && r.directAgentId) map.set(r.directAgentId, r.id);
    }
    return map;
  }, [rooms]);

  // Merge rooms + agents into a single unified list
  const items = useMemo((): ListItem[] => {
    const result: ListItem[] = [];
    const agentIdsInRooms = new Set<string>();

    // Add all rooms (main → department → direct)
    const sorted = [
      ...rooms.filter((r) => r.kind === "main"),
      ...rooms.filter((r) => r.kind === "department"),
      ...rooms.filter((r) => r.kind === "direct"),
    ];
    for (const room of sorted) {
      const withMsg = enrichLastMessage(room, lastMessageByRoomId);
      result.push({ type: "room", room: withMsg });
      if (room.kind === "direct" && room.directAgentId) {
        agentIdsInRooms.add(room.directAgentId);
      }
    }

    // Add agents that don't have a direct room yet
    for (const agent of agents) {
      if (!agentIdsInRooms.has(agent.id)) {
        result.push({
          type: "agent",
          agent: { id: agent.id, name: agent.name || agent.role || "Agent", role: agent.role || "" },
        });
      }
    }

    return result;
  }, [rooms, agents, lastMessageByRoomId]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (item.type === "room") {
        return item.room.title.toLowerCase().includes(q) || (item.room.lastMessage ?? "").toLowerCase().includes(q);
      }
      return item.agent.name.toLowerCase().includes(q) || item.agent.role.toLowerCase().includes(q);
    });
  }, [items, search]);

  const handleRoomClick = (roomId: string) => {
    setActiveRoomId(roomId);
    setMobileView("chat");
    // 标记已读：清除本地未读 + 调用后端 API
    const room = rooms.find((r) => r.id === roomId);
    if (room && (room.unreadCount ?? 0) > 0) {
      useChatStore.getState().clearRoomUnread(roomId);
      markRoomRead(roomId).catch(() => undefined);
    }
  };

  const handleAgentClick = async (agent: { id: string; name: string }) => {
    const existingRoomId = directRoomByAgentId.get(agent.id);
    if (existingRoomId) {
      handleRoomClick(existingRoomId);
      return;
    }
    setOpeningAgentId(agent.id);
    try {
      const room = await findOrCreateDirectRoom(agent.id, agent.name);
      const currentRooms = useChatStore.getState().rooms;
      if (!currentRooms.some((r) => r.id === room.id)) {
        const [normalized] = normalizeCollaborationRooms([room]);
        useChatStore.getState().setRooms([...currentRooms, normalized]);
      }
      handleRoomClick(room.id);
    } catch (e: unknown) {
      useChatStore.getState().setError(e instanceof Error ? e.message : "创建私聊失败");
    } finally {
      setOpeningAgentId(null);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-full flex-col bg-white md:rounded-xl md:border md:border-gray-200 md:shadow-sm">
        {/* Header */}
        <div className="shrink-0 bg-[#f7f7f7] px-4 py-3 md:rounded-t-xl md:bg-white md:px-4 md:py-3.5">
          <h2 className="truncate text-[17px] font-medium text-gray-900 md:text-sm md:font-bold">
            {activeCompany?.name ?? "协作空间"}
          </h2>
          {/* Search */}
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索"
              className="w-full rounded-md border-0 bg-white py-2 pl-9 pr-8 text-[13px] text-gray-800 outline-none placeholder:text-gray-400 md:border md:border-gray-200 md:bg-gray-50 md:py-1.5 md:pl-8 md:pr-7 md:text-xs md:focus:border-[#1e3a5f] md:focus:bg-white md:focus:ring-1 md:focus:ring-[#1e3a5f]/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Unified list */}
        <div className="flex-1 overflow-y-auto">
          {mainRoomBootstrapping && (
            <div className="mx-3 mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
              正在初始化主群…
            </div>
          )}
          {errorText && (
            <div className="mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorText}
            </div>
          )}
          {loadingRooms ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-gray-400">
              {search ? "无匹配结果" : "暂无联系人"}
            </div>
          ) : (
            <div className="[&>button:last-child>div>div]:border-b-0 [&>button:last-child>div>div]:pb-0">
              {filtered.map((item) =>
                item.type === "room" ? (
                  <RoomListItem
                    key={item.room.id}
                    room={item.room}
                    active={activeRoomId === item.room.id}
                    onClick={() => handleRoomClick(item.room.id)}
                  />
                ) : (
                  <AgentListItem
                    key={item.agent.id}
                    agent={item.agent}
                    isOpening={openingAgentId === item.agent.id}
                    onClick={() => void handleAgentClick(item.agent)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/** Agent list item (no room yet) */
function AgentListItem({
  agent,
  isOpening,
  onClick,
}: {
  agent: { id: string; name: string; role: string };
  isOpening: boolean;
  onClick: () => void;
}) {
  const initials = agent.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      disabled={isOpening}
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[#ececec] md:hover:bg-[#f5f5f5]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#b8b8b8] text-[13px] font-medium text-white">
        {isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : initials}
      </div>
      <div className="min-w-0 flex-1 border-b border-gray-100 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-normal text-gray-900">{agent.name}</span>
          <span className="shrink-0 text-[11px] text-gray-400">私聊</span>
        </div>
        <p className="mt-1 truncate text-[13px] text-gray-400">{agent.role || "Agent"}</p>
      </div>
    </button>
  );
}

/** Merge lastMessage from cache into room */
function enrichLastMessage(
  room: RoomListItemData,
  cache: Record<string, { text: string; at: string }>,
): RoomListItemData {
  if (room.lastMessage) return room;
  const cached = cache[room.id];
  if (!cached) return room;
  return { ...room, lastMessage: cached.text, lastMessageAt: cached.at };
}
