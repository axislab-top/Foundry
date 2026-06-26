import type { BaseEvent } from './base-event.js';

/** 平台部门与商城总监 1:1 绑定状态变更（审计 / 下游同步） */
export interface PlatformDepartmentHeadBoundEvent extends BaseEvent {
  eventType: 'platform.department.head.bound';
  aggregateType: 'platform_department';
  data: {
    platformDepartmentId: string;
    slug: string;
    displayName: string;
    headMarketplaceAgentId: string;
    headMarketplaceAgentSlug: string;
    actorUserId: string;
  };
}

export interface PlatformDepartmentHeadUnboundEvent extends BaseEvent {
  eventType: 'platform.department.head.unbound';
  aggregateType: 'platform_department';
  data: {
    platformDepartmentId: string;
    slug: string;
    displayName: string;
    previousHeadMarketplaceAgentId: string | null;
    actorUserId: string;
  };
}

export type PlatformDepartmentEvent = PlatformDepartmentHeadBoundEvent | PlatformDepartmentHeadUnboundEvent;
