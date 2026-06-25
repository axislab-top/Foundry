import type { DispatchPlanAssignmentRow } from "../components/DispatchPlanDraftCard";

export type DependencyEdge = { fromSlug: string; toSlug: string; toTitle: string };

const SLUG_LABEL: Record<string, string> = {
  marketing: "市场部",
  operations: "运营部",
  finance: "财务部",
  engineering: "技术部",
  tech: "技术部",
};

export function slugDisplayLabel(slug: string): string {
  const s = String(slug ?? "").trim().toLowerCase();
  return SLUG_LABEL[s] ?? (s || "—");
}

/** 从分工行构建依赖边（dependsOnSlugs → departmentSlug）。 */
export function buildDependencyEdges(assignments: DispatchPlanAssignmentRow[]): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const row of assignments) {
    const toSlug = String(row.departmentSlug ?? "").trim().toLowerCase();
    if (!toSlug) continue;
    const deps = Array.isArray(row.dependsOnSlugs) ? row.dependsOnSlugs : [];
    for (const d of deps) {
      const fromSlug = String(d ?? "").trim().toLowerCase();
      if (!fromSlug || fromSlug === toSlug) continue;
      edges.push({ fromSlug, toSlug, toTitle: row.title });
    }
  }
  return edges;
}

/** 按依赖关系计算执行波次（同波可并行）。 */
export function computeDependencyWaves(assignments: DispatchPlanAssignmentRow[]): string[][] {
  const slugs = assignments
    .map((a) => String(a.departmentSlug ?? "").trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(slugs)];
  if (!unique.length) return [];

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const s of unique) {
    inDegree.set(s, 0);
    adj.set(s, []);
  }

  for (const row of assignments) {
    const to = String(row.departmentSlug ?? "").trim().toLowerCase();
    if (!to) continue;
    const deps = Array.isArray(row.dependsOnSlugs) ? row.dependsOnSlugs : [];
    for (const d of deps) {
      const from = String(d ?? "").trim().toLowerCase();
      if (!from || from === to || !unique.includes(from) || !unique.includes(to)) continue;
      adj.get(from)!.push(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  }

  const waves: string[][] = [];
  const remaining = new Set(unique);
  let guard = 0;
  while (remaining.size > 0 && guard < unique.length + 2) {
    guard += 1;
    const wave = [...remaining].filter((s) => (inDegree.get(s) ?? 0) === 0);
    if (!wave.length) break;
    waves.push(wave.sort());
    for (const s of wave) {
      remaining.delete(s);
      for (const next of adj.get(s) ?? []) {
        inDegree.set(next, Math.max(0, (inDegree.get(next) ?? 1) - 1));
      }
    }
  }
  if (remaining.size) {
    waves.push([...remaining].sort());
  }
  return waves;
}

/** 检测依赖环（保存前客户端校验）。 */
export function detectDependencyCycle(assignments: DispatchPlanAssignmentRow[]): string[] | null {
  const edges = buildDependencyEdges(assignments);
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.fromSlug);
    nodes.add(e.toSlug);
  }
  for (const a of assignments) {
    const s = String(a.departmentSlug ?? "").trim().toLowerCase();
    if (s) nodes.add(s);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (n: string): boolean => {
    if (stack.has(n)) return true;
    if (visited.has(n)) return false;
    visited.add(n);
    stack.add(n);
    const outs = edges.filter((e) => e.fromSlug === n).map((e) => e.toSlug);
    for (const o of outs) {
      if (dfs(o)) return true;
    }
    stack.delete(n);
    return false;
  };

  for (const n of nodes) {
    if (dfs(n)) {
      return [...stack];
    }
  }
  return null;
}
