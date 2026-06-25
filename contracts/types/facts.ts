import type { OrgRosterPack } from './org-roster.js';

export type FactsQueryType =
  | 'company_people'
  | 'room_members'
  | 'role_presence'
  | 'org_structure'
  /** 按 requester 所在部门（或显式 nodeId）返回编制花名册 */
  | 'department_roster'
  /** 按 organizationNodeId 返回子树编制（CEO / 授权 director） */
  | 'node_roster';

export type IntentQuestionDomain = 'factual' | 'memory' | 'reasoning' | 'mixed';

export type FactsErrorCode = 'FACTS_FORBIDDEN' | 'FACTS_UNAVAILABLE' | 'FACTS_NOT_FOUND';
export type MemoryErrorCode = 'MEMORY_FORBIDDEN' | 'MEMORY_UNAVAILABLE';

export type CapabilityRole = 'ceo' | 'director' | 'employee' | 'unknown';

export type FactsRequester = {
  agentId: string;
  role: CapabilityRole;
  /** optional canonical department identifier (slug) used for scoping */
  departmentSlug?: string | null;
  /** optional human user id when request is on behalf of a human */
  userId?: string | null;
};

export interface FactsQueryRequest {
  companyId: string;
  roomId?: string | null;
  threadId?: string | null;
  traceId: string;
  locale?: string | null;
  /** department_roster / node_roster：显式组织节点（须通过权限校验） */
  organizationNodeId?: string | null;
  /**
   * - `memory_cortex_sync`：Memory Graph cortex 内部同步，放行 CEO 对公司事实的 live 查询门控。
   * - `main_room_replay_prefetch`：协作 worker 主群 replay 单回合预装配（admin RPC），同上放行；
   *   仅应由受信 worker 发起，与 `memory_cortex_sync` 同属内部路径。
   */
  factsClientMode?: 'default' | 'memory_cortex_sync' | 'main_room_replay_prefetch';
  requester: FactsRequester;
  queryType: FactsQueryType;
  /**
   * Role query string (best-effort) provided by upstream classifier.
   * API side may canonicalize it into `roleMatches[]`.
   */
  roleQuery?: string | null;
}

export type FactsSourceMeta = {
  source: string;
  ok: boolean;
  latencyMs?: number;
  note?: string | null;
};

export type FactsRoomMember = {
  memberType: 'human' | 'agent' | string;
  memberId: string;
  displayName?: string | null;
  role?: string | null;
};

export type FactsAgentRow = {
  id: string;
  name?: string | null;
  role?: string | null;
  organizationNodeId?: string | null;
  departmentSlug?: string | null;
};

export type FactsRoleMatch = {
  agentId: string;
  displayName: string;
  inRoom: boolean;
  matchedBy?: string | null;
};

export interface FactsQueryResult {
  queryType: FactsQueryType;
  generatedAt: string;
  counts?: Record<string, number>;
  companyPeople?: FactsAgentRow[];
  roomMembers?: FactsRoomMember[];
  roleMatches?: FactsRoleMatch[];
  orgStructure?: Record<string, unknown> | null;
  departmentRoster?: OrgRosterPack | null;
  sourceMeta?: FactsSourceMeta[];
}

export interface MemoryQueryRequest {
  companyId: string;
  traceId: string;
  requester: FactsRequester;
  /** explicit allow-list of namespaces; API must re-check */
  namespacesAllowed: string[];
  query: string;
  topK: number;
  roomId?: string | null;
}

export type MemorySearchHit = {
  id: string;
  content: string;
  score: number;
  namespace?: string;
  sourceType?: string;
  metadata?: Record<string, unknown> | null;
};

export interface MemoryQueryResult {
  generatedAt: string;
  hits: MemorySearchHit[];
  sourceMeta?: FactsSourceMeta[];
}

