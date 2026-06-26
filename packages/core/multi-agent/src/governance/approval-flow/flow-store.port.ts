import type { MultiLevelApproval } from './multi-level-approval.schema.js';

export interface ApprovalFlowStorePort {
  save(flow: MultiLevelApproval): Promise<void>;
  findById(flowId: string): Promise<MultiLevelApproval | null>;
  update(flow: MultiLevelApproval): Promise<void>;
  updateStatus(flowId: string, status: MultiLevelApproval['status'], currentIndex?: number): Promise<void>;
}

