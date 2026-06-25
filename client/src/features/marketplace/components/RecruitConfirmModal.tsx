import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { MarketplaceAgentPreset, OrgTreeNode } from "@/features/organization/types/api";
import { getPriceLabel, presetMatchesDepartment } from "../utils/viewModel";
import MarketplaceAgentAvatar from "./MarketplaceAgentAvatar";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]/20";

type Props = {
  agent: MarketplaceAgentPreset;
  departments: OrgTreeNode[];
  submitting?: boolean;
  onConfirm: (departmentId: string, reason?: string) => void;
  onCancel: () => void;
};

export default function RecruitConfirmModal({
  agent,
  departments,
  submitting,
  onConfirm,
  onCancel,
}: Props) {
  const [departmentId, setDepartmentId] = useState("");
  const [reason, setReason] = useState("");

  const matchingDepartments = useMemo(() => {
    return departments.filter((d) => {
      const slug =
        typeof d.metadata?.platformDepartmentSlug === "string"
          ? d.metadata.platformDepartmentSlug.trim()
          : "";
      return presetMatchesDepartment(agent, slug || undefined);
    });
  }, [departments, agent]);

  const selectableDepartments = matchingDepartments.length > 0 ? matchingDepartments : departments;
  const effectiveDeptId = departmentId || selectableDepartments[0]?.id || "";
  const priceLabel = getPriceLabel(agent);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onCancel}
      />
      <motion.div
        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <MarketplaceAgentAvatar preset={agent} size="lg" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900">招募 {agent.name}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                {agent.description ?? agent.expertise ?? "暂无描述"}
              </p>
              {priceLabel ? <p className="mt-1 text-[11px] text-gray-400">{priceLabel}</p> : null}
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          {selectableDepartments.length === 0 ? (
            <div className="space-y-3 text-sm text-gray-600">
              <p>暂无部门，请先在组织架构中添加部门。</p>
              <Link
                to="/organization"
                className="inline-block text-[#2d5a8e] hover:text-[#1e3a5f]"
                onClick={onCancel}
              >
                前往组织架构 →
              </Link>
            </div>
          ) : (
            <>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">目标部门</label>
              <select
                value={effectiveDeptId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={submitting}
                className={inputClass}
              >
                {selectableDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>

              <label className="mt-4 block text-xs font-medium text-gray-600">
                申请说明（可选）
                <textarea
                  className={`${inputClass} mt-1.5 resize-none`}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：工程部扩编，承接 Q3 交付"
                  disabled={submitting}
                />
              </label>
            </>
          )}
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
            disabled={submitting || selectableDepartments.length === 0}
            onClick={() => onConfirm(effectiveDeptId, reason.trim() || undefined)}
            className="flex-1 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e] disabled:opacity-50"
          >
            {submitting ? "提交中…" : "确认招募"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
