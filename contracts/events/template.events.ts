/**
 * 模板市场 / Agent 商城相关事件
 */

import type { BaseEvent } from './base-event.js';

/**
 * 公司模板 JSON 内容（导入时由 Worker 进一步物化到各模块）
 */
export interface TemplateContentPayload {
  defaults?: {
    goal?: string;
    initialBudget?: number;
  };
  heartbeat?: {
    enabled?: boolean;
    frequency?: 'hourly' | 'daily' | 'weekly';
    metadata?: {
      excludedDirectorAgentIds?: string[];
    };
  };
  departmentPlacements?: Array<{
    name: string;
    headAgentSlug?: string | null;
    memberAgentSlugs?: string[];
  }>;
  organization?: {
    nodes?: Array<{ title: string; kind?: string; parentTitle?: string }>;
  };
  agents?: Array<{
    name: string;
    role: string;
    expertise?: string;
    systemPrompt?: string;
    llmModel?: string;
  }>;
  skills?: string[];
  memorySeeds?: unknown[];
  taskSeeds?: unknown[];
}

/**
 * 模板一键导入完成（公司已创建，异步初始化组织/Agent 等）
 */
export interface TemplateImportedEvent extends BaseEvent {
  eventType: 'template.imported';
  aggregateType: 'template';
  data: {
    templateId: string;
    templateSlug: string;
    templateVersion: string;
    companyId: string;
    importedBy: string;
    content: TemplateContentPayload;
    importedAt: string;
  };
}

/**
 * Agent 商城购买完成（应用到指定组织节点等由 Worker 处理）
 */
export interface AgentPurchasedEvent extends BaseEvent {
  eventType: 'agent.purchased';
  aggregateType: 'marketplace_agent';
  data: {
    marketplaceAgentId: string;
    companyId: string;
    /** 安装目标组织节点；缺则 Worker 不物化 */
    organizationNodeId: string;
    /** Hiring path discriminator (permanent vs project-scoped temporary). */
    employmentType?: 'permanent' | 'temporary';
    /** Project binding for temporary hires (currently aligned to tasks.id). */
    projectId?: string;
    /** 遗留：安装时独占的 Key。新安装走商城 bindings 动态解析，可不填。 */
    assignedLlmKeyId?: string;
    assignedModelName?: string;
    purchasedBy: string;
    purchasedAt: string;
  };
}

/**
 * 商城 Agent 的 LLM/Embedding 绑定变更（管理员保存后发布；Worker 可通知已安装公司）
 */
export interface MarketplaceBindingUpdatedEvent extends BaseEvent {
  eventType: 'marketplace.binding.updated';
  aggregateType: 'marketplace_agent';
  data: {
    marketplaceAgentId: string;
    agentName: string;
    changedFields: string[];
    updatedAt: string;
    /** 安装过该商城商品的公司（用于主群通知；已截断防超大 payload） */
    companyIds: string[];
    /** 已安装该公司的租户 Agent（用于 Worker 清理 LLM Key 池缓存；可截断） */
    installedAgentTargets?: Array<{ companyId: string; agentId: string }>;
  };
}

/**
 * P20：商城 `recommended_skill_version_ids` 变更或新增钉版本后发布；
 * Worker 可向已绑定旧版本 Skill 的公司推送协作消息，并可对 **非高危** 目标版本尝试自动升级。
 */
export interface MarketplaceSkillVersionPublishedEvent extends BaseEvent {
  eventType: 'marketplace.skill_version.published';
  aggregateType: 'marketplace_agent';
  data: {
    marketplaceAgentId: string;
    agentName: string;
    /** 本次新增或保留引用的全局 Skill 行 ID */
    publishedSkillIds: string[];
    updatedAt: string;
    /** 仍绑定旧版同名 Skill 的公司（截断后列表） */
    companyIds: string[];
  };
}

export type TemplateEvent =
  | TemplateImportedEvent
  | AgentPurchasedEvent
  | MarketplaceBindingUpdatedEvent
  | MarketplaceSkillVersionPublishedEvent;

export interface TemplateEventTopics {
  'template.imported': TemplateImportedEvent;
  'agent.purchased': AgentPurchasedEvent;
  'marketplace.binding.updated': MarketplaceBindingUpdatedEvent;
  'marketplace.skill_version.published': MarketplaceSkillVersionPublishedEvent;
}
