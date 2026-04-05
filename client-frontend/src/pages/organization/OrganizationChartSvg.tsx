import React from 'react';
import type { OrganizationTreeNode } from '../../services/organizationApi';
import {
  NODE_H,
  NODE_W,
  buildTreeLayout,
  typeStyle,
  typeLabel,
} from './organizationLayout';

const MARKER_ID = 'org-chart-arrow';

export interface OrganizationChartSvgProps {
  roots: OrganizationTreeNode[];
  selectedId: string | null;
  onSelect: (node: OrganizationTreeNode) => void;
}

export const OrganizationChartSvg: React.FC<OrganizationChartSvgProps> = ({
  roots,
  selectedId,
  onSelect,
}) => {
  const layout = React.useMemo(() => buildTreeLayout(roots, 400), [roots]);
  const { bounds, nodes, edges } = layout;
  const w = Math.max(320, bounds.maxX - bounds.minX);
  const h = Math.max(280, bounds.maxY - bounds.minY);

  return (
    <div className="org-chart-wrap">
      <svg
        width="100%"
        height={h}
        viewBox={`${bounds.minX} ${bounds.minY} ${w} ${h}`}
        preserveAspectRatio="xMidYMin meet"
        style={{ display: 'block', minWidth: w }}
      >
        <defs>
          <marker id={MARKER_ID} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="var(--color-text-tertiary)" opacity="0.45" />
          </marker>
        </defs>
        {edges.map((e, i) => (
          <line
            key={`e-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="var(--color-border-secondary)"
            strokeWidth={1}
            markerEnd={`url(#${MARKER_ID})`}
          />
        ))}
        {nodes.map(({ node, cx, y }) => {
          const st = typeStyle(node.type);
          const left = cx - NODE_W / 2;
          const selected = selectedId === node.id;
          const name = node.name.length > 14 ? `${node.name.slice(0, 13)}…` : node.name;
          return (
            <g key={node.id}>
              <rect
                x={left}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={st.fill}
                stroke={selected ? '#6366F1' : st.stroke}
                strokeWidth={selected ? 2 : 1}
                cursor="pointer"
                onClick={() => onSelect(node)}
              />
              <text
                x={cx}
                y={y + 20}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={st.title}
                pointerEvents="none"
              >
                {name}
              </text>
              <text x={cx} y={y + 36} textAnchor="middle" fontSize={10} fill={st.sub} pointerEvents="none">
                {typeLabel(node.type)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
