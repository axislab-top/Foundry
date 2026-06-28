import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../../common/decorators/public.decorator.js';
import { OrganizationNode } from '../entities/organization-node.entity.js';
import { OrgRosterService } from '../services/org-roster.service.js';
import { TenantContextService } from '@service/tenant';

class InternalOrganizationNodeAgentsDto {
  @IsUUID()
  nodeId: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeSelf?: boolean = true;
}

/**
 * Internal Tool endpoints for Runner sandbox HTTP execution.
 *
 * NOTE: Runner sandbox HTTP invocation currently does NOT support custom headers.
 * We therefore authenticate using a fixed query param token embedded in the Tool handlerConfig.url.
 */
@Public()
@Controller('internal/tools/organization')
export class OrganizationToolsInternalController {
  constructor(
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    private readonly orgRoster: OrgRosterService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private assertToken(token: string | undefined): void {
    const expected = String(process.env.API_INTERNAL_AUTH_SECRET ?? '').trim();
    if (!expected) {
      throw new UnauthorizedException('internal tool routes disabled');
    }
    if (String(token ?? '').trim() !== expected) {
      throw new UnauthorizedException('invalid internal auth');
    }
  }

  /**
   * List agents bound under an organization node (department roster).
   *
   * Tool name suggestion: tool.organization_node_agents
   */
  @Post('node-agents')
  @HttpCode(HttpStatus.OK)
  async nodeAgents(
    @Query('token') token: string | undefined,
    @Body() body: InternalOrganizationNodeAgentsDto,
  ): Promise<{
    ok: true;
    companyId: string;
    nodeId: string;
    includeSelf: boolean;
    items: Array<{
      agentId: string;
      agentName: string;
      role: string;
      organizationNodeId: string;
      organizationNodeName: string;
      inCurrentRoom?: boolean;
      boundOnOrgTree?: boolean;
      agentsTableOnly?: boolean;
    }>;
    revision?: string;
    counts?: Record<string, number>;
  }> {
    this.assertToken(token);

    const node = await this.nodesRepo.findOne({
      where: { id: body.nodeId } as any,
      select: ['id', 'companyId', 'name'] as any,
    });
    if (!node) {
      throw new NotFoundException('organization node not found');
    }

    const pack = await this.tenantContext.runWithCompanyId(node.companyId, () =>
      this.orgRoster.buildDepartmentRoster({
        anchorOrganizationNodeId: node.id,
        scope: 'node',
      }),
    );

    return {
      ok: true,
      companyId: node.companyId,
      nodeId: node.id,
      includeSelf: body.includeSelf !== false,
      revision: pack.revision,
      items: pack.members.map((m) => ({
        agentId: m.agentId,
        agentName: m.displayName,
        role: m.role,
        organizationNodeId: m.organizationNodeId,
        organizationNodeName: m.organizationNodeName,
        inCurrentRoom: m.inCurrentRoom,
        boundOnOrgTree: m.boundOnOrgTree,
        agentsTableOnly: m.agentsTableOnly,
      })),
      counts: pack.counts,
    };
  }
}

