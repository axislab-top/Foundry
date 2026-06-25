import type { RichCardQuickAction } from "../utils/messageExtraction";

export default function RichCardQuickReplyRow({
  actions,
  sending,
  disabled: disabledExtra,
  onPick,
  tone = "default",
}: {
  actions: RichCardQuickAction[];
  sending: boolean;
  /** 例如主群协作模式 PATCH 进行中，避免乐观 UI 与落库不一致导致管线仍按 Ask 处理 */
  disabled?: boolean;
  onPick: (action: RichCardQuickAction) => void;
  tone?: "default" | "emphasized";
}) {
  const wrap =
    tone === "emphasized"
      ? "mt-2 flex flex-wrap gap-2 border-t border-amber-200/80 bg-amber-50/50 px-1 py-2 sm:px-2"
      : "mt-2 flex flex-wrap gap-2 border-t border-[var(--border)] pt-2";
  const sendLocked = sending || Boolean(disabledExtra);
  return (
    <div className={wrap}>
      {actions.map((a) => {
        const primary =
          a.actionId === "strategy_goal_finalize" ||
          /确认|进入|战略|定稿/.test(a.label) ||
          a.sendText === "确认" ||
          a.sendText === "定稿";
        return (
          <button
            key={a.actionId}
            type="button"
            disabled={sendLocked}
            onClick={() => onPick(a)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 ${
              primary
                ? "border border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
            }`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
