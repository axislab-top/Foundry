import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../services/apiClient';
import {
  skillsApi,
  type SkillAdminDetail,
  type SkillAdminListItem,
  type SkillAuditLogItem,
  type SkillUsageForSkill,
  type SkillRevisionItem,
} from '../../services/skillsApi';
import { filesApi } from '../../services/filesApi';

type DetailsTab = 'editor' | 'versions' | 'usage' | 'audit';

function formatDate(d: string | undefined | null): string {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString();
  } catch {
    return String(d);
  }
}

function toJsonText(v: Record<string, unknown> | null): string {
  if (!v) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return '';
  }
}

export const SkillsManagementPage: React.FC = () => {
  const [items, setItems] = useState<SkillAdminListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<SkillAdminDetail | null>(null);
  const [activeTab, setActiveTab] = useState<DetailsTab>('editor');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [toolSchemaText, setToolSchemaText] = useState('');
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [bundleUploading, setBundleUploading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usage, setUsage] = useState<SkillUsageForSkill | null>(null);

  const [revLoading, setRevLoading] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<SkillRevisionItem[]>([]);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<SkillAuditLogItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize] = useState(20);

  const listParams = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize };
    if (search.trim()) p.search = search.trim();
    if (category.trim()) p.category = category.trim();
    return p;
  }, [page, pageSize, search, category]);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await skillsApi.list(listParams as any);
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
  }, [page, pageSize, search, category]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function openDetails(id: string) {
    setDetailsOpen(true);
    setActiveTab('editor');
    setDetailsLoading(true);
    setDetailsError(null);
    setUsage(null);
    setUsageError(null);
    setAuditLogs([]);
    setAuditError(null);
    setAuditTotal(0);
    setAuditPage(1);
    setDirty(false);

    void (async () => {
      try {
        const d = await skillsApi.findOne(id);
        setSelected(d);
        setToolSchemaText(toJsonText(d.toolSchema));
      } catch (e: unknown) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
        setDetailsError(msg);
      } finally {
        setDetailsLoading(false);
      }
    })();
  }

  async function refreshUsage(): Promise<void> {
    if (!selected?.id) return;
    setUsageLoading(true);
    setUsageError(null);
    try {
      const res = await skillsApi.usage({ skillId: selected.id, page: 1, pageSize: 1 });
      if (res && 'skillId' in res) setUsage(res as SkillUsageForSkill);
      else if (res && 'items' in res && (res as any).items?.[0]) setUsage((res as any).items[0] as SkillUsageForSkill);
      else setUsage(null);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setUsageError(msg);
    } finally {
      setUsageLoading(false);
    }
  }

  async function refreshAuditLogs(): Promise<void> {
    if (!selected?.id) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await skillsApi.auditLogs({
        skillId: selected.id,
        page: auditPage,
        pageSize: auditPageSize,
      });
      setAuditLogs(res.items);
      setAuditTotal(res.total);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setAuditError(msg);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (!detailsOpen || !selected) return;
    if (activeTab === 'versions') void refreshRevisions();
    if (activeTab === 'usage') void refreshUsage();
    if (activeTab === 'audit') void refreshAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, detailsOpen, auditPage]);

  async function refreshRevisions(): Promise<void> {
    if (!selected?.id) return;
    setRevLoading(true);
    setRevError(null);
    try {
      const rows = await skillsApi.revisions(selected.id);
      setRevisions(rows);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setRevError(msg);
    } finally {
      setRevLoading(false);
    }
  }

  async function importFromArtifact(): Promise<void> {
    if (!selected?.id) return;
    setRevLoading(true);
    setRevError(null);
    try {
      await skillsApi.importRevisionFromArtifact(selected.id);
      await refreshRevisions();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Import failed';
      setRevError(msg);
    } finally {
      setRevLoading(false);
    }
  }

  async function publishRevision(revId: string): Promise<void> {
    if (!selected?.id) return;
    setRevLoading(true);
    setRevError(null);
    try {
      await skillsApi.publishRevision(selected.id, revId);
      await refreshRevisions();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Publish failed';
      setRevError(msg);
    } finally {
      setRevLoading(false);
    }
  }

  async function reviewRevision(revId: string, action: 'approve' | 'reject'): Promise<void> {
    if (!selected?.id) return;
    const comment = action === 'reject' ? window.prompt('Reject reason (optional)') ?? undefined : undefined;
    setRevLoading(true);
    setRevError(null);
    try {
      await skillsApi.reviewRevision(selected.id, revId, action, comment);
      await refreshRevisions();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Review failed';
      setRevError(msg);
    } finally {
      setRevLoading(false);
    }
  }

  async function revokeRevision(revId: string): Promise<void> {
    if (!selected?.id) return;
    setRevLoading(true);
    setRevError(null);
    try {
      await skillsApi.revokeRevision(selected.id, revId);
      await refreshRevisions();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Revoke failed';
      setRevError(msg);
    } finally {
      setRevLoading(false);
    }
  }

  async function rollbackRevision(revId: string): Promise<void> {
    if (!selected?.id) return;
    setRevLoading(true);
    setRevError(null);
    try {
      await skillsApi.rollbackRevision(selected.id, revId);
      await refreshRevisions();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Rollback failed';
      setRevError(msg);
    } finally {
      setRevLoading(false);
    }
  }

  function parseToolSchema(): Record<string, unknown> | null {
    const txt = toolSchemaText.trim();
    if (!txt) return null;
    const parsed = JSON.parse(txt);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('toolSchema 必须是 JSON 对象');
    }
    return parsed as Record<string, unknown>;
  }

  async function save(): Promise<void> {
    if (!selected) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const toolSchema = parseToolSchema();
      if (!toolSchema) {
        throw new Error('toolSchema 不能为空');
      }
      await skillsApi.update(selected.id, {
        name: selected.name,
        category: selected.category,
        description: selected.description,
        promptTemplate: selected.promptTemplate,
        implementationType: selected.implementationType,
        version: selected.version,
        isPublic: selected.isPublic,
        isSystem: selected.isSystem,
        toolSchema,
      });
      setDirty(false);
      await refresh();
      const d = await skillsApi.findOne(selected.id);
      setSelected(d);
      setToolSchemaText(toJsonText(d.toolSchema));
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setDetailsError(msg);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function uploadBundle(): Promise<void> {
    if (!selected?.id) return;
    if (!bundleFile) {
      setBundleError('请选择要上传的 zip 文件');
      return;
    }
    setBundleUploading(true);
    setBundleError(null);
    try {
      const safeName = bundleFile.name.toLowerCase().endsWith('.zip') ? bundleFile.name : `${bundleFile.name}.zip`;
      const path = `skills/global/${selected.id}/v${selected.version || 1}/${safeName}`;
      const info = await filesApi.upload(bundleFile, { path, public: false, contentType: 'application/zip' });

      const nextMeta = {
        ...(selected.metadata ?? {}),
        artifact: {
          kind: 'bundle.zip',
          path: info.path,
          size: info.size,
          contentType: info.contentType,
          uploadedAt: new Date().toISOString(),
        },
      };
      await skillsApi.update(selected.id, { metadata: nextMeta });
      const d = await skillsApi.findOne(selected.id);
      setSelected(d);
      setDirty(false);
      setBundleFile(null);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed';
      setBundleError(msg);
    } finally {
      setBundleUploading(false);
    }
  }

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBundleFile, setCreateBundleFile] = useState<File | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    category: '',
    description: '',
    promptTemplate: '',
    implementationType: 'builtin' as string,
    version: 1,
    isPublic: true,
    isSystem: false,
    toolSchemaText: '',
  });

  function resetCreateForm() {
    setCreateForm({
      name: '',
      category: '',
      description: '',
      promptTemplate: '',
      implementationType: 'builtin',
      version: 1,
      isPublic: true,
      isSystem: false,
      toolSchemaText: '',
    });
    setCreateBundleFile(null);
  }

  async function createSkill(): Promise<void> {
    setCreateLoading(true);
    setCreateError(null);
    try {
      if (!createForm.name.trim()) throw new Error('name 不能为空');
      if (!createForm.toolSchemaText.trim()) throw new Error('toolSchema 不能为空');

      const parsed = JSON.parse(createForm.toolSchemaText.trim());
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('toolSchema 必须是 JSON 对象');

      const created = await skillsApi.create({
        name: createForm.name.trim(),
        category: createForm.category.trim() || null,
        description: createForm.description || null,
        promptTemplate: createForm.promptTemplate || null,
        implementationType: createForm.implementationType,
        version: createForm.version,
        isPublic: createForm.isPublic,
        isSystem: createForm.isSystem,
        toolSchema: parsed,
      });

      if (createBundleFile) {
        const safeName = createBundleFile.name.toLowerCase().endsWith('.zip')
          ? createBundleFile.name
          : `${createBundleFile.name}.zip`;
        const path = `skills/global/${created.id}/v${created.version || 1}/${safeName}`;
        const info = await filesApi.upload(createBundleFile, {
          path,
          public: false,
          contentType: 'application/zip',
        });
        const nextMeta = {
          ...(created.metadata ?? {}),
          artifact: {
            kind: 'bundle.zip',
            path: info.path,
            size: info.size,
            contentType: info.contentType,
            uploadedAt: new Date().toISOString(),
          },
        };
        await skillsApi.update(created.id, { metadata: nextMeta });
        await skillsApi.importRevisionFromArtifact(created.id);
      }

      setCreateOpen(false);
      resetCreateForm();
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div className="page-head-left">
          <h2>Skills Management</h2>
          <div className="page-subtitle">平台全局 Skills：CRUD / 使用统计 / 审计日志</div>
        </div>
        <div className="page-head-right">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setCreateError(null);
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            + New Global Skill
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <div className="field">
            <label>Search</label>
            <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="name / description" />
          </div>
          <div className="field">
            <label>Category</label>
            <input value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} placeholder="e.g. file / coding" />
          </div>
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Impl</th>
                <th>Version</th>
                <th>Public</th>
                <th>Updated</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7}>No skills.</td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ fontWeight: 700 }}>{it.name}</td>
                    <td>{it.category ?? '-'}</td>
                    <td>{it.implementationType}</td>
                    <td>{it.version}</td>
                    <td>{it.isPublic ? <span className="badge badge-green">Yes</span> : <span className="badge badge-gray">No</span>}</td>
                    <td>{formatDate(it.updatedAt)}</td>
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

        <div className="pagination" style={{ justifyContent: 'space-between' }}>
          <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </button>
          <div className="pagination-info">
            Page {page} / {totalPages} · Total {total}
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
          aria-label="Create Global Skill"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <div className="modal modal-lg modal-create">
            <div className="modal-header">
              <div className="modal-title">Create Global Skill</div>
              <button className="modal-close" type="button" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {createError ? <div className="error-box">{createError}</div> : null}
              <div className="create-skill-layout">
                <section className="modal-section">
                  <div className="modal-section-title">Basic Info</div>
                  <div className="form-grid">
                    <div className="field">
                      <label>Name</label>
                      <input value={createForm.name} onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label>Category</label>
                      <input value={createForm.category} onChange={(e) => setCreateForm((s) => ({ ...s, category: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label>Description</label>
                      <input value={createForm.description} onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label>Prompt Template</label>
                      <textarea
                        className="editor-textarea"
                        value={createForm.promptTemplate}
                        onChange={(e) => setCreateForm((s) => ({ ...s, promptTemplate: e.target.value }))}
                        rows={6}
                      />
                    </div>
                  </div>
                </section>

                <section className="modal-section">
                  <div className="modal-section-title">Behavior & Visibility</div>
                  <div className="form-grid">
                    <div className="field">
                      <label>Implementation</label>
                      <select
                        value={createForm.implementationType}
                        onChange={(e) => setCreateForm((s) => ({ ...s, implementationType: e.target.value }))}
                      >
                        <option value="builtin">builtin</option>
                        <option value="langgraph">langgraph</option>
                        <option value="api">api</option>
                        <option value="external">external</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Version</label>
                      <input
                        type="number"
                        min={1}
                        value={createForm.version}
                        onChange={(e) => setCreateForm((s) => ({ ...s, version: Number(e.target.value || 1) }))}
                      />
                    </div>
                    <div className="field">
                      <label>isPublic</label>
                      <select value={createForm.isPublic ? 'yes' : 'no'} onChange={(e) => setCreateForm((s) => ({ ...s, isPublic: e.target.value === 'yes' }))}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>isSystem</label>
                      <select value={createForm.isSystem ? 'yes' : 'no'} onChange={(e) => setCreateForm((s) => ({ ...s, isSystem: e.target.value === 'yes' }))}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="modal-section">
                  <div className="modal-section-title">Tool Schema</div>
                  <div className="field">
                    <label>toolSchema (JSON)</label>
                    <textarea
                      className="editor-textarea editor-textarea-mono"
                      value={createForm.toolSchemaText}
                      onChange={(e) => setCreateForm((s) => ({ ...s, toolSchemaText: e.target.value }))}
                      rows={10}
                    />
                  </div>
                </section>

                <section className="modal-section">
                  <div className="modal-section-title">Artifact Bundle</div>
                  <div className="field">
                    <label>Skill Bundle (zip, optional)</label>
                    <div className="zip-upload-row">
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setCreateBundleFile(e.target.files?.[0] ?? null)}
                      />
                      <div className="zip-upload-hint">
                        {createBundleFile ? `Selected: ${createBundleFile.name}` : 'No zip selected'}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
            <div className="modal-footer">
              <div className="modal-footer-row">
                <button className="btn" type="button" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="button" disabled={createLoading} onClick={() => void createSkill()}>
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailsOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Skill Details"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailsOpen(false);
          }}
        >
          <div className="modal modal-xl modal-details">
            <div className="modal-header">
              <div className="modal-title">Global Skill: {selected?.name ?? '-'}</div>
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
                  <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <button className={`btn btn-small ${activeTab === 'editor' ? 'btn-primary' : ''}`} type="button" onClick={() => setActiveTab('editor')}>
                      Editor
                    </button>
                    <button className={`btn btn-small ${activeTab === 'versions' ? 'btn-primary' : ''}`} type="button" onClick={() => setActiveTab('versions')}>
                      Versions
                    </button>
                    <button className={`btn btn-small ${activeTab === 'usage' ? 'btn-primary' : ''}`} type="button" onClick={() => setActiveTab('usage')}>
                      Usage
                    </button>
                    <button className={`btn btn-small ${activeTab === 'audit' ? 'btn-primary' : ''}`} type="button" onClick={() => setActiveTab('audit')}>
                      Audit Logs
                    </button>
                    <div style={{ flex: 1 }} />
                    {dirty ? <span className="badge badge-gray">Unsaved</span> : null}
                  </div>

                  {activeTab === 'editor' ? (
                    <div>
                      <div className="form-grid">
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
                          <label>Category</label>
                          <input
                            value={selected.category ?? ''}
                            onChange={(e) => {
                              setSelected({ ...selected, category: e.target.value || null });
                              setDirty(true);
                            }}
                          />
                        </div>
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <label>Description</label>
                          <input
                            value={selected.description ?? ''}
                            onChange={(e) => {
                              setSelected({ ...selected, description: e.target.value || null });
                              setDirty(true);
                            }}
                          />
                        </div>
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <label>Prompt Template</label>
                          <textarea
                            className="editor-textarea"
                            value={selected.promptTemplate ?? ''}
                            onChange={(e) => {
                              setSelected({ ...selected, promptTemplate: e.target.value || null });
                              setDirty(true);
                            }}
                            rows={6}
                          />
                        </div>
                        <div className="field">
                          <label>Implementation</label>
                          <select
                            value={selected.implementationType}
                            onChange={(e) => {
                              setSelected({ ...selected, implementationType: e.target.value as any });
                              setDirty(true);
                            }}
                          >
                            <option value="builtin">builtin</option>
                            <option value="langgraph">langgraph</option>
                            <option value="api">api</option>
                            <option value="external">external</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Version</label>
                          <input
                            type="number"
                            min={1}
                            value={selected.version}
                            onChange={(e) => {
                              setSelected({ ...selected, version: Number(e.target.value || selected.version) });
                              setDirty(true);
                            }}
                          />
                        </div>
                        <div className="field">
                          <label>isPublic</label>
                          <select
                            value={selected.isPublic ? 'yes' : 'no'}
                            onChange={(e) => {
                              setSelected({ ...selected, isPublic: e.target.value === 'yes' });
                              setDirty(true);
                            }}
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>isSystem</label>
                          <select
                            value={selected.isSystem ? 'yes' : 'no'}
                            onChange={(e) => {
                              setSelected({ ...selected, isSystem: e.target.value === 'yes' });
                              setDirty(true);
                            }}
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        </div>
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <label>toolSchema (JSON)</label>
                          <textarea
                            className="editor-textarea editor-textarea-mono"
                            value={toolSchemaText}
                            onChange={(e) => {
                              setToolSchemaText(e.target.value);
                              setDirty(true);
                            }}
                            rows={10}
                          />
                        </div>

                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <label>Skill Bundle (zip)</label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="file"
                              accept=".zip"
                              onChange={(e) => {
                                setBundleError(null);
                                const f = e.target.files?.[0] ?? null;
                                setBundleFile(f);
                              }}
                            />
                            <button className="btn btn-small" type="button" disabled={bundleUploading || !bundleFile} onClick={() => void uploadBundle()}>
                              {bundleUploading ? 'Uploading...' : 'Upload'}
                            </button>
                            <div style={{ opacity: 0.8 }}>
                              Current: {(selected.metadata as any)?.artifact?.path ?? '-'}
                            </div>
                          </div>
                          {bundleError ? <div className="error-box" style={{ marginTop: 8 }}>{bundleError}</div> : null}
                        </div>
                      </div>
                      <div className="modal-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
                        <div className="modal-footer-row">
                          <button className="btn" type="button" onClick={() => setDetailsOpen(false)}>
                            Close
                          </button>
                          <button className="btn btn-primary" type="button" disabled={!dirty || detailsLoading} onClick={() => void save()}>
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'versions' ? (
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-small btn-primary" type="button" disabled={revLoading} onClick={() => void importFromArtifact()}>
                          {revLoading ? 'Importing...' : 'Import from artifact.zip'}
                        </button>
                        <button className="btn btn-small" type="button" disabled={revLoading} onClick={() => void refreshRevisions()}>
                          Refresh
                        </button>
                        <div style={{ opacity: 0.8 }}>Artifact: {(selected?.metadata as any)?.artifact?.path ?? '-'}</div>
                      </div>
                      {revError ? <div className="error-box" style={{ marginTop: 12 }}>{revError}</div> : null}
                      {revLoading ? <div style={{ marginTop: 12 }}>Loading...</div> : null}
                      {!revLoading ? (
                        <div className="table-wrap" style={{ marginTop: 12 }}>
                          <table className="table" style={{ minWidth: 980 }}>
                            <thead>
                              <tr>
                                <th>Version</th>
                                <th>Status</th>
                                <th>Review</th>
                                <th>Risk</th>
                                <th>Name</th>
                                <th>Impl</th>
                                <th>Created</th>
                                <th style={{ width: 420 }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {revisions.length === 0 ? (
                                <tr><td colSpan={8}>No revisions.</td></tr>
                              ) : (
                                revisions.map((r) => (
                                  <tr key={r.id}>
                                    <td style={{ fontWeight: 700 }}>v{r.version}</td>
                                    <td>{r.status}</td>
                                    <td>{r.reviewStatus ?? '-'}</td>
                                    <td>{r.riskLevel ?? '-'}</td>
                                    <td>{r.name}</td>
                                    <td>{r.implementationType}</td>
                                    <td>{formatDate(r.createdAt)}</td>
                                    <td>
                                      <div className="row-actions">
                                        <button className="btn btn-small btn-primary" type="button" disabled={revLoading} onClick={() => void publishRevision(r.id)}>
                                          Publish
                                        </button>
                                        <button className="btn btn-small" type="button" disabled={revLoading} onClick={() => void reviewRevision(r.id, 'approve')}>
                                          Approve
                                        </button>
                                        <button className="btn btn-small" type="button" disabled={revLoading} onClick={() => void reviewRevision(r.id, 'reject')}>
                                          Reject
                                        </button>
                                        <button className="btn btn-small" type="button" disabled={revLoading} onClick={() => void revokeRevision(r.id)}>
                                          Revoke
                                        </button>
                                        <button className="btn btn-small" type="button" disabled={revLoading} onClick={() => void rollbackRevision(r.id)}>
                                          Rollback
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {activeTab === 'usage' ? (
                    <div className="card" style={{ background: 'rgba(2, 6, 23, 0.5)' }}>
                      {usageLoading ? <div>Loading usage...</div> : null}
                      {usageError ? <div className="error-box">{usageError}</div> : null}
                      {!usageLoading && usage ? (
                        <div className="stats-grid">
                          <div className="stat-card">
                            <div className="stat-label">Call Count</div>
                            <div className="stat-value">{usage.callCount}</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-label">Failure Rate</div>
                            <div className="stat-value">{(usage.failureRate * 100).toFixed(2)}%</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-label">Bound Agents</div>
                            <div className="stat-value">{usage.boundAgentCount}</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-label">Avg Duration (ms)</div>
                            <div className="stat-value">{usage.avgDurationMs ?? '-'}</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-label">Avg Billing Units</div>
                            <div className="stat-value">{usage.avgBillingUnits ?? '-'}</div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-label">Failure Count</div>
                            <div className="stat-value">{usage.failureCount}</div>
                          </div>
                        </div>
                      ) : null}
                      {!usageLoading && !usage && !usageError ? <div>No usage data.</div> : null}
                    </div>
                  ) : null}

                  {activeTab === 'audit' ? (
                    <div>
                      {auditLoading ? <div>Loading audit logs...</div> : null}
                      {auditError ? <div className="error-box">{auditError}</div> : null}
                      <div className="table-wrap" style={{ marginTop: 12 }}>
                        <table className="table" style={{ minWidth: 980 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 120 }}>When</th>
                              <th style={{ width: 120 }}>Action</th>
                              <th style={{ width: 120 }}>Risk</th>
                              <th style={{ width: 120 }}>Status</th>
                              <th>Scan Findings</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogs.length === 0 ? (
                              <tr>
                                <td colSpan={5}>No audit logs.</td>
                              </tr>
                            ) : (
                              auditLogs.map((l) => {
                                const findings = (l.scanResult as any)?.findings;
                                const rendered =
                                  Array.isArray(findings) && findings.length
                                    ? findings.slice(0, 2).join(' / ') + (findings.length > 2 ? ` +${findings.length - 2}` : '')
                                    : '-';
                                return (
                                  <tr key={l.id}>
                                    <td>{formatDate(l.createdAt)}</td>
                                    <td>{l.actionType}</td>
                                    <td>{l.riskLevel ?? '-'}</td>
                                    <td>{l.reviewStatus}</td>
                                    <td style={{ maxWidth: 520 }}>{rendered}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="pagination" style={{ justifyContent: 'space-between' }}>
                        <button className="btn" type="button" disabled={auditPage <= 1} onClick={() => setAuditPage((p) => Math.max(1, p - 1))}>
                          Prev
                        </button>
                        <div className="pagination-info">
                          Page {auditPage} / {Math.max(1, Math.ceil(auditTotal / auditPageSize))}
                        </div>
                        <button
                          className="btn"
                          type="button"
                          disabled={auditPage >= Math.ceil(auditTotal / auditPageSize)}
                          onClick={() => setAuditPage((p) => Math.min(Math.ceil(auditTotal / auditPageSize), p + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

