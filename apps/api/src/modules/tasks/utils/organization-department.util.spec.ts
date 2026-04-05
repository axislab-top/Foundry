import { buildNodeIdToDepartmentIdMap, collectDescendantOrgNodeIds } from './organization-department.util.js';

describe('organization-department.util', () => {
  const nodes = [
    { id: 'b1', parentId: null, type: 'board' as const },
    { id: 'ceo', parentId: 'b1', type: 'ceo' as const },
    { id: 'd1', parentId: 'ceo', type: 'department' as const },
    { id: 'slot1', parentId: 'd1', type: 'agent' as const },
    { id: 'slot2', parentId: 'd1', type: 'agent' as const },
  ];

  it('buildNodeIdToDepartmentIdMap maps slots to parent department', () => {
    const m = buildNodeIdToDepartmentIdMap(nodes);
    expect(m.get('slot1')).toBe('d1');
    expect(m.get('d1')).toBe('d1');
    expect(m.get('ceo')).toBeNull();
  });

  it('collectDescendantOrgNodeIds includes root and nested children', () => {
    const s = collectDescendantOrgNodeIds('d1', nodes);
    expect(s.has('d1')).toBe(true);
    expect(s.has('slot1')).toBe(true);
    expect(s.has('slot2')).toBe(true);
    expect(s.has('ceo')).toBe(false);
  });
});
