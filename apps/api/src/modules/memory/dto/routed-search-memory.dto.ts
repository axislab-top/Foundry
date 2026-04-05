import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { SearchMemoryDto } from './search-memory.dto.js';

export type MemoryRoutedScope = 'company' | 'department' | 'personal' | 'hierarchy';

export type MemoryAgentRoleHint = 'ceo' | 'director' | 'board_member' | 'executor';

/**
 * Agent / Tool 侧「公司知识检索」推荐入口：由 Router 解析 scope + 权限内命名空间，再走混合检索。
 */
export class RoutedSearchMemoryDto extends SearchMemoryDto {
  @IsOptional()
  @IsIn(['company', 'department', 'personal', 'hierarchy'])
  scope?: MemoryRoutedScope;

  /** 未传 scope 时按角色给默认检索范围（CEO 偏全局分层，执行器偏部门+个人等） */
  @IsOptional()
  @IsIn(['ceo', 'director', 'board_member', 'executor'])
  agentRole?: MemoryAgentRoleHint;

  /** scope=personal 必需；hierarchy 时用于个人层 */
  @IsOptional()
  @IsUUID()
  agentId?: string;

  /** scope=department 时使用；亦作部门默认节点 */
  @IsOptional()
  @IsUUID()
  primaryOrganizationNodeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;

  /** true 时在 RPC 响应中附带 router 解析说明（便于调试与审计） */
  @IsOptional()
  @IsBoolean()
  explain?: boolean;
}
