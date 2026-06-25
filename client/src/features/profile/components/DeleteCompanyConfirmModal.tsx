import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";

type DeleteCompanyConfirmModalProps = {
  companyName: string;
  isActive: boolean;
  submitting?: boolean;
  errorMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function DeleteCompanyConfirmModal({
  companyName,
  isActive,
  submitting,
  errorMessage,
  onConfirm,
  onCancel,
}: DeleteCompanyConfirmModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const canSubmit = useMemo(() => confirmText.trim() === companyName.trim(), [confirmText, companyName]);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={submitting ? undefined : onCancel}
      />
      <motion.div
        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-company-title"
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="delete-company-title" className="text-base font-semibold text-gray-900">
                删除工作空间
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                即将永久删除 <span className="font-medium text-gray-900">{companyName}</span>
                及其全部数据，此操作不可恢复。
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-gray-600">
          <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500">
            <li>组织架构、Agent 团队与任务记录将被清除</li>
            <li>协作群聊、记忆与文件库将被清除</li>
            <li>账单与执行配置等租户数据将被清除</li>
          </ul>
          {isActive ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              这是您当前正在使用的工作空间。删除后将自动切换到其他工作空间，或返回选择页。
            </p>
          ) : null}
          <label className="block text-xs font-medium text-gray-600">
            请输入公司名称以确认删除
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={companyName}
              disabled={submitting}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 disabled:opacity-60"
              autoComplete="off"
            />
          </label>
          {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}
        </div>

        <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting || !canSubmit}
            onClick={onConfirm}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                删除中…
              </>
            ) : (
              "确认删除"
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
}
