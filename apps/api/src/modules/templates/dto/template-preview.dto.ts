import type { CompanyTemplateType } from '../entities/company-template.entity.js';

export interface TemplateAgentSummaryDto {
  id: string;
  slug: string;
  name: string;
  roleHint: string | null;
  sortOrder: number;
}

export interface TemplatePreviewDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string | null;
  scale: string | null;
  templateType: CompanyTemplateType;
  previewImageUrl: string | null;
  priceCents: number;
  currency: string;
  version: string;
  usageCount: number;
  ratingAvg: string | null;
  estimatedMonthlyCostHint?: string;
  organizationSummary: { nodeCount: number; titles: string[] };
  agentSummaries: Array<{ name: string; role: string; expertise?: string }>;
  linkedMarketplaceAgents: TemplateAgentSummaryDto[];
}
