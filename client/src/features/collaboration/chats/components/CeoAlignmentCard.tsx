import { Loader2, MessageSquarePlus, ShieldCheck, Sparkles } from "lucide-react";

import type { CeoAlignmentMetadata } from "@contracts/types/collaboration-2026";

import {

  alignmentPhaseLabel,

  parseCeoAlignment,

  parseReplayDecision,

  shouldShowCeoAlignmentCard,

} from "../utils/replayMetadata";



export function hasCeoAlignmentCard(metadata: Record<string, unknown> | null | undefined): boolean {

  const alignment = parseCeoAlignment(metadata);

  const replayDecision = parseReplayDecision(metadata);

  return shouldShowCeoAlignmentCard(alignment, replayDecision);

}



export default function CeoAlignmentCard({

  metadata,

  sending,

  onConfirmExecution,

  onContinueAligning,

}: {

  metadata: Record<string, unknown> | null | undefined;

  sending?: boolean;

  onConfirmExecution: () => void;

  onContinueAligning?: () => void;

}) {

  const alignment = parseCeoAlignment(metadata);

  const replayDecision = parseReplayDecision(metadata);

  if (!shouldShowCeoAlignmentCard(alignment, replayDecision)) return null;



  const phase = alignment?.phase ?? (replayDecision?.kind === "propose_execution" ? "awaiting_execution_confirm" : "aligning");

  const draftSummary = alignment?.draftGoalSummary?.trim() || replayDecision?.summary?.trim() || "";

  const upgradeReason = alignment?.upgradeReason?.trim() || "";

  const awaitingConfirm = phase === "awaiting_execution_confirm" || replayDecision?.kind === "propose_execution";

  const showContinueAligning =

    Boolean(onContinueAligning) &&

    (phase === "aligning" || awaitingConfirm || replayDecision?.kind === "ask_clarification");

  const showExecutionUpgrade =

    alignment?.executionIntentDetected === true && alignment?.suggestedCollaborationMode === "execution";



  return (

    <div className="mt-2 overflow-hidden rounded-xl border border-[#1e3a5f]/15 bg-gradient-to-br from-white via-slate-50 to-blue-50/50 shadow-sm">

      <div className="flex items-start gap-2 border-b border-slate-200/70 px-3 py-2.5">

        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f] text-white shadow-sm">

          {awaitingConfirm || showExecutionUpgrade ? <ShieldCheck className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}

        </div>

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center gap-1.5">

            <span className="text-[12px] font-semibold text-slate-900">CEO 执行对齐</span>

            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-[#1e3a5f]">

              {alignmentPhaseLabel(phase as CeoAlignmentMetadata["phase"])}

            </span>

            {replayDecision?.kind === "propose_execution" ? (

              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">

                待确认

              </span>

            ) : null}

          </div>

          {draftSummary ? (

            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">{draftSummary}</p>

          ) : awaitingConfirm ? (

            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">

              CEO 建议进入正式执行栈。请确认目标无误后再授权，避免误触发全公司编排。

            </p>

          ) : showExecutionUpgrade ? (

            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">

              {upgradeReason || "CEO 建议进入执行。确认后将由服务端切换协作模式并进入编排。"}

            </p>

          ) : phase === "authorized" || phase === "executing" ? (

            <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-700">

              已收到执行授权，CEO 正在推进 Dispatch Plan 与部门下发。

            </p>

          ) : (

            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">正在与 CEO 对齐目标与执行边界。</p>

          )}

        </div>

      </div>



      {awaitingConfirm || showExecutionUpgrade ? (

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">

          <span className="text-[11px] text-slate-500">

            {awaitingConfirm

              ? "确认后将发送结构化授权信号，并进入 CEO 重栈。"

              : "系统将在确认后同步协作模式，无需手动切换 Tab。"}

          </span>

          <div className="flex flex-wrap items-center gap-2">

            {showContinueAligning ? (

              <button

                type="button"

                disabled={sending}

                onClick={onContinueAligning}

                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"

              >

                <MessageSquarePlus className="h-3.5 w-3.5" />

                继续对齐

              </button>

            ) : null}

            <button

              type="button"

              disabled={sending}

              onClick={onConfirmExecution}

              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-[#2d5a8e] disabled:cursor-not-allowed disabled:opacity-60"

            >

              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}

              确认执行

            </button>

          </div>

        </div>

      ) : showContinueAligning ? (

        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2.5">

          <button

            type="button"

            disabled={sending}

            onClick={onContinueAligning}

            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"

          >

            <MessageSquarePlus className="h-3.5 w-3.5" />

            继续对齐

          </button>

        </div>

      ) : null}

    </div>

  );

}

