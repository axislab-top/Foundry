import type {
  CoordinationRequestRichCard,
  DepartmentDispatchRichCard,
  EmployeeDeliverableRichCard,
  MainRoomDispatchItemRichCard,
  ReportSummaryRichCard,
  SupervisionDeliverableDigestRichCard,
  TaskStageRichCard,
} from "@contracts/types/collaboration-2026";

function readRichCardRaw(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const top = metadata.richCard;
  if (top && typeof top === "object" && !Array.isArray(top)) {
    return top as Record<string, unknown>;
  }
  const lsv2 = metadata.lightStructuredOutputV2;
  if (lsv2 && typeof lsv2 === "object" && !Array.isArray(lsv2)) {
    const inner = (lsv2 as Record<string, unknown>).metadata;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const rc = (inner as Record<string, unknown>).richCard;
      if (rc && typeof rc === "object" && !Array.isArray(rc)) {
        return rc as Record<string, unknown>;
      }
    }
  }
  return null;
}

function parseDownloadableFiles(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  const files = raw
    .slice(0, 24)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const fileAssetId = String(row.fileAssetId ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (!fileAssetId || !name) return null;
      return {
        fileAssetId,
        name: name.slice(0, 200),
        sourceTaskId: typeof row.sourceTaskId === "string" ? row.sourceTaskId : undefined,
        departmentSlug: typeof row.departmentSlug === "string" ? row.departmentSlug : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return files.length ? files : undefined;
}

export function extractDepartmentDispatchRichCard(
  metadata: Record<string, unknown> | null | undefined,
): DepartmentDispatchRichCard | null {
  const raw = readRichCardRaw(metadata);
  if (!raw || String(raw.cardType ?? "").trim() !== "department_dispatch") return null;
  const taskId = String(raw.taskId ?? "").trim();
  const title = String(raw.title ?? "").trim();
  if (!taskId || !title) return null;
  const criteria = Array.isArray(raw.acceptanceCriteria)
    ? raw.acceptanceCriteria.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 30)
    : null;
  const dispatch =
    raw.dispatch && typeof raw.dispatch === "object" && !Array.isArray(raw.dispatch)
      ? (raw.dispatch as Record<string, unknown>)
      : null;
  return {
    kind: typeof raw.kind === "string" ? raw.kind : undefined,
    cardType: "department_dispatch",
    taskId,
    title,
    status: typeof raw.status === "string" ? raw.status : undefined,
    dueAt: typeof raw.dueAt === "string" ? raw.dueAt : raw.dueAt === null ? null : undefined,
    ownerOrgNodeId:
      typeof raw.ownerOrgNodeId === "string" ? raw.ownerOrgNodeId : raw.ownerOrgNodeId === null ? null : undefined,
    acceptanceCriteria: criteria,
    dispatch: dispatch
      ? {
          fromRoomId: typeof dispatch.fromRoomId === "string" ? dispatch.fromRoomId : null,
          fromMessageId: typeof dispatch.fromMessageId === "string" ? dispatch.fromMessageId : null,
        }
      : undefined,
    reportBackRoomId: typeof raw.reportBackRoomId === "string" ? raw.reportBackRoomId : null,
    sourceRoomId: typeof raw.sourceRoomId === "string" ? raw.sourceRoomId : null,
    sourceThreadId: typeof raw.sourceThreadId === "string" ? raw.sourceThreadId : null,
  };
}

export function extractEmployeeDeliverableRichCard(
  metadata: Record<string, unknown> | null | undefined,
): EmployeeDeliverableRichCard | null {
  const raw = readRichCardRaw(metadata);
  if (!raw || String(raw.cardType ?? "").trim() !== "employee_deliverable") return null;
  const taskId = String(raw.taskId ?? "").trim();
  if (!taskId) return null;
  const artifactsRaw = Array.isArray(raw.artifacts) ? raw.artifacts : [];
  const artifacts = artifactsRaw
    .slice(0, 12)
    .map((item, i) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = String(row.type ?? "artifact").trim() || "artifact";
      return {
        type: type.slice(0, 64),
        uri: typeof row.uri === "string" ? row.uri : undefined,
        content: typeof row.content === "string" ? row.content : undefined,
        label: typeof row.label === "string" ? row.label : `交付物 ${i + 1}`,
        fileAssetId: typeof row.fileAssetId === "string" ? row.fileAssetId : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!artifacts.length) return null;
  return {
    cardType: "employee_deliverable",
    taskId,
    skillExecutionId: typeof raw.skillExecutionId === "string" ? raw.skillExecutionId : null,
    skillName: typeof raw.skillName === "string" ? raw.skillName : null,
    department: typeof raw.department === "string" ? raw.department : null,
    status: typeof raw.status === "string" ? raw.status : undefined,
    artifacts,
  };
}

export function extractSupervisionDeliverableDigestRichCard(
  metadata: Record<string, unknown> | null | undefined,
): SupervisionDeliverableDigestRichCard | null {
  const raw = readRichCardRaw(metadata);
  if (!raw || String(raw.cardType ?? "").trim() !== "supervision_deliverable_digest") return null;
  const departmentsRaw = Array.isArray(raw.departments) ? raw.departments : [];
  const departments = departmentsRaw
    .slice(0, 24)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const slug = String(row.slug ?? "").trim();
      if (!slug) return null;
      return {
        slug,
        label: typeof row.label === "string" ? row.label : undefined,
        status: String(row.status ?? "completed").trim() || "completed",
        artifactPreview: typeof row.artifactPreview === "string" ? row.artifactPreview.slice(0, 240) : undefined,
        files: parseDownloadableFiles(row.files),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!departments.length) return null;
  const downloadableFiles = parseDownloadableFiles(raw.downloadableFiles);
  const qcReviewRaw = Array.isArray(raw.qcReview) ? raw.qcReview : [];
  const qcReview = qcReviewRaw
    .slice(0, 12)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const departmentSlug = String(row.departmentSlug ?? "").trim();
      const decision = String(row.decision ?? "").trim();
      if (!departmentSlug || !decision) return null;
      return {
        departmentSlug,
        decision,
        summary: typeof row.summary === "string" ? row.summary.slice(0, 240) : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const primaryDeliverable = parseDownloadableFiles(raw.primaryDeliverable)?.[0];
  const synthesizedExcerpt = typeof raw.synthesizedExcerpt === "string"
    ? raw.synthesizedExcerpt.slice(0, 4800)
    : undefined;
  return {
    cardType: "supervision_deliverable_digest",
    parentGoalTaskId: typeof raw.parentGoalTaskId === "string" ? raw.parentGoalTaskId : undefined,
    distributionId: typeof raw.distributionId === "string" ? raw.distributionId : undefined,
    departments,
    ...(downloadableFiles ? { downloadableFiles } : {}),
    ...(primaryDeliverable ? { primaryDeliverable } : {}),
    ...(synthesizedExcerpt ? { synthesizedExcerpt } : {}),
    ...(qcReview.length ? { qcReview } : {}),
  };
}

export function extractMainRoomDispatchItemRichCard(
  metadata: Record<string, unknown> | null | undefined,
): MainRoomDispatchItemRichCard | null {
  const raw = readRichCardRaw(metadata);
  if (!raw || String(raw.cardType ?? "").trim() !== "main_room_dispatch_item") return null;
  const subGoalTaskId = String(raw.subGoalTaskId ?? raw.taskId ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const deptLabel = String(raw.deptLabel ?? "").trim();
  if (!subGoalTaskId || !title || !deptLabel) return null;
  return {
    cardType: "main_room_dispatch_item",
    taskId: subGoalTaskId,
    subGoalTaskId,
    title,
    deptLabel,
    departmentSlug: typeof raw.departmentSlug === "string" ? raw.departmentSlug : undefined,
    directorAgentId: typeof raw.directorAgentId === "string" ? raw.directorAgentId : null,
    directorDisplayName: typeof raw.directorDisplayName === "string" ? raw.directorDisplayName : null,
    status:
      typeof raw.status === "string"
        ? (raw.status as MainRoomDispatchItemRichCard["status"])
        : "pending_ack",
    progress: typeof raw.progress === "number" ? raw.progress : null,
    dependsOnLabels: Array.isArray(raw.dependsOnLabels)
      ? raw.dependsOnLabels.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 12)
      : null,
    parentGoalTaskId: typeof raw.parentGoalTaskId === "string" ? raw.parentGoalTaskId : null,
    planTaskId: typeof raw.planTaskId === "string" ? raw.planTaskId : null,
    ordinal: typeof raw.ordinal === "number" ? raw.ordinal : null,
    total: typeof raw.total === "number" ? raw.total : null,
  };
}

export function extractTaskStageRichCard(
  metadata: Record<string, unknown> | null | undefined,
): TaskStageRichCard | null {
  const raw = readRichCardRaw(metadata);
  if (!raw || String(raw.cardType ?? "").trim() !== "task_stage") return null;
  const taskId = String(raw.taskId ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const stage = String(raw.stage ?? "").trim();
  const status = String(raw.status ?? "").trim();
  if (!taskId || !title || !stage || !status) return null;
  return {
    cardType: "task_stage",
    taskId,
    title,
    stage,
    status,
    progress: typeof raw.progress === "number" ? raw.progress : null,
    parentTaskId: typeof raw.parentTaskId === "string" ? raw.parentTaskId : null,
    planTaskId: typeof raw.planTaskId === "string" ? raw.planTaskId : null,
    executionProfile: typeof raw.executionProfile === "string" ? raw.executionProfile : null,
    dependencies: Array.isArray(raw.dependencies)
      ? raw.dependencies.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 12)
      : null,
    assigneeId: typeof raw.assigneeId === "string" ? raw.assigneeId : null,
    summary: typeof raw.summary === "string" ? raw.summary : null,
  };
}

export function extractReportSummaryRichCard(
  metadata: Record<string, unknown> | null | undefined,
): ReportSummaryRichCard | null {
  const raw = readRichCardRaw(metadata);
  if (!raw || String(raw.cardType ?? "").trim() !== "report_summary") return null;
  const taskId = String(raw.taskId ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const summary = String(raw.summary ?? "").trim();
  if (!taskId || !title || !summary) return null;
  return {
    cardType: "report_summary",
    taskId,
    title,
    status: typeof raw.status === "string" ? raw.status : undefined,
    progress: typeof raw.progress === "number" ? raw.progress : undefined,
    summary: summary.slice(0, 2000),
    sourceRoomId: typeof raw.sourceRoomId === "string" ? raw.sourceRoomId : null,
    sourceThreadId: typeof raw.sourceThreadId === "string" ? raw.sourceThreadId : null,
  };
}

export function extractCoordinationRequestRichCard(
  metadata: Record<string, unknown> | null | undefined,
): CoordinationRequestRichCard | null {
  const raw = readRichCardRaw(metadata);
  if (!raw || String(raw.cardType ?? "").trim() !== "coordination_request") return null;
  const taskId = String(raw.taskId ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const request = String(raw.request ?? "").trim();
  const targetDepartmentRoomId = String(raw.targetDepartmentRoomId ?? "").trim();
  if (!taskId || !title || !request || !targetDepartmentRoomId) return null;
  return {
    cardType: "coordination_request",
    taskId,
    title,
    request: request.slice(0, 2000),
    targetDepartmentRoomId,
    neededBy: typeof raw.neededBy === "string" ? raw.neededBy : null,
    sourceRoomId: typeof raw.sourceRoomId === "string" ? raw.sourceRoomId : null,
    sourceMessageId: typeof raw.sourceMessageId === "string" ? raw.sourceMessageId : null,
  };
}

/** 从主群结案消息 metadata 解析部门行（纯 metadata，无 richCard 时回退）。 */
export function parseCompletionSummaryDepartments(
  metadata: Record<string, unknown> | null | undefined,
  content: string,
): Array<{ slug: string; label?: string; status: string }> {
  const digest = extractSupervisionDeliverableDigestRichCard(metadata);
  if (digest?.departments?.length) {
    return digest.departments.map((d) => ({
      slug: d.slug,
      label: d.label,
      status: d.status,
    }));
  }
  const lines = String(content ?? "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("·"));
  return lines
    .map((line) => {
      const m = line.match(/^·\s*([^：:]+)[：:]\s*(.+)$/);
      if (!m) return null;
      return { slug: m[1]!.trim(), status: m[2]!.trim() };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}
