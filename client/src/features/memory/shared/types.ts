export type MemoryScope = "company" | "department" | "agent";

export type MemorySourceType =
  | "chat"
  | "task"
  | "skill"
  | "document"
  | "summary"
  | "manual";

export type MemoryStatus = "active" | "archived";

export type MemoryEntryView = {
  id: string;
  collectionId?: string;
  namespace: string;
  title: string;
  content: string;
  sourceType: MemorySourceType | string;
  score?: number;
  createdAt?: string;
  updatedAt?: string;
  isSensitive?: boolean;
  redacted?: boolean;
  tags: string[];
  status: MemoryStatus;
  metadata?: Record<string, unknown> | null;
};

export type MemorySearchParams = {
  query: string;
  namespaces?: string[];
  sourceTypes?: string[];
  topK?: number;
  createdAfter?: string;
  createdBefore?: string;
  agentId?: string;
  organizationNodeId?: string;
};

export type CreateMemoryPayload = {
  namespace: string;
  collectionLabel?: string;
  content: string;
  sourceType: MemorySourceType;
  metadata?: Record<string, unknown>;
};

export type MemoryListParams = {
  namespaces?: string[];
  sourceTypes?: string[];
  createdAfter?: string;
  topK?: number;
};
