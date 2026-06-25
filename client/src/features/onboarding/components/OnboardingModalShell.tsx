import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

type OnboardingModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export default function OnboardingModalShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: OnboardingModalShellProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-modal-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.22 }}
          >
            <h2 id="onboarding-modal-title" className="text-lg font-bold text-[#1e3a5f]">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
            <div className="mt-5">{children}</div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {secondaryLabel && onSecondary ? (
                <button
                  type="button"
                  onClick={onSecondary}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
                >
                  {secondaryLabel}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onPrimary}
                className="rounded-lg bg-[#1e3a5f] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
              >
                {primaryLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
