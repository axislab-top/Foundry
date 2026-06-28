import { Injectable } from '@nestjs/common';
import type { FactsQueryRequest, FactsQueryResult } from '@contracts/types';
import { RoomMemberService } from '../collaboration/services/room-member.service.js';
import { OrganizationService } from '../organization/services/organization.service.js';

@Injectable()
export class FactsService {
  constructor(
    private readonly roomMembers: RoomMemberService,
    private readonly organization: OrganizationService,
  ) {}

  async listRoomMembers(params: { companyId: string; roomId: string }) {
    return this.roomMembers.listActiveMembers(params.companyId, params.roomId);
  }

  async getOrgTree(companyId: string): Promise<Record<string, unknown>[]> {
    // OrganizationService reads companyId from tenant context; caller must wrap in tenantContext.runWithCompanyId.
    const tree = await this.organization.getTree({});
    return tree as unknown as Record<string, unknown>[];
  }

  buildEmptyResult(req: FactsQueryRequest): FactsQueryResult {
    return {
      queryType: req.queryType,
      generatedAt: new Date().toISOString(),
      counts: {},
      sourceMeta: [],
    };
  }
}

