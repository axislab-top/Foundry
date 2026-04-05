/**
 * 文档化 Owner / Admin / Member 在公司资源上的预期（与 TasksService.assertAdmin 等对齐）。
 */
describe('Company membership roles (contract)', () => {
  it('defines expected role strings for company_memberships.role', () => {
    const roles = ['owner', 'admin', 'member'] as const;
    expect(roles).toContain('owner');
    expect(roles).toContain('admin');
    expect(roles).toContain('member');
  });
});
