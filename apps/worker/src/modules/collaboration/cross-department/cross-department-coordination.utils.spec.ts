import {
  CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK,
  CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK,
  detectCrossDepartmentCoordinationEscalation,
  detectCrossDepartmentCoordinationNeed,
} from './cross-department-coordination.utils.js';

describe('cross-department-coordination.utils', () => {
  it('detectCrossDepartmentCoordinationNeed: two org nodes => true', () => {
    expect(
      detectCrossDepartmentCoordinationNeed({
        contentText: 'hello',
        mentionedNodeIds: ['n1', 'n2'],
      }),
    ).toBe(true);
  });

  it('detectCrossDepartmentCoordinationNeed: keyword in text => true', () => {
    expect(
      detectCrossDepartmentCoordinationNeed({
        contentText: '请安排 cross-department 对齐',
        mentionedNodeIds: [],
      }),
    ).toBe(true);
  });

  it('detectCrossDepartmentCoordinationNeed: single node and plain text => false', () => {
    expect(
      detectCrossDepartmentCoordinationNeed({
        contentText: '日常跟进',
        mentionedNodeIds: ['only-one'],
      }),
    ).toBe(false);
  });

  it('detectCrossDepartmentCoordinationEscalation: two nodes without coordination text => false', () => {
    expect(
      detectCrossDepartmentCoordinationEscalation({
        contentText: 'hello',
        mentionedNodeIds: ['n1', 'n2'],
      }),
    ).toBe(false);
  });

  it('detectCrossDepartmentCoordinationEscalation: two nodes with 协助 => true', () => {
    expect(
      detectCrossDepartmentCoordinationEscalation({
        contentText: '请协助对齐接口',
        mentionedNodeIds: ['n1', 'n2'],
      }),
    ).toBe(true);
  });

  it('detectCrossDepartmentCoordinationEscalation: explicit cross-dept phrase => true', () => {
    expect(
      detectCrossDepartmentCoordinationEscalation({
        contentText: '需要 cross-department 对齐',
        mentionedNodeIds: [],
      }),
    ).toBe(true);
  });

  it('routing keys match contracts topics', () => {
    expect(CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK).toBe('cross-department.coordination.requested');
    expect(CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK).toBe('cross-department.coordination.completed');
  });
});
