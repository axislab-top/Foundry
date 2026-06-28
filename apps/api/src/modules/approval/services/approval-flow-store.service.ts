import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MultiLevelApprovalSchema, type MultiLevelApproval } from '@foundry/multi-agent-core';
import type { ApprovalFlowStorePort } from '@foundry/multi-agent-core';
import { ApprovalFlowEntity } from '../entities/approval-flow.entity.js';

@Injectable()
export class ApprovalFlowStoreService implements ApprovalFlowStorePort {
  constructor(
    @InjectRepository(ApprovalFlowEntity)
    private readonly repo: Repository<ApprovalFlowEntity>,
  ) {}

  async save(flow: MultiLevelApproval): Promise<void> {
    const row = this.repo.create({
      id: flow.approvalFlowId,
      traceId: flow.traceId,
      companyId: flow.companyId as any,
      flowData: flow as unknown as Record<string, unknown>,
      status: flow.status,
      currentIndex: flow.currentIndex ?? null,
    });
    await this.repo.save(row);
  }

  async findById(flowId: string): Promise<MultiLevelApproval | null> {
    const row = await this.repo.findOne({ where: { id: flowId } });
    if (!row) return null;
    const parsed = MultiLevelApprovalSchema.safeParse(row.flowData);
    return parsed.success ? (parsed.data as MultiLevelApproval) : null;
  }

  async update(flow: MultiLevelApproval): Promise<void> {
    await this.repo.update(
      { id: flow.approvalFlowId },
      {
        flowData: flow as unknown as Record<string, unknown>,
        status: flow.status,
        currentIndex: flow.currentIndex ?? null,
      },
    );
  }

  async updateStatus(flowId: string, status: MultiLevelApproval['status'], currentIndex?: number): Promise<void> {
    await this.repo.update(
      { id: flowId },
      {
        status,
        ...(typeof currentIndex === 'number' ? { currentIndex } : {}),
      },
    );
  }
}

