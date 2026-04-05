import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { TemplateImportedEvent } from '@contracts/events';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';

/** 与 API CreateOrganizationNodeDto.type 对齐 */
type OrganizationNodeType = 'board' | 'ceo' | 'department' | 'agent';

/** 与 API AgentRole 对齐 */
type AgentRole = 'ceo' | 'director' | 'board_member' | 'executor';

function mapAgentRole(role: string | undefined): AgentRole {
  const r = (role ?? '').toLowerCase();
  if (r === 'ceo') return 'ceo';
  if (r === 'director') return 'director';
  if (r === 'board_member' || r === 'board') return 'board_member';
  return 'executor';
}

function mapNodeKind(kind: string | undefined): OrganizationNodeType {
  const k = (kind ?? '').toLowerCase();
  if (k === 'board' || k === 'ceo' || k === 'department' || k === 'agent') {
    return k as OrganizationNodeType;
  }
  return 'department';
}

type TemplateOrgNode = { title: string; parentTitle?: string; kind?: string };

function sortNodesByDependency(nodes: TemplateOrgNode[]): TemplateOrgNode[] {
  const out: TemplateOrgNode[] = [];
  const pending = [...nodes];
  const titleSet = new Set(nodes.map((n) => n.title));
  let guard = 0;
  while (pending.length && guard++ < nodes.length + 5) {
    let progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const n = pending[i]!;
      if (n.parentTitle && !titleSet.has(n.parentTitle)) {
        continue;
      }
      if (
        n.parentTitle &&
        !out.some((o) => o.title === n.parentTitle)
      ) {
        continue;
      }
      out.push(n);
      pending.splice(i, 1);
      progressed = true;
    }
    if (!progressed) {
      out.push(...pending);
      break;
    }
  }
  return out;
}

/**
 * 将 template.imported 中的 organization / agents 物化到 API（幂等键由 Listener 保证 event 级）。
 */
@Injectable()
export class TemplateMaterializationService {
  private readonly logger = new Logger(TemplateMaterializationService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  async materializeFromTemplateImported(event: TemplateImportedEvent): Promise<void> {
    const { companyId, content } = event.data;
    const actor = this.actor();
    const titleToId = new Map<string, string>();

    const rawNodes = content.organization?.nodes ?? [];
    const sorted = sortNodesByDependency(rawNodes);

    for (const n of sorted) {
      try {
        const parentId = n.parentTitle ? titleToId.get(n.parentTitle) : undefined;
        if (n.parentTitle && !parentId) {
          this.logger.warn('template node skipped: parent not resolved', {
            title: n.title,
            parentTitle: n.parentTitle,
          });
          continue;
        }
        const created = await this.rpc<{ id: string }>('organization.node.create', {
          companyId,
          actor,
          data: {
            type: mapNodeKind(n.kind),
            name: n.title,
            parentId,
          },
        });
        titleToId.set(n.title, created.id);
      } catch (e: unknown) {
        this.logger.warn('organization.node.create failed', {
          title: n.title,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const nodeIds = [...titleToId.values()];
    const fallbackNodeId = nodeIds[0];
    if (!fallbackNodeId) {
      this.logger.warn('template materialize: no organization nodes created', { companyId });
    }

    const agents = content.agents ?? [];
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]!;
      const nodeId =
        nodeIds.length > 0 ? nodeIds[i % nodeIds.length]! : fallbackNodeId;
      if (!nodeId) {
        this.logger.warn('template agent skipped: no target node', { name: a.name });
        continue;
      }
      try {
        await this.rpc('agents.create', {
          companyId,
          actor,
          data: {
            organizationNodeId: nodeId,
            name: a.name,
            role: mapAgentRole(a.role),
            expertise: a.expertise,
            systemPrompt: a.systemPrompt,
            llmModel: a.llmModel,
          },
        });
      } catch (e: unknown) {
        this.logger.warn('agents.create failed', {
          name: a.name,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    this.logger.log('template materialize completed', {
      companyId,
      nodesCreated: titleToId.size,
      agentsRequested: agents.length,
    });
  }
}
