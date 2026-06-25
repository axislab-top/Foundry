import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { ToastState } from "../types";

export default function OrgToast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] max-w-sm">
      <div className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-lg">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
        <p className="flex-1 text-xs leading-relaxed text-gray-700">{toast.message}</p>
        <button type="button" onClick={onDismiss} className="text-gray-300 hover:text-gray-500">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
