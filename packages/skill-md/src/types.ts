/** AgentSkills + Foundry GitOps frontmatter (superset). */
export type SkillImplementationType =
  | 'prompt'
  | 'builtin'
  | 'langgraph'
  | 'api'
  | 'external'
  | 'mcp';

export type SkillMdFrontmatter = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  'allowed-tools'?: string;
  category?: string;
  implementationType?: SkillImplementationType | string;
  toolSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  promptTemplate?: string;
  displayName?: string;
  icon?: string;
};

export type ParsedSkillMd = {
  frontmatter: SkillMdFrontmatter;
  body: string;
};

export type SkillMdValidationIssue = {
  field: string;
  message: string;
};

export type SkillMdDbPayload = {
  name: string;
  displayName: string;
  description: string;
  promptTemplate: string;
  implementationType: SkillImplementationType;
  toolSchema: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  category: string[] | null;
  icon: string | null;
  metadata: Record<string, unknown>;
};

export type SkillRowLike = {
  name: string;
  displayName?: string | null;
  description?: string | null;
  promptTemplate?: string | null;
  implementationType?: string | null;
  toolSchema?: Record<string, unknown> | null;
  inputSchema?: Record<string, unknown> | null;
  category?: string[] | null;
  icon?: string | null;
  metadata?: Record<string, unknown> | null;
};
