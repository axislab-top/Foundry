import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../services/apiClient';
import { llmKeysApi, type LlmKeyInfo } from '../../services/llmKeysApi';
import { skillsApi, type SkillAdminListItem } from '../../services/skillsApi';
import {
  marketplaceApi,
  type MarketplaceAdminAgentDetail,
  type MarketplaceAdminListItem,
  type MarketplaceStatusFilter,
} from '../../services/marketplaceApi';

/** Admin marketplace 列表分页：每页条数（与网关 / API 约定一致） */
const MARKETPLACE_LIST_PAGE_SIZE = 20;

export const MarketplacePage: React.FC = () => {
  const [items, setItems] = useState<MarketplaceAdminListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(MARKETPLACE_LIST_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MarketplaceStatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    description: '',
    expertise: '',
    systemPrompt: '',
    boundModelName: '',
    recommendedSkills: [] as string[],
    skillTagsLine: '',
    pricingModel: 'free',
    priceCents: 0,
    isPublished: false,
  });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketplaceAdminAgentDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'llm'>('basic');
  const [dirty, setDirty] = useState(false);

  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [keyCandidates, setKeyCandidates] = useState<LlmKeyInfo[]>([]);
  const [keyCandidatesLoading, setKeyCandidatesLoading] = useState(false);
  const [keySelect, setKeySelect] = useState<Record<string, boolean>>({});

  const [skillsPickerOpen, setSkillsPickerOpen] = useState(false);
  const [skillCandidates, setSkillCandidates] = useState<SkillAdminListItem[]>([]);
  const [skillCandidatesLoading, setSkillCandidatesLoading] = useState(false);
  const [skillCandidatesError, setSkillCandidatesError] = useState<string | null>(null);
  const [skillQuery, setSkillQuery] = useState('');
  const [skillPick, setSkillPick] = useState<Record<string, boolean>>({});
  const [createSkillsPickerOpen, setCreateSkillsPickerOpen] = useState(false);
  const [createSkillQuery, setCreateSkillQuery] = useState('');
  const [createSkillPick, setCreateSkillPick] = useState<Record<string, boolean>>({});
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null);

  const listParams = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (search.trim()) p.search = search.trim();
    if (status !== 'all') p.status = status;
    return p;
  }, [page, pageSize, search, status]);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await marketplaceApi.list(listParams as any);
      setItems(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, status]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function openDetails(id: string) {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError(null);
    setActiveTab('basic');
    setDirty(false);
    void (async () => {
      try {
        const d = await marketplaceApi.findOne(id);
        setSelected(d);
      } catch (e: unknown) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
        setDetailsError(msg);
      } finally {
        setDetailsLoading(false);
      }
    })();
  }

  async function loadKeyCandidates(): Promise<void> {
    if (!selected?.boundModelName?.trim()) {
      setKeyCandidates([]);
      return;
    }
    setKeyCandidatesLoading(true);
    try {
      const res = await llmKeysApi.list({
        modelName: selected.boundModelName,
        page: 1,
        pageSize: 100,
      });
      setKeyCandidates(res.items);
    } catch {
      // candidates 失败不阻塞编辑
      setKeyCandidates([]);
    } finally {
      setKeyCandidatesLoading(false);
    }
  }

  async function loadSkillCandidates(query = skillQuery): Promise<void> {
    setSkillCandidatesLoading(true);
    setSkillCandidatesError(null);
    try {
      const res = await skillsApi.list({ page: 1, pageSize: 100, search: query.trim() || undefined });
      setSkillCandidates(res.items);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setSkillCandidatesError(msg);
      setSkillCandidates([]);
    } finally {
      setSkillCandidatesLoading(false);
    }
  }

  async function loadModelOptions(): Promise<void> {
    setModelOptionsLoading(true);
    setModelOptionsError(null);
    try {
      const res = await llmKeysApi.list({ isActive: true, page: 1, pageSize: 100 });
      const unique = Array.from(
        new Set(
          res.items
            .map((x) => x.modelName?.trim())
            .filter((x): x is string => !!x),
        ),
      ).sort((a, b) => a.localeCompare(b));
      setModelOptions(unique);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setModelOptionsError(msg);
      setModelOptions([]);
    } finally {
      setModelOptionsLoading(false);
    }
  }

  function reorderBinding(from: number, to: number) {
    if (!selected) return;
    const arr = [...selected.keyBindings];
    const [moved] = arr.splice(from, 1);
    if (!moved) return;
    arr.splice(to, 0, moved);
    const normalized = arr.map((b, idx) => ({ ...b, sortOrder: idx }));
    setSelected({ ...selected, keyBindings: normalized });
    setDirty(true);
  }

  async function save(): Promise<void> {
    if (!selected) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      await marketplaceApi.update(selected.id, {
        name: selected.name,
        description: selected.description,
        expertise: selected.expertise,
        systemPrompt: selected.systemPrompt,
        recommendedSkills: selected.recommendedSkills,
        skillTags: selected.skillTags ?? [],
        boundModelName: selected.boundModelName,
        pricingModel: selected.pricingModel,
        priceCents: selected.priceCents,
        isPublished: selected.isPublished,
        keyBindings: selected.keyBindings.map((k, idx) => ({ llmKeyId: k.llmKeyId, sortOrder: idx })),
      });
      setDirty(false);
      await refresh();
      const d = await marketplaceApi.findOne(selected.id);
      setSelected(d);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setDetailsError(msg);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function createAgent(): Promise<void> {
    if (!createForm.name.trim()) {
      setCreateError('Name is required');
      return;
    }
    if (!['free', 'one_time', 'subscription'].includes(createForm.pricingModel)) {
      setCreateError('Pricing Model must be free / one_time / subscription');
      return;
    }
    if (!Number.isFinite(createForm.priceCents) || createForm.priceCents < 0) {
      setCreateError('Price Cents must be a non-negative number');
      return;
    }

    const recommendedSkills = createForm.recommendedSkills;
    const skillTags = createForm.skillTagsLine
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setCreateLoading(true);
    setCreateError(null);
    try {
      const created = await marketplaceApi.create({
        name: createForm.name.trim(),
        slug: createForm.slug.trim() || undefined,
        description: createForm.description.trim() || null,
        expertise: createForm.expertise.trim() || null,
        systemPrompt: createForm.systemPrompt.trim() || null,
        boundModelName: createForm.boundModelName.trim() || null,
        recommendedSkills,
        skillTags,
        pricingModel: createForm.pricingModel,
        priceCents: Math.floor(createForm.priceCents),
        isPublished: createForm.isPublished,
      });
      setCreateOpen(false);
      setCreateForm({
        name: '',
        slug: '',
        description: '',
        expertise: '',
        systemPrompt: '',
        boundModelName: '',
        recommendedSkills: [],
        skillTagsLine: '',
        pricingModel: 'free',
        priceCents: 0,
        isPublished: false,
      });
      await refresh();
      openDetails(created.id);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Create failed';
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  }

  function removeBinding(llmKeyId: string) {
    if (!selected) return;
    const next = selected.keyBindings.filter((b) => b.llmKeyId !== llmKeyId);
    setSelected({ ...selected, keyBindings: next.map((b, i) => ({ ...b, sortOrder: i })) });
    setDirty(true);
  }

  return (
    <section>
      <h2>Marketplace</h2>
      <div className="page-subtitle">Agent 商品配置（绑定模型 + Key 池优先级 + 审核/上架状态）</div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
              void loadModelOptions();
            }}
          >
            + New Agent
          </button>
        </div>
        <div className="filters">
          <div className="field">
            <label>Search</label>
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="name / slug"
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as MarketplaceStatusFilter);
              }}
            >
              <option value="all">All</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Model</th>
                <th>Key Count</th>
                <th>Price</th>
                <th>Status</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6}>No items.</td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {it.slug}
                      </div>
                    </td>
                    <td>{it.boundModelName || '-'}</td>
                    <td>{it.keyCount}</td>
                    <td>
                      {it.pricingModel} / {(it.priceCents / 100).toFixed(2)}
                    </td>
                    <td>
                      {it.isPublished ? (
                        <span className="badge badge-green">Published</span>
                      ) : (
                        <span className="badge badge-gray">Draft</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-small" type="button" onClick={() => openDetails(it.id)}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </button>
          <div className="muted">
            Page {page} / {totalPages} · {MARKETPLACE_LIST_PAGE_SIZE} per page · Total {total}
          </div>
          <button className="btn" type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </button>
        </div>
      </div>

      {createOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Create Marketplace Agent"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <div className="modal modal-marketplace" style={{ width: 640, maxWidth: '95vw' }}>
            <div className="modal-header">
              <div className="modal-title">Create Marketplace Agent</div>
              <button className="modal-close" type="button" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {createError ? <div className="error-box">{createError}</div> : null}
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Name</label>
                  <input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Senior Financial Analyst" />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Slug (optional)</label>
                  <input value={createForm.slug} onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))} placeholder="e.g. senior-fin-analyst" />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    留空将根据 Name 自动生成并保证唯一。
                  </div>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Description</label>
                  <textarea value={createForm.description} rows={2} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Expertise</label>
                  <textarea value={createForm.expertise} rows={2} onChange={(e) => setCreateForm((f) => ({ ...f, expertise: e.target.value }))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Skill tags (comma-separated, for catalog search)</label>
                  <input
                    value={createForm.skillTagsLine}
                    onChange={(e) => setCreateForm((f) => ({ ...f, skillTagsLine: e.target.value }))}
                    placeholder="e.g. finance, compliance, reporting"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>System Prompt</label>
                  <textarea value={createForm.systemPrompt} rows={4} onChange={(e) => setCreateForm((f) => ({ ...f, systemPrompt: e.target.value }))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Bound Model Name (from LLM Keys)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={createForm.boundModelName}
                      onChange={(e) => setCreateForm((f) => ({ ...f, boundModelName: e.target.value }))}
                      disabled={modelOptionsLoading}
                    >
                      <option value="">Not set</option>
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-small"
                      type="button"
                      disabled={modelOptionsLoading}
                      onClick={() => void loadModelOptions()}
                    >
                      Refresh
                    </button>
                  </div>
                  {modelOptionsError ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      加载模型失败：{modelOptionsError}
                    </div>
                  ) : null}
                  {!modelOptionsLoading && modelOptions.length === 0 ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      暂无可选模型，请先到 LLM Keys 创建至少一个 Key。
                    </div>
                  ) : null}
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Recommended Skills (comma separated)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-small"
                      type="button"
                      onClick={() => {
                        setCreateSkillPick({});
                        setCreateSkillQuery('');
                        setCreateSkillsPickerOpen(true);
                        void loadSkillCandidates('');
                      }}
                    >
                      + Pick Skills
                    </button>
                    <span className="badge badge-gray">
                      Total: {createForm.recommendedSkills.length}
                    </span>
                    <button
                      className="btn btn-small btn-danger"
                      type="button"
                      disabled={!createForm.recommendedSkills.length}
                      onClick={() => setCreateForm((f) => ({ ...f, recommendedSkills: [] }))}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {createForm.recommendedSkills.length === 0 ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        No recommended skills.
                      </span>
                    ) : (
                      createForm.recommendedSkills.map((name) => (
                        <span key={name} className="badge badge-gray" style={{ display: 'inline-flex', gap: 8 }}>
                          <span>{name}</span>
                          <button
                            className="btn btn-small"
                            type="button"
                            style={{ padding: '0.1rem 0.35rem' }}
                            onClick={() =>
                              setCreateForm((f) => ({
                                ...f,
                                recommendedSkills: f.recommendedSkills.filter((x) => x !== name),
                              }))
                            }
                          >
                            ✕
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="field">
                  <label>Pricing Model</label>
                  <select value={createForm.pricingModel} onChange={(e) => setCreateForm((f) => ({ ...f, pricingModel: e.target.value }))}>
                    <option value="free">free</option>
                    <option value="one_time">one_time</option>
                    <option value="subscription">subscription</option>
                  </select>
                </div>
                <div className="field">
                  <label>Price Cents</label>
                  <input
                    value={createForm.priceCents}
                    onChange={(e) => {
                      const n = Number(e.target.value || 0);
                      setCreateForm((f) => ({ ...f, priceCents: Number.isFinite(n) ? n : 0 }));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={createForm.isPublished ? 'published' : 'draft'} onChange={(e) => setCreateForm((f) => ({ ...f, isPublished: e.target.value === 'published' }))}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" disabled={createLoading} onClick={() => void createAgent()}>
                {createLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailsOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Marketplace Agent"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailsOpen(false);
          }}
        >
          <div className="modal modal-marketplace" style={{ width: 920, maxWidth: '95vw' }}>
            <div className="modal-header">
              <div className="modal-title">Marketplace Agent</div>
              <button className="modal-close" type="button" onClick={() => setDetailsOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {detailsError ? <div className="error-box">{detailsError}</div> : null}
              {detailsLoading || !selected ? (
                <div>Loading...</div>
              ) : (
                <>
                  <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button className={`btn ${activeTab === 'basic' ? 'btn-primary' : ''}`} type="button" onClick={() => setActiveTab('basic')}>
                      基本信息
                    </button>
                    <button className={`btn ${activeTab === 'llm' ? 'btn-primary' : ''}`} type="button" onClick={() => setActiveTab('llm')}>
                      大模型配置
                    </button>
                    <div style={{ flex: 1 }} />
                    {dirty ? <span className="badge badge-gray">Unsaved</span> : null}
                  </div>

                  {activeTab === 'basic' ? (
                    <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="field">
                        <label>Name</label>
                        <input
                          value={selected.name}
                          onChange={(e) => {
                            setSelected({ ...selected, name: e.target.value });
                            setDirty(true);
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Slug</label>
                        <input value={selected.slug} readOnly />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label>Description</label>
                        <textarea
                          value={selected.description ?? ''}
                          onChange={(e) => {
                            setSelected({ ...selected, description: e.target.value });
                            setDirty(true);
                          }}
                          rows={3}
                        />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label>Skill tags (comma-separated, for catalog search)</label>
                        <input
                          value={(selected.skillTags ?? []).join(', ')}
                          onChange={(e) => {
                            const skillTags = e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            setSelected({ ...selected, skillTags });
                            setDirty(true);
                          }}
                          placeholder="e.g. finance, compliance"
                        />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label>System Prompt</label>
                        <textarea
                          value={selected.systemPrompt ?? ''}
                          onChange={(e) => {
                            setSelected({ ...selected, systemPrompt: e.target.value });
                            setDirty(true);
                          }}
                          rows={6}
                        />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label>Recommended Skills</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-small"
                            type="button"
                            onClick={() => {
                              setSkillPick({});
                              setSkillQuery('');
                              setSkillsPickerOpen(true);
                              void loadSkillCandidates();
                            }}
                          >
                            + Pick Skills
                          </button>
                          <span className="badge badge-gray">Total: {(selected.recommendedSkills ?? []).length}</span>
                          <button
                            className="btn btn-small btn-danger"
                            type="button"
                            disabled={!(selected.recommendedSkills ?? []).length}
                            onClick={() => {
                              setSelected({ ...selected, recommendedSkills: [] });
                              setDirty(true);
                            }}
                          >
                            Clear
                          </button>
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {(selected.recommendedSkills ?? []).length === 0 ? (
                            <span className="muted" style={{ fontSize: 12 }}>
                              No recommended skills.
                            </span>
                          ) : (
                            (selected.recommendedSkills ?? []).map((name) => (
                              <span key={name} className="badge badge-gray" style={{ display: 'inline-flex', gap: 8 }}>
                                <span>{name}</span>
                                <button
                                  className="btn btn-small"
                                  type="button"
                                  style={{ padding: '0.1rem 0.35rem' }}
                                  onClick={() => {
                                    const next = (selected.recommendedSkills ?? []).filter((x) => x !== name);
                                    setSelected({ ...selected, recommendedSkills: next });
                                    setDirty(true);
                                  }}
                                >
                                  ✕
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Worker 会按 Skill name 解析为全局 Skill 并绑定到新建 Agent。
                        </div>
                      </div>
                      <div className="field">
                        <label>Pricing Model</label>
                        <input
                          value={selected.pricingModel}
                          onChange={(e) => {
                            setSelected({ ...selected, pricingModel: e.target.value });
                            setDirty(true);
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Price Cents</label>
                        <input
                          value={selected.priceCents}
                          onChange={(e) => {
                            const n = Number(e.target.value || 0);
                            setSelected({ ...selected, priceCents: Number.isFinite(n) ? n : 0 });
                            setDirty(true);
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Published</label>
                        <select
                          value={selected.isPublished ? 'yes' : 'no'}
                          onChange={(e) => {
                            setSelected({ ...selected, isPublished: e.target.value === 'yes' });
                            setDirty(true);
                          }}
                        >
                          <option value="no">Draft</option>
                          <option value="yes">Published</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="field" style={{ maxWidth: 420 }}>
                        <label>选择模型（单选）</label>
                        <input
                          value={selected.boundModelName ?? ''}
                          onChange={(e) => {
                            setSelected({ ...selected, boundModelName: e.target.value });
                            setDirty(true);
                          }}
                          placeholder="e.g. gpt-4o"
                        />
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          当前实现为输入框（后续可改成下拉：从 Key 池模型集合自动生成）
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 }}>
                        <div style={{ fontWeight: 600 }}>绑定 Key 池</div>
                        <span className="badge badge-gray">Total: {selected.keyBindings.length}</span>
                        <div style={{ flex: 1 }} />
                        <button
                          className="btn btn-small"
                          type="button"
                          onClick={() => {
                            setKeySelect({});
                            setAddKeyOpen(true);
                            void loadKeyCandidates();
                          }}
                        >
                          + 添加 Key
                        </button>
                      </div>

                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th style={{ width: 60 }}>#</th>
                              <th>Alias</th>
                              <th>Status</th>
                              <th>Used Today</th>
                              <th>Remaining</th>
                              <th style={{ width: 260 }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.keyBindings.length === 0 ? (
                              <tr>
                                <td colSpan={6}>No keys bound.</td>
                              </tr>
                            ) : (
                              selected.keyBindings.map((b, idx) => (
                                <tr
                                  key={b.llmKeyId}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', String(idx));
                                  }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const from = Number(e.dataTransfer.getData('text/plain'));
                                    if (!Number.isFinite(from)) return;
                                    if (from === idx) return;
                                    reorderBinding(from, idx);
                                  }}
                                >
                                  <td>{idx + 1}</td>
                                  <td>{b.keyAlias || b.llmKeyId}</td>
                                  <td>
                                    {b.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}
                                  </td>
                                  <td>{b.usedTodayTokens ?? '-'}</td>
                                  <td>{b.remainingTokens ?? '-'}</td>
                                  <td>
                                    <div className="row-actions">
                                      <button className="btn btn-small" type="button" disabled={idx === 0} onClick={() => reorderBinding(idx, idx - 1)}>
                                        ↑
                                      </button>
                                      <button
                                        className="btn btn-small"
                                        type="button"
                                        disabled={idx === selected.keyBindings.length - 1}
                                        onClick={() => reorderBinding(idx, idx + 1)}
                                      >
                                        ↓
                                      </button>
                                      <button className="btn btn-small" type="button" onClick={() => removeBinding(b.llmKeyId)}>
                                        Remove
                                      </button>
                                      <span className="muted" style={{ fontSize: 12 }}>
                                        Drag row to reorder
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {addKeyOpen ? (
                        <div
                          className="modal-overlay"
                          role="dialog"
                          aria-modal="true"
                          aria-label="Add keys"
                          onMouseDown={(e) => {
                            if (e.target === e.currentTarget) setAddKeyOpen(false);
                          }}
                        >
                          <div className="modal modal-marketplace" style={{ width: 860, maxWidth: '95vw' }}>
                            <div className="modal-header">
                              <div className="modal-title">添加 Key（来自全局 Key 池）</div>
                              <button className="modal-close" type="button" onClick={() => setAddKeyOpen(false)}>
                                ✕
                              </button>
                            </div>
                            <div className="modal-body">
                              {keyCandidatesLoading ? (
                                <div>Loading...</div>
                              ) : keyCandidates.length === 0 ? (
                                <div className="muted">No candidates (需要先填写 boundModelName 才能筛选).</div>
                              ) : (
                                <div className="table-wrap">
                                  <table className="table">
                                    <thead>
                                      <tr>
                                        <th style={{ width: 56 }}>Pick</th>
                                        <th>Alias</th>
                                        <th>Status</th>
                                        <th>Used Today</th>
                                        <th>Remaining</th>
                                        <th>Provider</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {keyCandidates.map((k) => (
                                        <tr key={k.id}>
                                          <td>
                                            <input
                                              type="checkbox"
                                              checked={!!keySelect[k.id]}
                                              onChange={(e) => setKeySelect((s) => ({ ...s, [k.id]: e.target.checked }))}
                                            />
                                          </td>
                                          <td>{k.keyAlias}</td>
                                          <td>{k.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                                          <td>{k.usedTodayTokens}</td>
                                          <td>{k.remainingTokens}</td>
                                          <td>{k.provider}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                            <div className="modal-footer">
                              <button className="btn" type="button" onClick={() => setAddKeyOpen(false)}>
                                Cancel
                              </button>
                              <button
                                className="btn btn-primary"
                                type="button"
                                disabled={!selected}
                                onClick={() => {
                                  if (!selected) return;
                                  const picked = Object.entries(keySelect)
                                    .filter(([, v]) => v)
                                    .map(([id]) => id);
                                  const existingIds = new Set(selected.keyBindings.map((b) => b.llmKeyId));
                                  const next = [
                                    ...selected.keyBindings,
                                    ...picked
                                      .filter((id) => !existingIds.has(id))
                                      .map((id) => {
                                        const k = keyCandidates.find((x) => x.id === id);
                                        return {
                                          id: `new-${id}`,
                                          llmKeyId: id,
                                          sortOrder: 0,
                                          keyAlias: k?.keyAlias,
                                          isActive: k?.isActive,
                                          usedTodayTokens: k?.usedTodayTokens,
                                          remainingTokens: k?.remainingTokens,
                                          modelName: k?.modelName,
                                          provider: k?.provider,
                                        };
                                      }),
                                  ].map((b, i) => ({ ...b, sortOrder: i }));
                                  setSelected({ ...selected, keyBindings: next });
                                  setDirty(true);
                                  setAddKeyOpen(false);
                                }}
                              >
                                Add Selected
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" type="button" onClick={() => setDetailsOpen(false)}>
                Close
              </button>
              <button className="btn btn-primary" type="button" disabled={!dirty || detailsLoading} onClick={() => void save()}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {skillsPickerOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pick skills"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSkillsPickerOpen(false);
          }}
        >
          <div className="modal modal-marketplace" style={{ width: 860, maxWidth: '95vw' }}>
            <div className="modal-header">
              <div className="modal-title">选择推荐 Skills（平台全局）</div>
              <button className="modal-close" type="button" onClick={() => setSkillsPickerOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filters">
                <div className="field" style={{ minWidth: 320 }}>
                  <label>Search</label>
                  <input
                    value={skillQuery}
                    onChange={(e) => setSkillQuery(e.target.value)}
                    placeholder="name / category / description"
                  />
                </div>
                <div className="row-actions">
                  <button className="btn btn-small" type="button" disabled={skillCandidatesLoading} onClick={() => void loadSkillCandidates()}>
                    Refresh
                  </button>
                </div>
              </div>

              {skillCandidatesError ? <div className="error-box">{skillCandidatesError}</div> : null}

              {skillCandidatesLoading ? (
                <div>Loading...</div>
              ) : skillCandidates.length === 0 ? (
                <div className="muted">No candidates.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 820 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 56 }}>Pick</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Impl</th>
                        <th>Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skillCandidates.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!skillPick[s.id]}
                              onChange={(e) => setSkillPick((m) => ({ ...m, [s.id]: e.target.checked }))}
                            />
                          </td>
                          <td style={{ fontWeight: 700 }}>{s.name}</td>
                          <td>{s.category ?? '-'}</td>
                          <td>{s.implementationType}</td>
                          <td>{s.version}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div className="modal-footer-row">
                <button className="btn" type="button" onClick={() => setSkillsPickerOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!selected}
                  onClick={() => {
                    if (!selected) return;
                    const pickedIds = Object.entries(skillPick)
                      .filter(([, v]) => v)
                      .map(([id]) => id);
                    const pickedNames = pickedIds
                      .map((id) => skillCandidates.find((x) => x.id === id)?.name)
                      .filter((n): n is string => !!n);

                    const existing = new Set(selected.recommendedSkills ?? []);
                    const next = [
                      ...(selected.recommendedSkills ?? []),
                      ...pickedNames.filter((n) => !existing.has(n)),
                    ];
                    setSelected({ ...selected, recommendedSkills: next });
                    setDirty(true);
                    setSkillsPickerOpen(false);
                  }}
                >
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createSkillsPickerOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pick skills for create"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateSkillsPickerOpen(false);
          }}
        >
          <div className="modal modal-marketplace" style={{ width: 860, maxWidth: '95vw' }}>
            <div className="modal-header">
              <div className="modal-title">选择推荐 Skills（用于创建）</div>
              <button className="modal-close" type="button" onClick={() => setCreateSkillsPickerOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filters">
                <div className="field" style={{ minWidth: 320 }}>
                  <label>Search</label>
                  <input
                    value={createSkillQuery}
                    onChange={(e) => setCreateSkillQuery(e.target.value)}
                    placeholder="name / category / description"
                  />
                </div>
                <div className="row-actions">
                  <button
                    className="btn btn-small"
                    type="button"
                    disabled={skillCandidatesLoading}
                    onClick={() => void loadSkillCandidates(createSkillQuery)}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {skillCandidatesError ? <div className="error-box">{skillCandidatesError}</div> : null}

              {skillCandidatesLoading ? (
                <div>Loading...</div>
              ) : skillCandidates.length === 0 ? (
                <div className="muted">No candidates.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 820 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 56 }}>Pick</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Impl</th>
                        <th>Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skillCandidates.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!createSkillPick[s.id]}
                              onChange={(e) =>
                                setCreateSkillPick((m) => ({ ...m, [s.id]: e.target.checked }))
                              }
                            />
                          </td>
                          <td style={{ fontWeight: 700 }}>{s.name}</td>
                          <td>{s.category ?? '-'}</td>
                          <td>{s.implementationType}</td>
                          <td>{s.version}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div className="modal-footer-row">
                <button className="btn" type="button" onClick={() => setCreateSkillsPickerOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    const pickedIds = Object.entries(createSkillPick)
                      .filter(([, v]) => v)
                      .map(([id]) => id);
                    const pickedNames = pickedIds
                      .map((id) => skillCandidates.find((x) => x.id === id)?.name)
                      .filter((n): n is string => !!n);
                    const existing = new Set(createForm.recommendedSkills);
                    const merged = [...createForm.recommendedSkills, ...pickedNames.filter((n) => !existing.has(n))];
                    setCreateForm((f) => ({ ...f, recommendedSkills: merged }));
                    setCreateSkillsPickerOpen(false);
                  }}
                >
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

