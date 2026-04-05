import type { Edge, Node } from '@xyflow/react';
import { Position } from '@xyflow/react';

export function buildOrgMiniFlow(departments: string[]): { nodes: Node[]; edges: Edge[] } {
  const cap = Math.min(Math.max(departments.length, 1), 8);
  const slice = departments.slice(0, cap);
  const colW = 160;
  const nodes: Node[] = [
    {
      id: 'board',
      position: { x: 120, y: 0 },
      data: { label: 'Board 董事会' },
      sourcePosition: Position.Bottom,
      type: 'mini',
    },
    {
      id: 'ceo',
      position: { x: 120, y: 88 },
      data: { label: 'CEO' },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      type: 'mini',
    },
  ];

  slice.forEach((name, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    nodes.push({
      id: `dept-${i}`,
      position: { x: col * colW - 40, y: 200 + row * 88 },
      data: { label: name.length > 14 ? `${name.slice(0, 13)}…` : name },
      targetPosition: Position.Top,
      type: 'mini',
    });
  });

  const edges: Edge[] = [
    { id: 'e-board-ceo', source: 'board', target: 'ceo' },
    ...slice.map((_, i) => ({
      id: `e-ceo-${i}`,
      source: 'ceo',
      target: `dept-${i}`,
    })),
  ];

  return { nodes, edges };
}
