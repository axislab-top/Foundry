import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  tasksApi,
  type BoardRunSummary,
  type ExecutionLogGroup,
  type TaskDependencyEdge,
  type TaskRunItem,
  ApiError,
} from '../../services/tasksApi';

const statusColor: Record<string, string> = {
  pending: '#94a3b8',
  in_progress: '#3b82f6',
  review: '#a855f7',
  awaiting_approval: '#f59e0b',
  completed: '#22c55e',
  blocked: '#ef4444',
  cancelled: '#64748b',
};

function applyNodeSelection(nodes: Node[], selectedId: string | null): Node[] {
  return nodes.map((n) => ({
    ...n,
    style: {
      ...n.style,
      boxShadow:
        selectedId && n.id === selectedId ? '0 0 0 3px rgba(59, 130, 246, 0.45)' : undefined,
    },
  }));
}

function buildFlowFromTree(
  nodes: Array<Record<string, unknown>>,
  depEdges: TaskDependencyEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = nodes.map((n, i) => {
    const id = String(n.id);
    const status = String(n.status ?? 'pending');
    const title = String(n.title ?? id).slice(0, 48);
    return {
      id,
      position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 100 },
      data: { label: `${title}\n[${status}]` },
      style: {
        border: `2px solid ${statusColor[status] ?? '#64748b'}`,
        borderRadius: 8,
        padding: 8,
        fontSize: 11,
        maxWidth: 200,
        background: '#fff',
      },
    };
  });
  const idSet = new Set(rfNodes.map((n) => n.id));
  const rfEdges: Edge[] = [];
  for (const n of nodes) {
    const pid = n.parentId as string | null | undefined;
    if (pid) {
      rfEdges.push({
        id: `p-${pid}-${String(n.id)}`,
        source: pid,
        target: String(n.id),
      });
    }
  }
  for (const e of depEdges) {
    if (idSet.has(e.taskId) && idSet.has(e.dependsOnTaskId)) {
      rfEdges.push({
        id: `dep-${e.dependsOnTaskId}-${e.taskId}`,
        source: e.dependsOnTaskId,
        target: e.taskId,
        style: { stroke: '#d97706', strokeDasharray: '6 3' },
        label: '依赖',
        labelStyle: { fontSize: 9, fill: '#b45309' },
      });
    }
  }
  return { nodes: rfNodes, edges: rfEdges };
}

const TaskTreeInner: React.FC<{
  companyId: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}> = ({ companyId, selectedTaskId, onSelectTask }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const baseNodesRef = useRef<Node[]>([]);
  const selectedRef = useRef<string | null>(selectedTaskId);
  selectedRef.current = selectedTaskId;

  const loadTree = useCallback(async () => {
    try {
      const [roots, depsRes] = await Promise.all([
        tasksApi.listRootTasks(companyId),
        tasksApi.fetchTaskDependencies(companyId).catch(() => ({ edges: [] as TaskDependencyEdge[] })),
      ]);
      const firstRoot = roots.items[0];
      if (firstRoot) {
        const tree = await tasksApi.getTaskTree(companyId, firstRoot.id);
        const flow = buildFlowFromTree(
          tree.nodes as Array<Record<string, unknown>>,
          depsRes.edges,
        );
        baseNodesRef.current = flow.nodes;
        setNodes(applyNodeSelection(flow.nodes, selectedRef.current));
        setEdges(flow.edges);
      } else {
        baseNodesRef.current = [];
        setNodes([]);
        setEdges([]);
      }
    } catch {
      baseNodesRef.current = [];
      setNodes([]);
      setEdges([]);
    }
  }, [companyId, setEdges, setNodes]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    setNodes(applyNodeSelection(baseNodesRef.current, selectedTaskId));
  }, [selectedTaskId, setNodes]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      onSelectTask(node.id);
    },
    [onSelectTask],
  );

  if (nodes.length === 0) {
    return (
      <div className="dash-muted" style={{ padding: 24 }}>
        暂无根任务。创建任务后将在此展示树形编排与 DAG 依赖边（橙色虚线）。
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      fitView
    >
      <Background />
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
};

function LogGroupsPanel({ groups }: { groups: ExecutionLogGroup[] }) {
  if (!groups.length) {
    return <div className="dash-muted" style={{ fontSize: 12 }}>该任务暂无执行日志。</div>;
  }
  return (
    <div style={{ maxHeight: 220, overflow: 'auto' }}>
      {groups.map((g) => (
        <div key={g.runId ?? 'norun'} style={{ marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
          <div style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
            run: {g.runId ? `${g.runId.slice(0, 8)}…` : '（未绑定 run）'}
          </div>
          <div className="dash-muted" style={{ fontSize: 10 }}>
            {g.items.length} 条 · 最近 {new Date(g.latestAt).toLocaleString()}
          </div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11 }}>
            {g.items.slice(-8).map((it) => (
              <li key={it.id}>
                <strong>{it.stepType}</strong>
                {it.message ? `: ${it.message.slice(0, 80)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export const BoardRoomTab: React.FC<{ companyId: string }> = ({ companyId }) => {
  const [board, setBoard] = useState<BoardRunSummary | null>(null);
  const [runs, setRuns] = useState<TaskRunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<TaskRunItem | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [logGroups, setLogGroups] = useState<ExecutionLogGroup[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    setSelectedTaskId(null);
    setSelectedRun(null);
    setLogGroups([]);
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, r] = await Promise.all([
        tasksApi.fetchBoardRunSummary(companyId),
        tasksApi.fetchTaskRuns(companyId, 1, 40, selectedTaskId ?? undefined),
      ]);
      setBoard(b);
      setRuns(r.items);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedTaskId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 25_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!selectedTaskId) {
      setLogGroups([]);
      return;
    }
    let cancelled = false;
    setLogsLoading(true);
    void tasksApi
      .fetchExecutionLogsGrouped(companyId, selectedTaskId, 200)
      .then((res) => {
        if (!cancelled) setLogGroups(res.groups);
      })
      .catch(() => {
        if (!cancelled) setLogGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, selectedTaskId]);

  const runList = useMemo(() => runs, [runs]);

  if (loading && !board) {
    return <div className="dash-muted">加载董事会视图…</div>;
  }
  if (error) {
    return <div className="error-box">{error}</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, minHeight: 480 }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--dash-border, #e2e8f0)' }}>
          <div className="section-title" style={{ margin: 0 }}>
            任务树与依赖（首个根任务）
          </div>
          <div className="dash-muted" style={{ fontSize: 12, marginTop: 4 }}>
            点击节点筛选相关 run；实线=父子，橙色虚线=依赖。每 25s 刷新运行摘要。
          </div>
        </div>
        <div style={{ height: 420 }}>
          <ReactFlowProvider>
            <TaskTreeInner
              companyId={companyId}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          </ReactFlowProvider>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card">
          <h3 className="section-title">运行记录</h3>
          {selectedTaskId ? (
            <div className="dash-muted" style={{ fontSize: 11, marginBottom: 8 }}>
              已选任务，仅显示与该任务有关联 run 的记录
            </div>
          ) : null}
          {board ? (
            <div className="dash-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              进行中 run: <strong>{board.runningCount}</strong> · 24h 失败:{' '}
              <strong>{board.failedLast24h}</strong>
            </div>
          ) : null}
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {runList.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRun(run)}
                className="btn btn-small"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 8,
                  border:
                    selectedRun?.id === run.id ? '2px solid var(--dash-blue, #3b82f6)' : undefined,
                }}
              >
                <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{run.id.slice(0, 8)}…</div>
                <div style={{ fontSize: 12 }}>
                  {run.status} · {run.triggerSource}
                </div>
                <div className="dash-muted" style={{ fontSize: 11 }}>
                  {new Date(run.startedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
          {selectedRun?.errorSummary ? (
            <div className="error-box" style={{ marginTop: 12, fontSize: 12 }}>
              {selectedRun.errorSummary}
            </div>
          ) : null}
        </div>

        <div className="card" style={{ flex: 1, minHeight: 200 }}>
          <h3 className="section-title">执行轨迹（按 run）</h3>
          {!selectedTaskId ? (
            <div className="dash-muted" style={{ fontSize: 12 }}>
              在左侧图中点击任务节点，查看该任务日志按 runId 分组。
            </div>
          ) : logsLoading ? (
            <div className="dash-muted" style={{ fontSize: 12 }}>加载日志…</div>
          ) : (
            <LogGroupsPanel groups={logGroups} />
          )}
        </div>
      </div>
    </div>
  );
};
