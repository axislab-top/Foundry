import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import {
  shouldSuppressMainRoomDirectTargetsForCompanyOrgListing,
  suggestsCompanyWideDepartmentListingQuery,
} from './main-room-company-department-listing-query.util.js';

describe('suggestsCompanyWideDepartmentListingQuery', () => {
  it('matches company-wide department listing phrasing', () => {
    expect(suggestsCompanyWideDepartmentListingQuery('再看一遍，我公司有哪些部门')).toBe(true);
    expect(suggestsCompanyWideDepartmentListingQuery('公司组织架构是什么样的')).toBe(true);
    expect(suggestsCompanyWideDepartmentListingQuery('咱们公司有哪几个部门')).toBe(true);
    expect(suggestsCompanyWideDepartmentListingQuery('你们公司有哪些部门')).toBe(true);
    expect(suggestsCompanyWideDepartmentListingQuery('show me the org chart')).toBe(true);
    expect(suggestsCompanyWideDepartmentListingQuery('what departments do we have')).toBe(true);
  });

  it('does not match intra-department or non-listing phrasing', () => {
    expect(suggestsCompanyWideDepartmentListingQuery('你们部门最近忙吗')).toBe(false);
    expect(suggestsCompanyWideDepartmentListingQuery('请各部门主管依次自我介绍')).toBe(false);
  });
});

describe('shouldSuppressMainRoomDirectTargetsForCompanyOrgListing', () => {
  const room: RoomContext = {
    companyId: 'c',
    roomId: 'r',
    roomType: 'main',
    roomName: 'Main',
    organizationNodeId: null,
    members: [{ memberType: 'agent', memberId: 'd1' }],
    memberDirectory: [{ memberType: 'agent', memberId: 'd1', displayName: 'X', roleLabel: '财务总监' }],
    orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
  };

  it('true for org listing without @', () => {
    expect(
      shouldSuppressMainRoomDirectTargetsForCompanyOrgListing({
        userText: '我公司有哪些部门',
        roomContext: room,
        mentionedAgentIds: [],
        ceoAgentId: 'ceo',
      }),
    ).toBe(true);
  });

  it('false when user @ non-CEO agent in room', () => {
    expect(
      shouldSuppressMainRoomDirectTargetsForCompanyOrgListing({
        userText: '我公司有哪些部门',
        roomContext: room,
        mentionedAgentIds: ['d1'],
        ceoAgentId: 'ceo',
      }),
    ).toBe(false);
  });
});
