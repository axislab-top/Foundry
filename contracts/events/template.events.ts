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
    organizationNodeId?: string;
    assignedLlmKeyId: string;
    assignedModelName: string;
    purchasedBy: string;
    pricingModel: 'free' | 'one_time' | 'subscription';
    purchasedAt: string;
  };
}

export type TemplateEvent = TemplateImportedEvent | AgentPurchasedEvent;

export interface TemplateEventTopics {
  'template.imported': TemplateImportedEvent;
  'agent.purchased': AgentPurchasedEvent;
}
