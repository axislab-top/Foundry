import { Bot, Layers } from "lucide-react";

export type AgentOption = {
  id: string;
  name: string;
  role?: string;
};

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  director: "总监",
  executor: "执行 Agent",
};

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
];

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

type Props = {
  agents: AgentOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  counts: Record<string, number>;
  loading?: boolean;
};

export default function AgentMemorySidebar({
  agents,
  selectedId,
  onSelect,
  counts,
  loading,
}: Props) {
  const totalCount = counts[""] ?? 0;

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-gray-200 bg-gray-50/50 xl:w-[220px]">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-gray-900">Agent 记忆</h2>
        <p className="text-[11px] text-gray-400">Agent Memory</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Agent
        </p>

        <button
          type="button"
          onClick={() => onSelect("")}
          className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
            selectedId === ""
              ? "bg-white font-medium text-[#1e3a5f] shadow-sm ring-1 ring-gray-200"
              : "text-gray-600 hover:bg-white/80"
          }`}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">全部 Agent</span>
          <span className="ml-auto text-[11px] tabular-nums text-gray-400">
            {loading ? "…" : totalCount}
          </span>
        </button>

        {agents.map((agent) => {
          const active = selectedId === agent.id;
          const count = counts[agent.id] ?? 0;
          const roleLabel = agent.role ? (ROLE_LABEL[agent.role] ?? agent.role) : null;

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent.id)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                active
                  ? "bg-white font-medium text-[#1e3a5f] shadow-sm ring-1 ring-gray-200"
                  : "text-gray-600 hover:bg-white/80"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white ${avatarColor(agent.id)}`}
              >
                {initials(agent.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{agent.name}</span>
                {roleLabel ? (
                  <span className="block truncate text-[10px] font-normal text-gray-400">
                    {roleLabel}
                  </span>
                ) : null}
              </span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-400">
                {loading ? "…" : count}
              </span>
            </button>
          );
        })}

        {!loading && agents.length === 0 ? (
          <div className="px-2 py-4 text-center">
            <Bot className="mx-auto mb-2 h-5 w-5 text-gray-300" />
            <p className="text-[12px] leading-relaxed text-gray-400">暂无 Agent，请先在团队中添加</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
