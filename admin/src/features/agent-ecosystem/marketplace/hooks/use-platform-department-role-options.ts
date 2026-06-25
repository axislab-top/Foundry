import { useCallback, useEffect, useMemo, useState } from 'react';
import { listPlatformDepartments } from '../../../platform-departments/api';

type DepartmentRoleOption = { label: string; value: string };

/**
 * 从 Admin「Platform Departments」加载部门 slug，供 marketplace agent 的 departmentRoles 选择。
 */
export function usePlatformDepartmentRoleOptions(enabled = true): {
  options: DepartmentRoleOption[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Array<{ slug: string; displayName: string }>>([]);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listPlatformDepartments();
      const next = (Array.isArray(rows) ? rows : [])
        .map((row) => ({
          slug: String(row.slug ?? '').trim(),
          displayName: String(row.displayName ?? '').trim(),
        }))
        .filter((row) => row.slug.length > 0)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'));
      setDepartments(next);
    } catch (e) {
      setDepartments([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  const options = useMemo(
    () =>
      departments.map((dept) => ({
        label: dept.displayName ? `${dept.displayName} (${dept.slug})` : dept.slug,
        value: dept.slug,
      })),
    [departments],
  );

  return { options, loading, error, reload };
}
