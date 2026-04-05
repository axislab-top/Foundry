import type { OrganizationTreeNode } from '../../services/organizationApi';

export const NODE_W = 128;
export const NODE_H = 48;
const H_GAP = 28;
const V_GAP = 76;

export interface NodePosition {
  node: OrganizationTreeNode;
  /** 节点中心 x */
  cx: number;
  /** 节点顶部 y */
  y: number;
}

export interface LayoutEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayoutResult {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  nodes: NodePosition[];
  edges: LayoutEdge[];
}

interface LayoutNode {
  node: OrganizationTreeNode;
  cx: number;
  y: number;
  children: LayoutNode[];
}

export function subtreeWidth(node: OrganizationTreeNode): number {
  const kids = node.children ?? [];
  if (kids.length === 0) {
    return NODE_W;
  }
  const parts = kids.map(subtreeWidth);
  const sum = parts.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP;
  return Math.max(NODE_W, sum);
}

function layoutTree(node: OrganizationTreeNode, centerX: number, topY: number): LayoutNode {
  const kids = node.children ?? [];
  if (kids.length === 0) {
    return { node, cx: centerX, y: topY, children: [] };
  }
  const widths = kids.map(subtreeWidth);
  const totalW = widths.reduce((a, b) => a + b, 0) + (kids.length - 1) * H_GAP;
  let left = centerX - totalW / 2;
  const children: LayoutNode[] = [];
  for (let i = 0; i < kids.length; i++) {
    const w = widths[i];
    const cx = left + w / 2;
    children.push(layoutTree(kids[i], cx, topY + NODE_H + V_GAP));
    left += w + H_GAP;
  }
  return { node, cx: centerX, y: topY, children };
}

function layoutForest(roots: OrganizationTreeNode[], originX: number, startY: number): LayoutNode[] {
  if (roots.length === 0) {
    return [];
  }
  if (roots.length === 1) {
    return [layoutTree(roots[0], originX, startY)];
  }
  const widths = roots.map(subtreeWidth);
  const totalW = widths.reduce((a, b) => a + b, 0) + (roots.length - 1) * H_GAP;
  let left = originX - totalW / 2;
  const out: LayoutNode[] = [];
  for (let i = 0; i < roots.length; i++) {
    const w = widths[i];
    const cx = left + w / 2;
    out.push(layoutTree(roots[i], cx, startY));
    left += w + H_GAP;
  }
  return out;
}

function flattenLayout(layout: LayoutNode, acc: NodePosition[]): void {
  acc.push({ node: layout.node, cx: layout.cx, y: layout.y });
  for (const c of layout.children) {
    flattenLayout(c, acc);
  }
}

function collectEdges(layout: LayoutNode, acc: LayoutEdge[]): void {
  const yBottom = layout.y + NODE_H;
  for (const c of layout.children) {
    acc.push({ x1: layout.cx, y1: yBottom, x2: c.cx, y2: c.y });
    collectEdges(c, acc);
  }
}

function boundsFromNodes(nodes: NodePosition[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const left = n.cx - NODE_W / 2;
    const right = n.cx + NODE_W / 2;
    const top = n.y;
    const bottom = n.y + NODE_H;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 700, minY: 0, maxY: 400 };
  }
  const pad = 32;
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
  };
}

/** 将接口树排版为 SVG 坐标与连线 */
export function buildTreeLayout(roots: OrganizationTreeNode[], centerX = 400): TreeLayoutResult {
  const layouts = layoutForest(roots, centerX, 24);
  const nodes: NodePosition[] = [];
  const edges: LayoutEdge[] = [];
  for (const l of layouts) {
    flattenLayout(l, nodes);
    collectEdges(l, edges);
  }
  const bounds = boundsFromNodes(nodes);
  return { bounds, nodes, edges };
}

export const NODE_TYPE_STYLE: Record<
  string,
  { fill: string; stroke: string; title: string; sub: string }
> = {
  board: { fill: '#EEF2FF', stroke: '#6366F1', title: '#4338CA', sub: '#6366F1' },
  ceo: { fill: '#E0F2FE', stroke: '#0EA5E9', title: '#0369A1', sub: '#0EA5E9' },
  department: { fill: '#F0FDF4', stroke: '#22C55E', title: '#166534', sub: '#22C55E' },
  agent: { fill: '#F9FAFB', stroke: '#9CA3AF', title: '#111827', sub: '#6B7280' },
};

export function typeStyle(type: string) {
  return NODE_TYPE_STYLE[type] ?? NODE_TYPE_STYLE.department;
}

export function typeLabel(type: string): string {
  const m: Record<string, string> = {
    board: '治理委员会',
    ceo: 'CEO',
    department: '部门',
    agent: '岗位/Agent',
  };
  return m[type] ?? type;
}
