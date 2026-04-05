import { OrganizationInitializerService } from './services/organization-initializer.service.js';
import { OrganizationService } from './services/organization.service.js';
import { OrganizationTreeService } from './services/organization-tree.service.js';

type NodeRecord = {
  id: string;
  companyId: string;
  parentId: string | null;
  type: 'board' | 'ceo' | 'department' | 'agent';
  name: string;
  description: string | null;
  agentId: string | null;
  order: number;
  metadata: Record<string, any> | null;
};

describe('OrganizationModule full acceptance flow', () => {
  const companyId = '00000000-0000-0000-0000-00000000c001';
  const ownerId = '00000000-0000-0000-0000-00000000u001';

  const createHarness = () => {
    const nodes: NodeRecord[] = [];
    const audits: any[] = [];
    const cache = new Map<string, any>();
    let seq = 1;
    const nextId = () => `node-${seq++}`;

    const tenantContext: any = {
      company: companyId,
      getCompanyId() {
        return this.company;
      },
    };

    const nodesRepo: any = {
      count: jest.fn(async ({ where }: any) =>
        nodes.filter((n) => {
          if (where.parentId === undefined) return n.companyId === where.companyId;
          return n.companyId === where.companyId && n.parentId === where.parentId;
        }).length,
      ),
      create: jest.fn((payload: any) => ({
        id: payload.id || nextId(),
        ...payload,
      })),
      save: jest.fn(async (payload: any) => {
        const saveOne = (p: any) => {
          const idx = nodes.findIndex((n) => n.id === p.id);
          const normalized = {
            id: p.id || nextId(),
            companyId: p.companyId,
            parentId: p.parentId ?? null,
            type: p.type,
            name: p.name,
            description: p.description ?? null,
            agentId: p.agentId ?? null,
            order: p.order ?? 0,
            metadata: p.metadata ?? null,
          };
          if (idx >= 0) nodes[idx] = normalized;
          else nodes.push(normalized);
          return normalized;
        };

        if (Array.isArray(payload)) {
          return Promise.all(payload.map((p) => saveOne(p)));
        }
        return saveOne(payload);
      }),
      findOne: jest.fn(async ({ where }: any) =>
        nodes.find((n) => n.id === where.id && n.companyId === where.companyId) || null,
      ),
      remove: jest.fn(async (payload: any) => {
        const idx = nodes.findIndex((n) => n.id === payload.id);
        if (idx >= 0) nodes.splice(idx, 1);
      }),
      createQueryBuilder: jest.fn(() => {
        let whereCompany = companyId;
        let search = '';
        let type: string | undefined;
        return {
          where(_sql: string, params: any) {
            whereCompany = params.companyId;
            return this;
          },
          orderBy() {
            return this;
          },
          andWhere(sql: string, params: any) {
            if (sql.includes('name ILIKE')) search = (params.search || '').replace(/%/g, '');
            if (sql.includes('node.type')) type = params.type;
            return this;
          },
          async getMany() {
            return nodes
              .filter((n) => n.companyId === whereCompany)
              .filter((n) => (!search ? true : n.name.toLowerCase().includes(search.toLowerCase())))
              .filter((n) => (!type ? true : n.type === type))
              .sort((a, b) => a.order - b.order);
          },
        };
      }),
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('WITH RECURSIVE subtree')) {
          const [startId, cid] = params;
          const found = new Set<string>();
          const stack = [startId];
          while (stack.length) {
            const cur = stack.pop()!;
            if (found.has(cur)) continue;
            found.add(cur);
            for (const child of nodes.filter((n) => n.companyId === cid && n.parentId === cur)) {
              stack.push(child.id);
            }
          }
          return nodes
            .filter((n) => n.companyId === cid && found.has(n.id) && !!n.agentId)
            .sort((a, b) => a.order - b.order);
        }
        if (sql.includes('WITH RECURSIVE chain')) {
          const [startId, cid] = params;
          const result: NodeRecord[] = [];
          let cursor = nodes.find((n) => n.id === startId && n.companyId === cid) || null;
          while (cursor) {
            result.push(cursor);
            cursor = cursor.parentId
              ? nodes.find((n) => n.id === cursor!.parentId && n.companyId === cid) || null
              : null;
          }
          return result.map((n) => ({
            ...n,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        }
        return [];
      }),
    };

    const auditRepo: any = {
      create: jest.fn((payload: any) => payload),
      save: jest.fn(async (payload: any) => {
        audits.push(payload);
        return payload;
      }),
      createQueryBuilder: jest.fn(() => {
        let cid = companyId;
        let nodeId: string | undefined;
        let action: string | undefined;
        let skip = 0;
        let take = 20;
        return {
          where(_sql: string, params: any) {
            cid = params.companyId;
            return this;
          },
          andWhere(sql: string, params: any) {
            if (sql.includes('node_id')) nodeId = params.nodeId;
            if (sql.includes('action')) action = params.action;
            return this;
          },
          orderBy() {
            return this;
          },
          skip(v: number) {
            skip = v;
            return this;
          },
          take(v: number) {
            take = v;
            return this;
          },
          async getManyAndCount() {
            const filtered = audits
              .filter((a) => a.companyId === cid)
              .filter((a) => (!nodeId ? true : a.nodeId === nodeId))
              .filter((a) => (!action ? true : a.action === action));
            return [filtered.slice(skip, skip + take), filtered.length];
          },
        };
      }),
    };

    const membershipsRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.companyId === companyId && where.userId === ownerId) {
          return { role: 'owner', isActive: true };
        }
        return null;
      }),
    };

    const dataSource: any = {
      transaction: jest.fn(async (cb: any) =>
        cb({
          createQueryBuilder: (_entity: any, _alias: string) => ({
            setLock: () => ({
              where: (_sql: string, params: any) => ({
                getOne: async () =>
                  nodes.find((n) => n.id === params.id && n.companyId === params.companyId) || null,
              }),
            }),
          }),
          save: async (payload: any) => {
            if (payload?.action) {
              audits.push(payload);
              return payload;
            }
            const idx = nodes.findIndex((n) => n.id === payload.id);
            if (idx >= 0) nodes[idx] = payload;
            else nodes.push(payload);
            return payload;
          },
          getRepository: () => nodesRepo,
        }),
      ),
    };

    const cacheService: any = {
      get: jest.fn(async (key: string) => (cache.has(key) ? cache.get(key) : null)),
      set: jest.fn(async (key: string, value: any) => {
        cache.set(key, value);
        return true;
      }),
      exists: jest.fn(async (key: string) => cache.has(key)),
      increment: jest.fn(async (key: string, n: number) => {
        const current = Number(cache.get(key) || 0);
        const next = current + n;
        cache.set(key, next);
        return next;
      }),
      expire: jest.fn(async () => true),
    };

    const messagingService: any = {
      publish: jest.fn(async () => true),
    };

    const treeService = new OrganizationTreeService();
    const agentsBootstrap: any = {
      ensureDefaultAgentsForCompany: jest.fn(async () => undefined),
    };
    const initializer = new OrganizationInitializerService(nodesRepo, agentsBootstrap);
    const service = new OrganizationService(
      dataSource,
      nodesRepo,
      auditRepo,
      membershipsRepo,
      tenantContext,
      cacheService,
      messagingService,
      treeService,
    );

    return { service, initializer, messagingService };
  };

  it('should pass end-to-end acceptance flow', async () => {
    const { service, initializer, messagingService } = createHarness();

    await initializer.initializeForCompany(companyId, 'tech');
    const initialTree = await service.getTree({});
    expect(initialTree[0].type).toBe('board');
    expect(initialTree[0].children[0].type).toBe('ceo');

    const ceo = initialTree[0].children[0];
    const engineering = ceo.children.find((n) => n.name === 'Engineering');
    expect(engineering).toBeDefined();

    const research = await service.createNode(
      {
        type: 'department',
        name: 'Research',
        parentId: ceo.id,
      },
      { id: ownerId },
    );

    await service.moveNode(
      research.id,
      {
        newParentId: engineering!.id,
        newOrder: 1,
      },
      { id: ownerId },
    );

    const movedTree = await service.getTree({});
    const movedEngineering = movedTree[0].children[0].children.find((n) => n.id === engineering!.id)!;
    expect(movedEngineering.children.some((n) => n.id === research.id)).toBe(true);

    const auditLogs = await service.queryAuditLogs({ action: 'move', page: 1, pageSize: 20 });
    expect(auditLogs.total).toBeGreaterThan(0);
    expect(auditLogs.items[0]).toEqual(
      expect.objectContaining({
        action: 'move',
        nodeId: research.id,
      }),
    );

    const chain = await service.getReportingChain(research.id);
    expect(chain.map((x: any) => x.name)).toEqual(
      expect.arrayContaining(['Research', 'Engineering', 'CEO', 'Board']),
    );

    expect(messagingService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'organization.structure.changed' }),
      expect.objectContaining({ routingKey: 'organization.structure.changed' }),
    );
  });
});
