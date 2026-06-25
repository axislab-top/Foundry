import { useState } from "react";
import type { ApprovalResumeRichCard } from "../utils/messageExtraction";

export default function ApprovalResumeCard({ card }: { card: ApprovalResumeRichCard }) {
  const [showTech, setShowTech] = useState(false);
  const modeLabel =
    card.executionMode === "temporal"
      ? "后台自动化流程"
      : card.executionMode === "inline"
        ? "进程内即时执行"
        : "—";
  const hasTech = Boolean(card.planId || card.workflowId);

  return (
    <div className="mt-2 rounded-xl border border-sky-200/90 bg-gradient-to-br from-sky-50 to-white p-3 text-left text-[12px] shadow-sm text-sky-950">
      <div className="font-semibold text-sky-950">审批已通过 · 恢复执行</div>
      {card.goal ? (
        <div className="mt-2 text-[11px] leading-relaxed text-sky-900">
          <span className="font-medium text-sky-800">关联目标：</span>
          {card.goal}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-sky-800">
        系统将以「<strong>{modeLabel}</strong>」方式继续跑主编排。
        {typeof card.distributionTaskCount === "number" ? (
          <>
            {" "}
            本批共 <strong>{card.distributionTaskCount}</strong> 条部门任务。
          </>
        ) : null}
      </p>
      {hasTech ? (
        <div className="mt-2 border-t border-sky-100 pt-2">
          <button
            type="button"
            onClick={() => setShowTech(!showTech)}
            className="text-[10px] font-medium text-sky-700 hover:text-sky-900 hover:underline"
          >
            {showTech ? "隐藏技术标识" : "查看技术标识（排障用）"}
          </button>
          {showTech ? (
            <dl className="mt-1 space-y-1 font-mono text-[9px] leading-snug text-sky-800">
              {card.planId ? (
                <div className="break-all">
                  <dt className="inline text-sky-500">planId </dt>
                  <dd className="inline">{card.planId}</dd>
                </div>
              ) : null}
              {card.workflowId ? (
                <div className="break-all">
                  <dt className="inline text-sky-500">workflow </dt>
                  <dd className="inline">{card.workflowId}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
