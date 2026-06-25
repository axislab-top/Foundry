import { useEffect, type MouseEvent } from "react";
import { X } from "lucide-react";
import { DispatchPlanDraftCard, type DispatchPlanDraftCardModel } from "./DispatchPlanDraftCard";
import type { DispatchPlanQuickAction } from "../utils/dispatchPlanDraftDisplay";

function overlaySurfaceProps(onBackdropMouseDown: (ev: MouseEvent) => void) {
  return {
    className:
      "fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]",
    role: "dialog" as const,
    "aria-modal": true as const,
    onMouseDown: onBackdropMouseDown,
  };
}

export default function DispatchPlanViewModal({
  open,
  card,
  quickActions,
  sending,
  onClose,
  onPickAction,
  onEditForm,
  showEditForm,
}: {
  open: boolean;
  card: DispatchPlanDraftCardModel | null;
  quickActions: DispatchPlanQuickAction[];
  sending?: boolean;
  onClose: () => void;
  onPickAction: (action: DispatchPlanQuickAction) => void;
  onEditForm?: () => void;
  showEditForm?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !card) return null;

  const pending = card.pendingConfirm === true && card.dispatched !== true;
  const locked = card.dispatched === true;

  const handleBackdrop = (ev: MouseEvent) => {
    if (ev.target === ev.currentTarget) onClose();
  };

  return (
    <div {...overlaySurfaceProps(handleBackdrop)}>
      <div
        className="flex max-h-[min(90vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">CEO 执行计划</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {locked
                ? "计划已下发，各部门将按分工执行。"
                : pending
                  ? "请核对分工后确认下发，或说明需要调整的内容。"
                  : "核对分工后可确认下发，或在输入框说明调整意见。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <DispatchPlanDraftCard card={card} variant="chat" mode="full" />
        </div>

        {!locked ? (
          <div className="shrink-0 space-y-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3">
            {quickActions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {quickActions.map((a) => (
                  <button
                    key={a.actionId}
                    type="button"
                    disabled={sending}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                      a.actionId === "dispatch_plan_confirm_flush"
                        ? "bg-[#1e3a5f] text-white hover:bg-[#2d5a8e]"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => onPickAction(a)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-600">在输入框回复「确认下发」以向各部门派活。</p>
            )}
            {showEditForm && onEditForm ? (
              <button
                type="button"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                onClick={onEditForm}
              >
                表单编辑执行计划
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
