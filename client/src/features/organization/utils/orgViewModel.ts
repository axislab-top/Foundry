import type { TaskItem } from "@/features/tasks/api/tasksTypes";
import type {
  AgentNode,
  DepartmentNode,
  DirectorNode,
  FounderNode,
  OrgChartData,
  PlatformDepartmentTemplate,
} from "../types";
import type { ApiAgent, OrgTreeNode, PlatformDepartmentApiRow } from "../types/api";
import { getDeptColors, getDeptNameEn } from "./deptColors";
import { countAgentTasks, deriveAgentWorkStatus, toUiAgentStatus } from "./agentStatus";
import {
  buildNodeIdToDepartmentIdMap,
  collectPlatformDepartmentSlugs,
  findCeoNode,
  findDepartments,
  flattenOrgTree,
} from "./orgTree";

const LEADERSHIP_ROLES = new Set(["ceo", "board_member", "director"]);

export function buildOrgViewModel(
  tree: OrgTreeNode[],
  apiAgents: ApiAgent[],
  tasks: TaskItem[],
): OrgChartData {
  const flat = flattenOrgTree(tree);
  const lite = flat.map((n) => ({ id: n.id, parentId: n.parentId, type: n.type }));
  const deptMap = buildNodeIdToDepartmentIdMap(lite);

  const ceoNode = findCeoNode(tree);
  const founder: FounderNode = {
    id: ceoNode?.id ?? "founder",
    name: ceoNode?.name ?? "创始人",
    title: ceoNode?.description?.trim() || "创始人 / CEO",
  };

  const deptNodes = findDepartments(tree);
  const departments: DepartmentNode[] = [];
  const directors: DirectorNode[] = [];
  const agents: AgentNode[] = [];

  const directorByDeptId = new Map<string, ApiAgent>();

  for (const agent of apiAgents) {
    if (agent.role !== "director") continue;
    const deptId = agent.organizationNodeId ? deptMap.get(agent.organizationNodeId) : null;
    if (deptId) directorByDeptId.set(deptId, agent);
  }

  for (const deptNode of deptNodes) {
    const slugRaw = deptNode.metadata?.platformDepartmentSlug;
    const slug = typeof slugRaw === "string" && slugRaw.trim() ? slugRaw.trim() : deptNode.id;
    const colors = getDeptColors(slug);

    let directorAgent = directorByDeptId.get(deptNode.id) ?? null;
    if (!directorAgent && deptNode.agentId) {
      directorAgent = apiAgents.find((a) => a.id === deptNode.agentId && a.role === "director") ?? null;
    }

    departments.push({
      id: deptNode.id,
      slug,
      name: deptNode.name,
      nameEn: getDeptNameEn(slug),
      ...colors,
      directorId: directorAgent?.id ?? null,
    });

    if (directorAgent) {
      const workStatus = deriveAgentWorkStatus(directorAgent.id, tasks);
      const taskCounts = countAgentTasks(directorAgent.id, tasks);
      directors.push({
        id: directorAgent.id,
        name: directorAgent.name,
        role: directorAgent.expertise ?? "部门主管",
        roleEn: "Director",
        status: toUiAgentStatus(workStatus),
        departmentId: deptNode.id,
        todayTasks: taskCounts.todayTasks,
        completedTasks: taskCounts.completedTasks,
      });
    }
  }

  for (const agent of apiAgents) {
    if (LEADERSHIP_ROLES.has(agent.role)) continue;
    const deptId = agent.organizationNodeId ? deptMap.get(agent.organizationNodeId) : null;
    if (!deptId) continue;

    const workStatus = deriveAgentWorkStatus(agent.id, tasks);
    const taskCounts = countAgentTasks(agent.id, tasks);
    agents.push({
      id: agent.id,
      name: agent.name,
      role: agent.expertise ?? agent.role,
      roleEn: agent.role,
      status: toUiAgentStatus(workStatus),
      departmentId: deptId,
      todayTasks: taskCounts.todayTasks,
      completedTasks: taskCounts.completedTasks,
    });
  }

  return { founder, departments, directors, agents };
}

export function mergePlatformTemplates(
  apiRows: PlatformDepartmentApiRow[],
  existingSlugs: Set<string>,
): PlatformDepartmentTemplate[] {
  return apiRows
    .filter((row) => !existingSlugs.has(row.slug))
    .map((row) => {
      const colors = getDeptColors(row.slug);
      return {
        slug: row.slug,
        displayName: row.displayName,
        nameEn: getDeptNameEn(row.slug),
        category: row.category ?? "通用",
        responsibilitySummary: row.responsibilitySummary ?? "",
        sortOrder: row.sortOrder,
        ...colors,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "zh"));
}

export function getAvailablePlatformTemplates(
  tree: OrgTreeNode[],
  apiRows: PlatformDepartmentApiRow[],
): PlatformDepartmentTemplate[] {
  const existing = collectPlatformDepartmentSlugs(tree);
  return mergePlatformTemplates(apiRows, existing);
}

export function getDepartmentById(departments: DepartmentNode[], id: string) {
  return departments.find((d) => d.id === id);
}

export function getDirectorForDepartment(directors: DirectorNode[], departmentId: string) {
  return directors.find((d) => d.departmentId === departmentId) ?? null;
}

export function getAgentsForDepartment(agents: AgentNode[], departmentId: string) {
  return agents.filter((a) => a.departmentId === departmentId);
}
