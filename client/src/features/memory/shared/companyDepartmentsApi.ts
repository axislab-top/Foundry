import { fetchOrganizationTree } from "@/features/organization/api/organizationApi";
import { findDepartments } from "@/features/organization/utils/orgTree";
import type { CompanyDepartmentRef } from "@/features/memory/shared/namespace";

export type CompanyDepartmentOption = CompanyDepartmentRef & {
  name: string;
};

/** 从当前公司的组织树提取部门（非平台全量部门模板） */
export async function listCompanyDepartments(): Promise<CompanyDepartmentOption[]> {
  const tree = await fetchOrganizationTree();
  return findDepartments(tree).map((node) => {
    const slugRaw = node.metadata?.platformDepartmentSlug;
    const slug =
      typeof slugRaw === "string" && slugRaw.trim() ? slugRaw.trim() : node.id;
    return {
      slug,
      nodeId: node.id,
      name: node.name,
    };
  });
}

export function findCompanyDepartment(
  departments: CompanyDepartmentOption[],
  selectedKey: string,
): CompanyDepartmentOption | null {
  if (!selectedKey) return null;
  return (
    departments.find((d) => d.nodeId === selectedKey || d.slug === selectedKey) ?? null
  );
}
