import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Users } from "lucide-react";
import type { DirectorReportsSection } from "../heartbeat-types";

type Props = {
  section: DirectorReportsSection;
};

export default function DirectorReportCards({ section }: Props) {
  const { reports, emptyReason, stats } = section;

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center shadow-sm">
        <Users className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-600">暂无 Director 巡检报告</p>
        <p className="mt-1 text-xs text-gray-400">{emptyReason ?? "等待下一次成功巡检"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stats && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <span>
            共 {stats.total} 人 · 成功 {stats.succeeded} · 失败 {stats.failed}
          </span>
          {stats.riskLevel && (
            <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
              风险 {stats.riskLevel}
            </span>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((report, index) => (
          <motion.div
            key={report.directorAgentId}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
            className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">{report.name}</h4>
                <p className="text-[11px] text-gray-400">{report.role}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  report.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                {report.ok ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {report.ok ? "成功" : "失败"}
              </span>
            </div>
            {report.error && (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-600">
                {report.error}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
