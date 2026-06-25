import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PlatformDepartmentTemplate } from "../types";

export default function CreateDepartmentModal({
  open,
  availableTemplates,
  loading,
  submitting,
  error,
  onClose,
  onSubmit,
  onRetry,
}: {
  open: boolean;
  availableTemplates: PlatformDepartmentTemplate[];
  loading?: boolean;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (template: PlatformDepartmentTemplate) => void;
  onRetry?: () => void;
}) {
  const [slug, setSlug] = useState("");

  const selected = useMemo(
    () => availableTemplates.find((t) => t.slug === slug) ?? null,
    [availableTemplates, slug],
  );

  useEffect(() => {
    if (!open) return;
    setSlug(availableTemplates[0]?.slug ?? "");
  }, [open, availableTemplates]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">添加部门</h3>
            <p className="mt-0.5 text-xs text-gray-400">
              从平台部门模板中选择，将自动挂载到 CEO 下
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-300 hover:bg-gray-50 hover:text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return;
            onSubmit(selected);
          }}
        >
          <label className="block text-xs font-medium text-gray-600">
            部门模板
            <select
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              disabled={loading || submitting || availableTemplates.length === 0}
            >
              {loading ? (
                <option value="">加载中…</option>
              ) : availableTemplates.length === 0 ? (
                <option value="">暂无可添加的部门</option>
              ) : (
                availableTemplates.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.displayName} · {t.category}
                  </option>
                ))
              )}
            </select>
          </label>

          {error ? (
            <div className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2">
              <p className="text-[11px] text-rose-700">{error}</p>
              {onRetry ? (
                <button type="button" onClick={onRetry} className="text-[11px] font-medium text-rose-700 underline">
                  重试
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && availableTemplates.length === 0 && !error ? (
            <div className="rounded-lg bg-gray-50 px-3 py-3 text-xs leading-relaxed text-gray-500">
              所有平台部门已添加至组织架构。如需新增部门类型，请联系管理员在后台配置。
            </div>
          ) : selected ? (
            <>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selected.color }} />
                <span className="text-xs text-gray-500">{selected.nameEn}</span>
              </div>
              {selected.responsibilitySummary ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
                  {selected.responsibilitySummary}
                </p>
              ) : null}
              <p className="text-[10px] text-gray-400">
                添加后将创建部门节点；若平台部门绑定了主管模板，系统可能自动 bootstrap 主管。
              </p>
            </>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !selected || loading}
              className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-xs font-medium text-white hover:bg-[#2d5a8e] disabled:opacity-50"
            >
              {submitting ? "添加中…" : "添加部门"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
