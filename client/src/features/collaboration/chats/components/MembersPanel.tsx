import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Bot, User } from "lucide-react";
import type { RoomMember } from "../api/collaborationApi";

export default memo(function MembersPanel({
  members,
  agentDisplayMap,
  loading,
}: {
  members: RoomMember[];
  agentDisplayMap: Record<string, { name: string; role?: string }>;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...members].sort((a, b) => {
    const aOnline = !a.leftAt;
    const bOnline = !b.leftAt;
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    if (a.memberType !== b.memberType) return a.memberType === "agent" ? -1 : 1;
    return 0;
  });

  const onlineCount = sorted.filter((m) => !m.leftAt).length;
  const preview = expanded ? sorted : sorted.slice(0, 6);

  const roleLabels: Record<string, string> = {
    system: "系统",
    ceo: "CEO",
    director: "主管",
    executor: "员工",
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">成员</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
          {onlineCount} 在线
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-7 w-7 animate-pulse rounded-full bg-gray-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-[11px] text-gray-400">暂无成员</p>
      ) : (
        <>
          <div className="space-y-1">
            {preview.map((member) => {
              const isAgent = member.memberType === "agent";
              const profile = isAgent ? agentDisplayMap[member.memberId] : undefined;
              const role = String(profile?.role ?? "").toLowerCase();
              const roleLabel = roleLabels[role] ?? "";
              const online = !member.leftAt;
              const name = isAgent
                ? profile?.name || roleLabel || `Agent ${member.memberId.slice(0, 6)}`
                : `用户 ${member.memberId.slice(0, 6)}`;

              return (
                <div
                  key={`${member.memberType}:${member.memberId}`}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-gray-50"
                >
                  <div className="relative">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${
                        isAgent ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {isAgent ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </div>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                        online ? "bg-emerald-400" : "bg-gray-300"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-gray-700">{name}</div>
                    {roleLabel && (
                      <div className="text-[10px] text-gray-400">{roleLabel}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {sorted.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-50"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "收起" : `展开全部 (${sorted.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
});
