import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, PencilLine } from "lucide-react";
import { readExplicitTaskSpec } from "../utils/replayMetadata";

type TaskIntentStatus =
  | "drafted"
  | "needs_clarification"
  | "awaiting_confirmation"
  | "ready_to_create"
  | "created"
  | "rejected"
  | "cancelled"
  | "failed";

type TaskIntentMetadata = {
  id?: string;
  status?: TaskIntentStatus | string;
  taskId?: string | null;
  readiness?: {
    ready?: boolean;
    confidence?: number;
    missingFields?: string[];
    clarificationPrompt?: string | null;
  };
};

type PatchPayload = {
  title?: string;
  description?: string;
  assigneeType?: "unassigned" | "agent" | "organization_node";
  assigneeId?: string;
  expectedOutput?: string;
  dueDate?: string;
  acceptanceCriteria?: string[];
};

const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  description: "描述",
  owner: "负责人",
  deliverable: "预期产出",
  deadline: "截止时间",
  acceptance_criteria: "验收标准",
};

function readCandidate(metadata: Record<string, unknown> | null | undefined): TaskIntentMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata.taskIntentCandidate;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as TaskIntentMetadata;
  if (!candidate.id || typeof candidate.id !== "string") return null;
  return candidate;
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "needs_clarification":
      return "需要补充信息";
    case "awaiting_confirmation":
      return "等待确认";
    case "ready_to_create":
      return "已就绪";
    case "created":
      return "已创建任务";
    case "failed":
      return "创建失败";
    default:
      return "任务候选";
  }
}

export function hasTaskIntentCandidate(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(readCandidate(metadata));
}

export default function TaskIntentCandidateCard({
  metadata,
  submitting,
  onPatchSpec,
  onConfirm,
}: {
  metadata: Record<string, unknown> | null | undefined;
  submitting?: boolean;
  onPatchSpec: (candidateId: string, patch: PatchPayload) => void;
  onConfirm: (candidateId: string) => void;
}) {
  const candidate = readCandidate(metadata);
  const taskSpec = useMemo(() => readExplicitTaskSpec(metadata), [metadata]);
  const missingFields = useMemo(
    () => candidate?.readiness?.missingFields?.filter((x): x is string => typeof x === "string") ?? [],
    [candidate?.readiness?.missingFields],
  );
  const [expanded, setExpanded] = useState(false);
  const [ownerType, setOwnerType] = useState<"organization_node" | "agent">("organization_node");
  const [ownerId, setOwnerId] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const prefilledCandidateIdRef = useRef<string | null>(null);

  useEffect(() => {
    const candidateId = candidate?.id ?? null;
    if (!candidateId || prefilledCandidateIdRef.current === candidateId) return;
    prefilledCandidateIdRef.current = candidateId;
    if (taskSpec.assigneeType === "agent" || taskSpec.assigneeType === "organization_node") {
      setOwnerType(taskSpec.assigneeType);
    }
    if (taskSpec.assigneeId) setOwnerId(taskSpec.assigneeId);
    if (taskSpec.expectedOutput) setExpectedOutput(taskSpec.expectedOutput);
    if (taskSpec.dueDate) setDueDate(taskSpec.dueDate);
    if (taskSpec.acceptanceCriteria?.length) {
      setAcceptanceCriteria(taskSpec.acceptanceCriteria.join("\n"));
    }
    if (
      missingFields.length > 0 ||
      taskSpec.assigneeId ||
      taskSpec.expectedOutput ||
      taskSpec.dueDate ||
      taskSpec.acceptanceCriteria?.length
    ) {
      setExpanded(true);
    }
  }, [candidate?.id, missingFields.length, taskSpec]);

  if (!candidate?.id) return null;
  const status = String(candidate.status ?? "drafted");
  const isCreated = status === "created" || Boolean(candidate.taskId);
  const canPatch = status === "needs_clarification" || status === "drafted";
  const canConfirm = status === "awaiting_confirmation" || status === "ready_to_create";
  const confidence = typeof candidate.readiness?.confidence === "number" ? candidate.readiness.confidence : null;

  const submitPatch = () => {
    const patch: PatchPayload = {};
    if (ownerId.trim()) {
      patch.assigneeType = ownerType;
      patch.assigneeId = ownerId.trim();
    }
    if (expectedOutput.trim()) patch.expectedOutput = expectedOutput.trim();
    if (dueDate.trim()) patch.dueDate = dueDate.trim();
    const criteria = acceptanceCriteria
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (criteria.length) patch.acceptanceCriteria = criteria;
    onPatchSpec(candidate.id!, patch);
  };

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 shadow-sm">
      <div className="flex items-start gap-2 border-b border-slate-200/80 px-3 py-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
          {isCreated ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold text-slate-900">任务候选</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              {statusLabel(status)}
            </span>
            {confidence !== null ? (
              <span className="text-[10px] text-slate-500">置信度 {Math.round(confidence * 100)}%</span>
            ) : null}
          </div>
          {candidate.readiness?.clarificationPrompt ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{candidate.readiness.clarificationPrompt}</p>
          ) : taskSpec.title || taskSpec.description ? (
            <div className="mt-1 space-y-0.5">
              {taskSpec.title ? (
                <p className="text-[11px] font-medium leading-relaxed text-slate-800">{taskSpec.title}</p>
              ) : null}
              {taskSpec.description ? (
                <p className="text-[11px] leading-relaxed text-slate-600">{taskSpec.description}</p>
              ) : null}
            </div>
          ) : isCreated ? (
            <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">正式任务已创建，可在右侧任务树或任务看板查看。</p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">系统已识别出可执行任务，请确认或补充必要字段。</p>
          )}
        </div>
      </div>

      {missingFields.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {missingFields.map((field) => (
            <span key={field} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              缺少{FIELD_LABELS[field] ?? field}
            </span>
          ))}
        </div>
      ) : null}

      {canPatch ? (
        <div className="px-3 py-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
          >
            <PencilLine className="h-3.5 w-3.5" />
            {expanded ? "收起补充表单" : "补充任务信息"}
          </button>
          {expanded ? (
            <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-white/80 p-2">
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <select
                  value={ownerType}
                  onChange={(e) => setOwnerType(e.target.value as "organization_node" | "agent")}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-emerald-400"
                >
                  <option value="organization_node">部门</option>
                  <option value="agent">Agent</option>
                </select>
                <input
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  placeholder="负责人 ID"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-emerald-400"
                />
              </div>
              <input
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                placeholder="预期产出，例如：登录流程恢复正常"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-emerald-400"
              />
              <input
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="截止时间，例如：2026-06-15T18:00:00.000Z"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-emerald-400"
              />
              <textarea
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                rows={3}
                placeholder="验收标准，每行一条"
                className="resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={submitPatch}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                保存并重新评估
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {canConfirm ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-[11px] text-slate-500">确认后将创建正式任务，并在任务树中跟踪。</span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onConfirm(candidate.id!)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            确认创建
          </button>
        </div>
      ) : null}
    </div>
  );
}
