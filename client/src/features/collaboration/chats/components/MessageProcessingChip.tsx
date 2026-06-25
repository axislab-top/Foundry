import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

import {

  resolveMessageStatusChipLabel,

  resolveOrchestrationLifecycle,

} from "../utils/collaborationLifecycle";

import {

  programPhaseDisplayLabel,

  shouldShowExecutionPipelineForProgram,

  type CollaborationProgramView,

} from "../utils/programLifecycle";



export type OrchestrationRunSnapshot = {

  sourceMessageId: string;

  status: string;

  stage?: string | null;

  errorMessage?: string | null;

  metadata?: Record<string, unknown> | null;

};



function statusIcon(tone: string, lifecycle: string) {

  if (tone === "error" || lifecycle === "failed") {

    return <XCircle className="h-3 w-3 text-rose-500" />;

  }

  if (tone === "success" || lifecycle === "completed") {

    return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;

  }

  if (tone === "waiting" || lifecycle === "awaiting_confirm") {

    return <AlertCircle className="h-3 w-3 text-amber-500" />;

  }

  if (tone === "progress") {

    return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;

  }

  return <Clock className="h-3 w-3 text-gray-400" />;

}



function chipClasses(tone: string): string {

  switch (tone) {

    case "error":

      return "border-rose-200 bg-rose-50 text-rose-800";

    case "success":

      return "border-emerald-200 bg-emerald-50 text-emerald-800";

    case "waiting":

      return "border-amber-200 bg-amber-50 text-amber-800";

    case "progress":

      return "border-blue-200 bg-blue-50 text-blue-800";

    default:

      return "border-gray-200 bg-gray-50 text-gray-700";

  }

}



export default function MessageProcessingChip({

  run,

  program,

  showRoutingHint,

}: {

  run: OrchestrationRunSnapshot | null | undefined;

  program?: CollaborationProgramView | null;

  showRoutingHint?: boolean;

}) {

  if (!run) return null;

  const lifecycle = resolveOrchestrationLifecycle(run);

  const { label, tone } = resolveMessageStatusChipLabel({ run });

  const hasPhases = Array.isArray(run.metadata?.phases) && (run.metadata?.phases as unknown[]).length > 0;

  const stage = String(run.stage ?? "").trim();

  const isRoutingStage = stage === "before_runMainRoomFlow";

  const showPipelineHint = shouldShowExecutionPipelineForProgram(program);

  const programLabel = program ? programPhaseDisplayLabel(program) : null;



  if (showRoutingHint && isRoutingStage && lifecycle !== "failed") {

    return (

      <p className="mt-1.5 text-[10px] text-gray-500">

        正在理解你的消息…

        {showPipelineHint ? (

          <span className="text-blue-600"> · 详见右侧执行流水线</span>

        ) : programLabel ? (

          <span className="text-indigo-600"> · {programLabel}</span>

        ) : null}

      </p>

    );

  }



  if (hasPhases && lifecycle !== "failed") {

    const displayLabel = programLabel && !showPipelineHint ? programLabel : label;

    return (

      <p className="mt-1.5 text-[10px] text-gray-500">

        <span className="font-medium text-gray-700">{displayLabel}</span>

        {showPipelineHint ? (

          <span className="text-blue-600"> · 详见右侧执行流水线</span>

        ) : programLabel && displayLabel !== programLabel ? (

          <span className="text-indigo-600"> · {programLabel}</span>

        ) : null}

      </p>

    );

  }



  return (

    <div

      className={`mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${chipClasses(tone)}`}

    >

      {statusIcon(tone, lifecycle)}

      <span className="font-medium">{programLabel && !showPipelineHint ? programLabel : label}</span>

      {lifecycle === "failed" && run.errorMessage ? (

        <span className="w-full truncate opacity-90" title={run.errorMessage}>

          {run.errorMessage.slice(0, 120)}

        </span>

      ) : null}

    </div>

  );

}

