import type { GovernanceTimelineEntry } from "./governanceTimeline.types";
import { extractCoordinationRequestRichCard, extractEmployeeDeliverableRichCard, extractMainRoomDispatchItemRichCard, extractReportSummaryRichCard, extractSupervisionDeliverableDigestRichCard } from "./rich-card-extractors";

export function buildGovernanceTimelineEntries(
  messages: Array<{
    id: string;
    createdAt: string;
    content?: string;
    metadata?: Record<string, unknown> | null;
  }>,
): GovernanceTimelineEntry[] {
  const out: GovernanceTimelineEntry[] = [];

  for (const m of messages) {
    const meta = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
    if (!meta) continue;
    const kind = String(meta.kind ?? "").trim();

    if (kind === "main_room_wave_supervision_nudge") {
      const wave = Array.isArray(meta.waveDepartments)
        ? (meta.waveDepartments as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean)
        : [];
      out.push({
        id: m.id,
        kind: "wave",
        at: m.createdAt,
        title: wave.length ? `解锁 ${wave.join("、")}` : "依赖队列推进下一波",
        detail: String(m.content ?? "").slice(0, 200),
        taskId:
          typeof meta.parentGoalTaskId === "string" ? meta.parentGoalTaskId : undefined,
      });
      continue;
    }

    if (kind === "main_room_distribution_completion_summary") {
      out.push({
        id: m.id,
        kind: "completion",
        at: m.createdAt,
        title: "全部部门子目标已闭环",
        detail: String(m.content ?? "").slice(0, 240),
        taskId:
          typeof meta.parentGoalTaskId === "string"
            ? meta.parentGoalTaskId
            : typeof meta.distributionId === "string"
              ? undefined
              : undefined,
      });
      continue;
    }

    if (kind === "main_room_dispatch_item" || kind === "main_room_dept_dispatch") {
      const dispatchCard = extractMainRoomDispatchItemRichCard(meta);
      out.push({
        id: m.id,
        kind: "dispatch",
        at: m.createdAt,
        title: dispatchCard?.deptLabel ? `派活 · ${dispatchCard.deptLabel}` : "部门派活",
        detail: dispatchCard?.title ?? String(m.content ?? "").slice(0, 200),
        taskId: dispatchCard?.subGoalTaskId,
      });
      continue;
    }

    if (kind === "main_room_director_ack") {
      out.push({
        id: m.id,
        kind: "ack",
        at: m.createdAt,
        title: "主管已接单",
        detail: String(m.content ?? "").slice(0, 200),
        taskId: typeof meta.subGoalTaskId === "string" ? meta.subGoalTaskId : undefined,
      });
      continue;
    }

    if (kind === "main_room_dept_progress_relay") {
      out.push({
        id: m.id,
        kind: "progress",
        at: m.createdAt,
        title: String(meta.departmentLabel ?? "部门进展").slice(0, 64),
        detail: String(m.content ?? "").slice(0, 240),
        taskId: typeof meta.parentGoalTaskId === "string" ? meta.parentGoalTaskId : undefined,
      });
      continue;
    }

    const report = extractReportSummaryRichCard(meta);
    if (report) {
      out.push({
        id: m.id,
        kind: "report",
        at: m.createdAt,
        title: report.title,
        detail: report.summary.slice(0, 200),
        taskId: report.taskId,
      });
      continue;
    }

    const coord = extractCoordinationRequestRichCard(meta);
    if (coord) {
      out.push({
        id: m.id,
        kind: "coordination",
        at: m.createdAt,
        title: coord.title,
        detail: coord.request.slice(0, 200),
        taskId: coord.taskId,
      });
      continue;
    }

    const deliverable = extractEmployeeDeliverableRichCard(meta);
    if (deliverable) {
      const preview = deliverable.artifacts[0]?.label ?? deliverable.skillName ?? "交付物";
      out.push({
        id: m.id,
        kind: "deliverable",
        at: m.createdAt,
        title: deliverable.department ? `${deliverable.department} 交付` : "员工交付",
        detail: preview.slice(0, 200),
        taskId: deliverable.taskId,
      });
      continue;
    }

    const digest = extractSupervisionDeliverableDigestRichCard(meta);
    if (digest) {
      const deptLabels = digest.departments.map((d) => d.label ?? d.slug).filter(Boolean);
      out.push({
        id: m.id,
        kind: "digest",
        at: m.createdAt,
        title: "部门交付汇总",
        detail: deptLabels.length ? deptLabels.join("、") : String(m.content ?? "").slice(0, 200),
        taskId: digest.parentGoalTaskId,
      });
    }
  }

  return out;
}

export function extractDispatchSkippedRows(
  metadata: Record<string, unknown> | null | undefined,
): Array<{ departmentSlug: string; reason: string }> {
  if (!metadata) return [];
  const raw = metadata.dispatchFlushSkipped ?? metadata.dispatchSkipped;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const departmentSlug = String(row.departmentSlug ?? row.deptSlug ?? "").trim();
      const reason = String(row.reason ?? "unknown").trim();
      if (!departmentSlug) return null;
      return { departmentSlug, reason };
    })
    .filter((x): x is { departmentSlug: string; reason: string } => Boolean(x));
}
