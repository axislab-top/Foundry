import { memo } from "react";
import { Crown, Building2, User } from "lucide-react";

export type RoomListItemData = {
  id: string;
  kind: "main" | "department" | "direct";
  title: string;
  subtitle?: string;
  roomType?: string;
  unreadCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  const date = new Date(iso);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  }
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });
}

const AVATAR_STYLES: Record<RoomListItemData["kind"], string> = {
  main: "bg-[#f2c94c] text-[#7a5c00]",
  department: "bg-[#95b8d1] text-white",
  direct: "bg-[#b8b8b8] text-white",
};

export default memo(function RoomListItem({
  room,
  active,
  onClick,
}: {
  room: RoomListItemData;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = room.kind === "main" ? Crown : room.kind === "direct" ? User : Building2;
  const unread = room.unreadCount ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[#ececec] ${
        active ? "md:bg-[#ececec]" : "md:hover:bg-[#f5f5f5]"
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${AVATAR_STYLES[room.kind]}`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1 border-b border-gray-100 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-[15px] leading-tight ${
              unread > 0 ? "font-medium text-gray-900" : "font-normal text-gray-900"
            }`}
          >
            {room.title}
          </span>
          {room.lastMessageAt && (
            <span className="shrink-0 text-[11px] text-gray-400">{timeAgo(room.lastMessageAt)}</span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-gray-400">
            {room.lastMessage ?? room.subtitle ?? ""}
          </span>
          {unread > 0 && (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#fa5151] px-1 text-[10px] font-medium leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});
