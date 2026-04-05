/**
 * 公司相关事件契约
 * 用于事件驱动架构中的公司领域事件
 */

import type { BaseEvent } from './base-event.js';

export type CompanyStatus = 'draft' | 'active' | 'suspended' | 'archived';

/**
 * 公司创建事件
 */
export interface CompanyCreatedEvent extends BaseEvent {
  eventType: 'company.created';
  aggregateType: 'company';
  data: {
    companyId: string;
    name: string;
    slug: string;
    industry?: string;
    /** 稳定行业枚举，与组织默认部门映射一致 */
    industryCode?: string;
    createdBy: string;
    status: CompanyStatus;
    createdAt: string;
  };
}

/**
 * 公司更新事件
 */
export interface CompanyUpdatedEvent extends BaseEvent {
  eventType: 'company.updated';
  aggregateType: 'company';
  data: {
    companyId: string;
    updatedBy: string;
    changes: {
      name?: string;
      slug?: string;
      industry?: string;
      industryCode?: string;
      scale?: string;
      goal?: string;
      initialBudget?: number;
      description?: string;
      timezone?: string;
      defaultLanguage?: string;
      contactEmail?: string;
      contactPhone?: string;
      logoUrl?: string;
    };
    updatedAt: string;
  };
}

/**
 * 公司状态变更事件
 */
export interface CompanyStatusChangedEvent extends BaseEvent {
  eventType: 'company.status_changed';
  aggregateType: 'company';
  data: {
    companyId: string;
    changedBy: string;
    fromStatus: CompanyStatus;
    toStatus: CompanyStatus;
    reason?: string;
    changedAt: string;
  };
}

export type CompanyEvent =
  | CompanyCreatedEvent
  | CompanyUpdatedEvent
  | CompanyStatusChangedEvent;

export interface CompanyEventTopics {
  'company.created': CompanyCreatedEvent;
  'company.updated': CompanyUpdatedEvent;
  'company.status_changed': CompanyStatusChangedEvent;
}
