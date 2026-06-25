import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, GraduationCap } from "lucide-react";
import { useOnboarding } from "@/features/onboarding/hooks/useOnboarding";
import type { OnboardingStepId } from "@/features/onboarding/types";

type OnboardingChecklistProps = {
  sidebarCollapsed: boolean;
};

export default function OnboardingChecklist({ sidebarCollapsed }: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const {
    enabled,
    hydrated,
    checklistTasks,
    requiredCompleted,
    requiredTotal,
    allRequiredDone,
    checklistDismissed,
    isStepComplete,
    dismissChecklist,
  } = useOnboarding();

  const [expanded, setExpanded] = useState(true);
  const [showCompleteToast, setShowCompleteToast] = useState(false);

  const visible = enabled && hydrated;
  const hideCompletely = checklistDismissed && allRequiredDone;

  const pendingRequired = requiredTotal - requiredCompleted;

  useEffect(() => {
    if (!allRequiredDone) return;
    setShowCompleteToast(true);
    const timer = window.setTimeout(() => {
      setShowCompleteToast(false);
      if (!checklistDismissed) {
        setExpanded(false);
        dismissChecklist();
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [allRequiredDone, checklistDismissed, dismissChecklist]);

  const handleNavigate = (route: string, stepId: OnboardingStepId) => {
    if (isStepComplete(stepId)) return;
    navigate(route);
  };

  const panelBody = useMemo(() => {
    if (!expanded) return null;
    return (
      <ul className="mt-2 space-y-1">
        {checklistTasks.map((task) => {
          const done = isStepComplete(task.stepId);
          return (
            <li key={task.stepId}>
              <button
                type="button"
                onClick={() => handleNavigate(task.route, task.stepId)}
                disabled={done}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                  done
                    ? "text-gray-400"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                )}
                <span className="flex-1">
                  <span className={done ? "line-through" : ""}>{task.label}</span>
                  {!task.required ? (
                    <span className="ml-1 text-[11px] text-gray-400">可选</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }, [checklistTasks, expanded, isStepComplete]);

  if (!visible || hideCompletely) return null;

  if (sidebarCollapsed) {
    return (
      <div className="px-2 pb-2">
        <button
          type="button"
          title="新手任务"
          aria-label="新手任务"
          onClick={() => setExpanded((v) => !v)}
          className="relative flex w-full items-center justify-center rounded-md py-2 text-gray-600 transition-colors hover:bg-gray-100"
        >
          <GraduationCap className="h-[18px] w-[18px]" />
          {pendingRequired > 0 && !allRequiredDone ? (
            <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
              {pendingRequired}
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 px-3 py-3">
      <AnimatePresence>
        {showCompleteToast ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-center text-xs font-medium text-green-700"
          >
            基础引导已完成
          </motion.p>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-[#1e3a5f]" />
          <span className="text-[13px] font-semibold text-gray-800">新手任务</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-400">
            {requiredCompleted}/{requiredTotal}
          </span>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
          )}
        </div>
      </button>

      {panelBody}

      {expanded && allRequiredDone ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            dismissChecklist();
          }}
          className="mt-2 w-full text-center text-[11px] text-gray-400 hover:text-gray-600"
        >
          收起
        </button>
      ) : null}
    </div>
  );
}
