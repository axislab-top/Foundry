import {
  DEFAULT_FALLBACK_DEPARTMENT_SLUG,
  resolveAssignableDepartmentSlugs,
} from './resolve-assignable-departments.js';

describe('resolveAssignableDepartmentSlugs', () => {
  it('org_only uses full normalized org list', () => {
    const r = resolveAssignableDepartmentSlugs({
      orgSlugs: [' 销售部 ', 'board-board', 'board-board'],
      intentSlugs: ['sales-missing'],
      policy: 'org_only',
    });
    expect(r.assignableDepartmentSlugs).toEqual(['销售部', 'board-board']);
    expect(r.intentDepartmentHints).toEqual([]);
    expect(r.droppedIntentSlugs).toEqual(['sales-missing']);
    expect(r.usedEmptyOrgFallback).toBe(false);
  });

  it('intent_filter narrows to valid intent slugs that exist in org', () => {
    const r = resolveAssignableDepartmentSlugs({
      orgSlugs: ['a', 'b', 'c'],
      intentSlugs: ['b', 'ghost', 'a'],
      policy: 'intent_filter',
    });
    expect(r.assignableDepartmentSlugs).toEqual(['b', 'a']);
    expect(r.intentDepartmentHints).toEqual(['b', 'a']);
    expect(r.droppedIntentSlugs).toEqual(['ghost']);
  });

  it('intent_filter falls back to org_only when no intent hints remain', () => {
    const r = resolveAssignableDepartmentSlugs({
      orgSlugs: ['x', 'y'],
      intentSlugs: ['nope'],
      policy: 'intent_filter',
    });
    expect(r.assignableDepartmentSlugs).toEqual(['x', 'y']);
    expect(r.intentDepartmentHints).toEqual([]);
  });

  it('empty org yields fallback slug', () => {
    const r = resolveAssignableDepartmentSlugs({
      orgSlugs: [],
      intentSlugs: ['anything'],
      policy: 'org_only',
    });
    expect(r.assignableDepartmentSlugs).toEqual([DEFAULT_FALLBACK_DEPARTMENT_SLUG]);
    expect(r.usedEmptyOrgFallback).toBe(true);
    expect(r.droppedIntentSlugs).toEqual(['anything']);
  });
});
