/** Platform-global skill names (seed migration) per agent role */
export function getDefaultGlobalSkillNamesForRole(role: string): string[] {
  const map: Record<string, string[]> = {
    ceo: ['echo', 'web-search', 'task-decompose', 'calendar-list', 'finance-quote'],
    director: ['echo', 'web-search', 'file-read', 'notes-append', 'slack-send'],
    board_member: ['echo', 'web-search', 'heartbeat'],
    executor: ['echo', 'code-run', 'file-read', 'file-write', 'github-create-issue'],
  };
  return map[role] ?? ['echo'];
}
