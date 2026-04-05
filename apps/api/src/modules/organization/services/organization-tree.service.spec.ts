import { OrganizationTreeService } from './organization-tree.service.js';

describe('OrganizationTreeService', () => {
  it('should build nested tree from flat nodes', () => {
    const service = new OrganizationTreeService();
    const nodes: any[] = [
      {
        id: 'board',
        parentId: null,
        type: 'board',
        name: 'Board',
        description: null,
        agentId: null,
        order: 0,
        metadata: null,
      },
      {
        id: 'ceo',
        parentId: 'board',
        type: 'ceo',
        name: 'CEO',
        description: null,
        agentId: null,
        order: 0,
        metadata: null,
      },
      {
        id: 'eng',
        parentId: 'ceo',
        type: 'department',
        name: 'Engineering',
        description: null,
        agentId: null,
        order: 0,
        metadata: null,
      },
    ];

    const tree = service.buildTree(nodes as any);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('board');
    expect(tree[0].children[0].id).toBe('ceo');
    expect(tree[0].children[0].children[0].id).toBe('eng');
  });
});
