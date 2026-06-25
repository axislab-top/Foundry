import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

import { useState } from "react";

import type { SupervisionDeliverableDigestRichCard } from "@contracts/types/collaboration-2026";

import FileAssetDownloadLink from "./FileAssetDownloadLink";

const QC_DECISION_LABEL: Record<string, string> = {
  pass: "通过",
  rework: "需返工",
  human_required: "需人工",
  fail: "未通过",
};

function qcDecisionLabel(decision: string): string {
  const key = String(decision ?? "").trim().toLowerCase();
  return QC_DECISION_LABEL[key] ?? decision;
}



export default function SupervisionDeliverableDigestCard({

  card,

  onFocusTask,

}: {

  card: SupervisionDeliverableDigestRichCard;

  /** 点击后在侧栏聚焦对应任务，而非打开详情抽屉 */
  onFocusTask?: (taskId: string) => void;

}) {

  const [expanded, setExpanded] = useState(false);

  const departments = card.departments ?? [];

  const topFiles = card.downloadableFiles ?? [];

  const primaryDeliverable = card.primaryDeliverable;

  const qcReview = card.qcReview ?? [];



  return (

    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 text-left shadow-sm">

      <div className="flex items-center gap-2 border-b border-emerald-100 px-3 py-2">

        <CheckCircle2 className="h-4 w-4 text-emerald-700" />

        <span className="text-[13px] font-semibold text-emerald-900">编排结案 · 交付物摘要</span>

        <span className="ml-auto text-[10px] text-emerald-800">{departments.length} 个部门</span>

      </div>

      <div className="px-3 py-2">

        {primaryDeliverable ? (
          <div className="mb-3 rounded-lg border border-[#1e3a5f]/20 bg-white px-3 py-2.5">
            <div className="text-[11px] font-semibold text-[#1e3a5f]">完整交付文档</div>
            <p className="mt-0.5 text-[10px] text-slate-500">已合并各部门 Agent 的完整产出，下载此文件即可审阅全文。</p>
            {card.synthesizedExcerpt ? (
              <div className="relative mt-1.5">
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">
                  {card.synthesizedExcerpt}
                </p>
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
              </div>
            ) : null}
            <div className="mt-2">
              <FileAssetDownloadLink
                fileAssetId={primaryDeliverable.fileAssetId}
                name={primaryDeliverable.name}
              />
            </div>
          </div>
        ) : null}

        {topFiles.length > 0 && !primaryDeliverable ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {topFiles.map((f) => (
              <FileAssetDownloadLink key={f.fileAssetId} fileAssetId={f.fileAssetId} name={f.name} />
            ))}
          </div>
        ) : primaryDeliverable ? null : departments.some((d) => d.artifactPreview) ? (
          <p className="mb-2 text-[11px] text-gray-600">
            暂无独立下载文件时，请展开下方各部门摘要；部门群交付卡亦提供下载链接。
          </p>
        ) : null}

        {qcReview.length > 0 ? (
          <div className="mb-3 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-2">
            <div className="text-[11px] font-semibold text-slate-800">质检把关</div>
            <ul className="mt-1.5 space-y-1">
              {qcReview.slice(0, 8).map((row) => (
                <li key={`${row.departmentSlug}-${row.decision}`} className="text-[11px] text-slate-700">
                  <span className="font-medium">{row.departmentSlug}</span>
                  <span className="text-slate-500"> · {qcDecisionLabel(row.decision)}</span>
                  {row.summary ? (
                    <span className="text-slate-600"> — {row.summary}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button

          type="button"

          onClick={() => setExpanded((v) => !v)}

          className="mb-2 flex w-full items-center justify-center gap-1 text-[10px] font-medium text-emerald-800 hover:underline"

        >

          {expanded ? (

            <>

              <ChevronUp className="h-3 w-3" /> 收起交付物

            </>

          ) : (

            <>

              <ChevronDown className="h-3 w-3" /> 展开全部交付物

            </>

          )}

        </button>

        {expanded ? (

          <ul className="divide-y divide-emerald-100/80">

            {departments.map((d) => (

              <li key={d.slug} className="py-2 first:pt-0 last:pb-0">

                <div className="flex items-center justify-between gap-2">

                  <span className="text-[12px] font-medium text-gray-900">{d.label || d.slug}</span>

                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900">

                    {d.status}

                  </span>

                </div>

                {d.artifactPreview ? (

                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-gray-600">

                    {d.artifactPreview}

                  </p>

                ) : null}

                {d.files && d.files.length > 0 ? (

                  <div className="mt-2 flex flex-wrap gap-1.5">

                    {d.files.map((f) => (

                      <FileAssetDownloadLink key={f.fileAssetId} fileAssetId={f.fileAssetId} name={f.name} />

                    ))}

                  </div>

                ) : null}

              </li>

            ))}

          </ul>

        ) : (

          <p className="text-[11px] text-gray-600">

            {departments

              .slice(0, 3)

              .map((d) => `${d.label || d.slug}：${d.status}`)

              .join(" · ")}

          </p>

        )}

        {card.parentGoalTaskId && onFocusTask ? (

          <button

            type="button"

            onClick={() => onFocusTask(card.parentGoalTaskId!)}

            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-900 hover:bg-emerald-50"

          >

            <ExternalLink className="h-3 w-3" />

            查看主目标

          </button>

        ) : null}

      </div>

    </div>

  );

}

