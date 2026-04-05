import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  App,
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  BookOutlined,
  CloudUploadOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useCompany } from '../../contexts/CompanyContext';
import { getOrganizationTree, type OrganizationTreeNode } from '../../services/organizationApi';
import { listAgents } from '../../services/agentsApi';
import {
  searchMemory,
  ingestDocumentAsync,
  type MemorySearchBody,
  type MemorySearchHit,
} from '../../services/memoryApi';
import { uploadFile, listFiles, type FileInfo } from '../../services/filesApi';
import { ApiError } from '../../services/apiClient';

const { Text, Paragraph } = Typography;

const SCOPE_TABS = [
  { key: 'company' as const, label: '公司级' },
  { key: 'dept' as const, label: '部门级' },
  { key: 'agent' as const, label: 'Agent 级' },
  { key: 'docs' as const, label: '文档库' },
];

/** Default semantic probe when the search box is empty */
const DEFAULT_PROBE = '知识 决策 会议 摘要 战略 用户 产品';

type ScopeKey = (typeof SCOPE_TABS)[number]['key'];

function flattenOrg(nodes: OrganizationTreeNode[]): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const walk = (n: OrganizationTreeNode, prefix: string) => {
    const label = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ id: n.id, label });
    (n.children ?? []).forEach((c) => walk(c, label));
  };
  nodes.forEach((n) => walk(n, ''));
  return out;
}

function sourceTypeLabel(t: string): string {
  const m: Record<string, string> = {
    chat: '对话',
    task: '任务',
    skill: '技能',
    document: '文档',
    summary: '摘要',
    manual: '手动',
  };
  return m[t] ?? t;
}

function namespaceLabel(ns: string): string {
  if (ns === 'company') return '公司';
  if (ns.startsWith('dept:')) return `部门`;
  if (ns.startsWith('agent:')) return 'Agent';
  if (ns.startsWith('session:')) return '会话';
  return ns;
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

function pathFromHit(hit: MemorySearchHit): string | null {
  const m = hit.metadata;
  if (m && typeof m.path === 'string') return m.path;
  return null;
}

function buildSearchPayload(
  scope: ScopeKey,
  rawQuery: string,
  deptId: string | null,
  agentId: string | null,
): MemorySearchBody {
  const query = rawQuery.trim() || DEFAULT_PROBE;
  const base: MemorySearchBody =
    scope === 'docs'
      ? { query, topK: 28, namespaces: ['company'], sourceTypes: ['document'] }
      : { query, topK: 18 };

  if (scope === 'company') {
    return { ...base, namespaces: ['company'] };
  }
  if (scope === 'dept') {
    if (deptId) {
      return { ...base, organizationNodeId: deptId };
    }
    return { ...base, namespaces: ['company'] };
  }
  if (scope === 'agent') {
    if (agentId) {
      return { ...base, agentId };
    }
    return { ...base, namespaces: ['company'] };
  }
  return base;
}

export const MemoryPage: React.FC = () => {
  const { message } = App.useApp();
  const { companyId, isLoading: companiesLoading } = useCompany();
  const tenantReady = Boolean(companyId) && !companiesLoading;

  const [scope, setScope] = useState<ScopeKey>('company');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [deptId, setDeptId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  const [ragOpen, setRagOpen] = useState(false);
  const [ragQuestion, setRagQuestion] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragHits, setRagHits] = useState<MemorySearchHit[]>([]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFileState, setUploadFileState] = useState<File | null>(null);
  const [uploadNs, setUploadNs] = useState('company');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchInput), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const orgQ = useQuery({
    queryKey: ['organization', 'tree', companyId],
    queryFn: getOrganizationTree,
    enabled: tenantReady,
  });

  const agentsQ = useQuery({
    queryKey: ['agents', 'memory-page', companyId],
    queryFn: () => listAgents({ page: 1, pageSize: 80 }),
    enabled: tenantReady,
  });

  const orgOptions = useMemo(() => flattenOrg(orgQ.data ?? []), [orgQ.data]);

  const agents = agentsQ.data?.items ?? [];

  const searchPayload = useMemo(
    () => ({ data: buildSearchPayload(scope, debouncedQuery, deptId, agentId) }),
    [scope, debouncedQuery, deptId, agentId],
  );

  const scopeNeedsDept = scope === 'dept' && !deptId;
  const scopeNeedsAgent = scope === 'agent' && !agentId;

  const memoryQ = useQuery({
    queryKey: ['memory', 'search', companyId, scope, debouncedQuery, deptId, agentId],
    queryFn: () => searchMemory(searchPayload),
    enabled: tenantReady && !scopeNeedsDept && !scopeNeedsAgent,
  });

  const filePrefix = companyId ? `memory/${companyId}/` : undefined;
  const filesQ = useQuery({
    queryKey: ['files', 'memory-sidebar', companyId, filePrefix],
    queryFn: () =>
      listFiles({
        prefix: filePrefix,
        maxKeys: 40,
        recursive: true,
      }),
    enabled: tenantReady && Boolean(filePrefix),
  });

  const documentPaths = useMemo(() => {
    const hits = memoryQ.data ?? [];
    const paths = new Set<string>();
    for (const h of hits) {
      const p = pathFromHit(h);
      if (p) paths.add(p);
    }
    return [...paths];
  }, [memoryQ.data]);

  const runRagTest = useCallback(async () => {
    const q = ragQuestion.trim();
    if (q.length < 1) {
      message.warning('请输入要向知识库提出的问题');
      return;
    }
    setRagLoading(true);
    setRagHits([]);
    try {
      const data = await searchMemory({
        data: buildSearchPayload(scope, q, deptId, agentId),
      });
      setRagHits(data);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : '检索失败');
    } finally {
      setRagLoading(false);
    }
  }, [ragQuestion, scope, deptId, agentId, message]);

  const onUpload = useCallback(async () => {
    if (!uploadFileState || !companyId) {
      message.warning('请选择文件');
      return;
    }
    setUploadBusy(true);
    try {
      const safe = uploadFileState.name.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_');
      const storagePath = `memory/${companyId}/${Date.now()}-${safe}`;
      await uploadFile(uploadFileState, storagePath);
      const { correlationId } = await ingestDocumentAsync({
        data: {
          storagePath,
          namespace: uploadNs,
          collectionLabel: uploadLabel.trim() || undefined,
        },
      });
      message.success(`已提交异步索引（任务 ${correlationId.slice(0, 8)}…）`);
      setUploadOpen(false);
      setUploadFileState(null);
      setUploadLabel('');
      void filesQ.refetch();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : '上传或摄入失败');
    } finally {
      setUploadBusy(false);
    }
  }, [uploadFileState, companyId, uploadNs, uploadLabel, message, filesQ]);

  const errMsg =
    memoryQ.error instanceof ApiError
      ? memoryQ.error.message
      : memoryQ.error
        ? '加载失败'
        : null;

  return (
    <div className="content-area memory-page">
      <div className="page-header">
        <div>
          <div className="page-title">记忆与知识库</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            语义检索公司记忆与文档片段；上传文件后由后台异步切块写入向量库。
          </Text>
        </div>
        <div className="quick-actions">
          <Button icon={<CloudUploadOutlined />} onClick={() => setUploadOpen(true)}>
            上传文档
          </Button>
          <Button type="primary" icon={<ExperimentOutlined />} onClick={() => setRagOpen(true)}>
            RAG 测试
          </Button>
        </div>
      </div>

      {!tenantReady && (
        <Alert type="info" showIcon message="请选择公司后查看记忆与知识库。" style={{ marginBottom: 12 }} />
      )}

      <div className="memory-page__toolbar">
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
          placeholder="输入关键词或自然语言问题（留空则按默认主题探测）"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          disabled={!tenantReady}
        />
      </div>

      <div className="memory-page__filters">
        <div className="module-tabs" style={{ marginBottom: 0 }}>
          {SCOPE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`module-chip${scope === t.key ? ' active' : ''}`}
              onClick={() => setScope(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {scope === 'dept' && (
          <Select
            showSearch
            placeholder="选择部门节点"
            style={{ minWidth: 220 }}
            options={orgOptions.map((o) => ({ value: o.id, label: o.label }))}
            value={deptId ?? undefined}
            onChange={(v) => setDeptId(v)}
            loading={orgQ.isLoading}
            disabled={!tenantReady}
            optionFilterProp="label"
          />
        )}
        {scope === 'agent' && (
          <Select
            showSearch
            placeholder="选择 Agent"
            style={{ minWidth: 220 }}
            options={agents.map((a) => ({
              value: a.id,
              label: a.name ?? a.id,
            }))}
            value={agentId ?? undefined}
            onChange={(v) => setAgentId(v)}
            loading={agentsQ.isLoading}
            disabled={!tenantReady}
            optionFilterProp="label"
          />
        )}
      </div>

      {(scopeNeedsDept || scopeNeedsAgent) && (
        <Alert
          style={{ marginTop: 10 }}
          type="warning"
          showIcon
          message={scopeNeedsDept ? '请选择组织部门后再检索该范围。' : '请选择 Agent 后再检索该范围。'}
        />
      )}

      {errMsg && (
        <Alert style={{ marginTop: 10 }} type="error" showIcon message={errMsg} />
      )}

      <div className="memory-page__grid">
        <section className="panel memory-page__main">
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOutlined />
            检索结果
            {memoryQ.isFetching && <Spin size="small" />}
          </div>
          {memoryQ.isLoading ? (
            <div className="memory-page__loading">
              <Spin />
            </div>
          ) : !tenantReady || scopeNeedsDept || scopeNeedsAgent ? (
            <Empty description="等待范围选择" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (memoryQ.data?.length ?? 0) === 0 ? (
            <Empty description="暂无匹配记忆，可尝试更换关键词或上传文档。" />
          ) : (
            <ul className="memory-hit-list">
              {(memoryQ.data ?? []).map((hit) => (
                <li key={hit.id} className="memory-hit-card">
                  <div className="memory-hit-card__meta">
                    <Tag color="blue">{sourceTypeLabel(hit.sourceType)}</Tag>
                    <Tag>{namespaceLabel(hit.namespace)}</Tag>
                    <Text type="secondary" className="memory-hit-card__score">
                      相关度 {(Math.max(0, hit.score) * 100).toFixed(1)}%
                    </Text>
                  </div>
                  <Paragraph className="memory-hit-card__body">
                    {hit.redacted ? (
                      <Text type="warning">{hit.content}</Text>
                    ) : (
                      truncate(hit.content, 420)
                    )}
                  </Paragraph>
                  {pathFromHit(hit) && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      <FileTextOutlined /> {pathFromHit(hit)}
                    </Text>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel memory-page__side">
          <div className="panel-title">文档与存储</div>
          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
            展示已上传到当前租户前缀下的对象，以及检索命中的文档路径（去重）。
          </Paragraph>

          <div className="memory-side-block">
            <Text strong style={{ fontSize: 12 }}>
              已上传（{filePrefix ?? '—'}）
            </Text>
            {filesQ.isLoading ? (
              <Spin size="small" style={{ marginTop: 8 }} />
            ) : (filesQ.data?.items?.length ?? 0) === 0 ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                暂无文件，使用「上传文档」添加。
              </Text>
            ) : (
              <ul className="memory-file-list">
                {(filesQ.data?.items ?? []).map((f: FileInfo) => (
                  <li key={f.path}>
                    <span className="memory-file-list__name">{f.name || f.path}</span>
                    <span className="memory-file-list__size">
                      {f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} KB`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="memory-side-block" style={{ marginTop: 16 }}>
            <Text strong style={{ fontSize: 12 }}>
              命中的文档路径
            </Text>
            {documentPaths.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                当前检索无文档类命中，或文档尚未切块入库。
              </Text>
            ) : (
              <ul className="memory-path-list">
                {documentPaths.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <Modal
        title="RAG 测试"
        open={ragOpen}
        onCancel={() => setRagOpen(false)}
        width={640}
        footer={[
          <Button key="close" onClick={() => setRagOpen(false)}>
            关闭
          </Button>,
          <Button key="run" type="primary" loading={ragLoading} onClick={() => void runRagTest()}>
            检索
          </Button>,
        ]}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            使用与当前范围（{SCOPE_TABS.find((s) => s.key === scope)?.label}）相同的权限与命名空间过滤，返回向量检索 Top 结果。
          </Paragraph>
          <Input.TextArea
            rows={3}
            placeholder="例如：本季度战略重点是什么？竞品定价策略？"
            value={ragQuestion}
            onChange={(e) => setRagQuestion(e.target.value)}
          />
          {ragHits.length > 0 && (
            <div className="memory-rag-results">
              {ragHits.map((h) => (
                <div key={h.id} className="memory-hit-card memory-hit-card--compact">
                  <div className="memory-hit-card__meta">
                    <Tag>{sourceTypeLabel(h.sourceType)}</Tag>
                    <Text type="secondary">{(Math.max(0, h.score) * 100).toFixed(1)}%</Text>
                  </div>
                  <Paragraph style={{ marginBottom: 0, fontSize: 13 }}>
                    {h.redacted ? h.content : truncate(h.content, 360)}
                  </Paragraph>
                </div>
              ))}
            </div>
          )}
        </Space>
      </Modal>

      <Modal
        title="上传文档"
        open={uploadOpen}
        onCancel={() => !uploadBusy && setUploadOpen(false)}
        onOk={() => void onUpload()}
        confirmLoading={uploadBusy}
        okText="上传并入库"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message="文件将保存到对象存储，并异步切块、向量化写入记忆库（大文件请耐心等待 Worker 处理）。"
          />
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.json"
            onChange={(e) => setUploadFileState(e.target.files?.[0] ?? null)}
          />
          {uploadFileState && (
            <Text type="secondary">
              已选：{uploadFileState.name}（{(uploadFileState.size / 1024).toFixed(1)} KB）
            </Text>
          )}
          <div>
            <Text strong>命名空间</Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              value={uploadNs}
              onChange={setUploadNs}
              options={[
                { value: 'company', label: 'company（全公司可见）' },
                ...orgOptions.map((o) => ({
                  value: `dept:${o.id}`,
                  label: `部门：${o.label}`,
                })),
              ]}
            />
          </div>
          <div>
            <Text strong>集合标签（可选）</Text>
            <Input
              style={{ marginTop: 6 }}
              placeholder="如：销售资料 / 法务合同"
              value={uploadLabel}
              onChange={(e) => setUploadLabel(e.target.value)}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};
