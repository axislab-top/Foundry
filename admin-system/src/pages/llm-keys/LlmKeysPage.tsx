import React, { useEffect, useMemo, useState } from 'react';
import type { LlmKeyInfo } from '../../services/llmKeysApi';
import { llmKeysApi } from '../../services/llmKeysApi';
import { llmProvidersApi, type LlmProviderInfo, type LlmProviderKind } from '../../services/llmProvidersApi';
import { ApiError } from '../../services/apiClient';

type StatusFilter = 'all' | 'active' | 'inactive';

function formatDateTimeUTC(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function safeNumberText(n: string | null | undefined): string {
  if (n === undefined || n === null) return '0';
  return n;
}

const Modal: React.FC<{
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}> = ({ open, title, children, onClose, footer }) => {
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
};

export const LlmKeysPage: React.FC = () => {
  const [items, setItems] = useState<LlmKeyInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [provider, setProvider] = useState('');
  const [modelName, setModelName] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<LlmKeyInfo | null>(null);

  const [providersLoading, setProvidersLoading] = useState(false);
  const [providers, setProviders] = useState<LlmProviderInfo[]>([]);
  const [providerCreateOpen, setProviderCreateOpen] = useState(false);
  const [providerCreateError, setProviderCreateError] = useState<string | null>(null);
  const [providerCreateForm, setProviderCreateForm] = useState({
    code: '',
    displayName: '',
    kind: 'openai' as LlmProviderKind,
    requestUrl: '',
  });

  const [createForm, setCreateForm] = useState({
    provider: '',
    modelName: '',
    keyAlias: '',
    secret: '',
    dailyQuotaTokens: 0,
    isActive: true,
  });

  const listParams = useMemo(() => {
    const p: Record<string, unknown> = {
      page,
      pageSize,
    };
    if (provider.trim()) p.provider = provider.trim();
    if (modelName.trim()) p.modelName = modelName.trim();
    if (status === 'active') p.isActive = true;
    if (status === 'inactive') p.isActive = false;
    return p;
  }, [page, pageSize, provider, modelName, status]);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await llmKeysApi.list(listParams);
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

  async function refreshProviders(): Promise<void> {
    setProvidersLoading(true);
    setProviderCreateError(null);
    try {
      const res = await llmProvidersApi.list();
      setProviders(res.items ?? []);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
      setProviderCreateError(msg);
    } finally {
      setProvidersLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, provider, modelName, status]);

  useEffect(() => {
    void refreshProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section>
      <div className="page-head">
        <div className="page-head-left">
          <h2>LLM Keys</h2>
          <div className="page-subtitle">Token 配额与可用密钥池管理</div>
        </div>
        <div className="page-head-right">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setCreateForm({
                provider: '',
                modelName: '',
                keyAlias: '',
                secret: '',
                dailyQuotaTokens: 0,
                isActive: true,
              });
              setCreateOpen(true);
            }}
          >
            + Add Key
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <div className="field">
            <label>Provider</label>
            <input
              value={provider}
              onChange={(e) => {
                setPage(1);
                setProvider(e.target.value);
              }}
              placeholder="openai | anthropic"
            />
          </div>
          <div className="field">
            <label>Model</label>
            <input
              value={modelName}
              onChange={(e) => {
                setPage(1);
                setModelName(e.target.value);
              }}
              placeholder="gpt-4o | claude-..."
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as StatusFilter);
              }}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Alias</th>
                <th>Status</th>
                <th>Daily Quota</th>
                <th>Used Today</th>
                <th>Remaining</th>
                <th>Assigned Companies</th>
                <th>Last Used</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10}>Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10}>No keys found.</td>
                </tr>
              ) : (
                items.map((k) => (
                  <tr key={k.id}>
                    <td>{k.provider}</td>
                    <td>{k.modelName}</td>
                    <td>{k.keyAlias}</td>
                    <td>{k.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    <td>{safeNumberText(k.dailyQuotaTokens)}</td>
                    <td>{safeNumberText(k.usedTodayTokens)}</td>
                    <td>{safeNumberText(k.remainingTokens)}</td>
                    <td>{safeNumberText(k.assignedCompanyCount)}</td>
                    <td>{formatDateTimeUTC(k.lastUsedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-small"
                          type="button"
                          onClick={() => {
                            setSelected(k);
                            setDetailsOpen(true);
                          }}
                        >
                          Details
                        </button>
                        <button
                          className="btn btn-small"
                          type="button"
                          onClick={async () => {
                            setError(null);
                            try {
                              if (k.isActive) await llmKeysApi.disable(k.id);
                              else await llmKeysApi.enable(k.id);
                              setSelected((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
                              await refresh();
                            } catch (e: unknown) {
                              const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
                              setError(msg);
                            }
                          }}
                        >
                          {k.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          type="button"
                          onClick={async () => {
                            const ok = window.confirm(`Delete key "${k.keyAlias}"?`);
                            if (!ok) return;
                            setError(null);
                            try {
                              await llmKeysApi.remove(k.id);
                              if (selected?.id === k.id) setDetailsOpen(false);
                              await refresh();
                            } catch (e: unknown) {
                              const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
                              setError(msg);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button className="btn btn-small" type="button" disabled={page <= 1} onClick={() => setPage(1)}>
            {'<<'}
          </button>
          <button className="btn btn-small" type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            {'<'}
          </button>
          <div className="pagination-info">
            Page {page} / {totalPages}
          </div>
          <button className="btn btn-small" type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            {'>'}
          </button>
          <button className="btn btn-small" type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
            {'>>'}
          </button>
        </div>
      </div>

      <Modal
        open={createOpen}
        title="Add LLM Key"
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="modal-footer-row">
            <button className="btn" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  if (!createForm.provider.trim()) {
                    setError('Please select a provider');
                    return;
                  }
                  await llmKeysApi.create({
                    provider: createForm.provider.trim(),
                    modelName: createForm.modelName.trim(),
                    keyAlias: createForm.keyAlias.trim(),
                    secret: createForm.secret,
                    dailyQuotaTokens: Number(createForm.dailyQuotaTokens),
                    isActive: createForm.isActive,
                  });
                  setCreateOpen(false);
                  await refresh();
                } catch (e: unknown) {
                  const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
                  setError(msg);
                }
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label>Provider</label>
            <div className="provider-select">
              <select
                value={createForm.provider}
                disabled={providersLoading}
                onChange={(e) => setCreateForm((s) => ({ ...s, provider: e.target.value }))}
              >
                <option value="">Select provider</option>
                {providers.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} ({p.kind})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-small"
                type="button"
                onClick={() => {
                  setProviderCreateError(null);
                  setProviderCreateForm({
                    code: '',
                    displayName: '',
                    kind: 'openai',
                    requestUrl: '',
                  });
                  setProviderCreateOpen(true);
                }}
              >
                + Add Provider
              </button>
            </div>
          </div>
          <div className="field">
            <label>模型请求地址</label>
            <input
              disabled
              value={providers.find((p) => p.code === createForm.provider)?.requestUrl ?? ''}
              placeholder="选择提供商"
            />
          </div>
          <div className="field">
            <label>Model</label>
            <input value={createForm.modelName} onChange={(e) => setCreateForm((s) => ({ ...s, modelName: e.target.value }))} placeholder="gpt-4o | claude-..." />
          </div>
          <div className="field">
            <label>Key Alias</label>
            <input value={createForm.keyAlias} onChange={(e) => setCreateForm((s) => ({ ...s, keyAlias: e.target.value }))} placeholder="e.g. prod-key-1" />
          </div>
          <div className="field">
            <label>Secret</label>
            <input type="password" value={createForm.secret} onChange={(e) => setCreateForm((s) => ({ ...s, secret: e.target.value }))} placeholder="Paste the real API key" />
          </div>
          <div className="field">
            <label>Daily Quota Tokens</label>
            <input
              type="number"
              value={createForm.dailyQuotaTokens}
              onChange={(e) => setCreateForm((s) => ({ ...s, dailyQuotaTokens: Number(e.target.value) }))}
              min={0}
            />
          </div>
          <div className="field">
            <label>Active</label>
            <select value={String(createForm.isActive)} onChange={(e) => setCreateForm((s) => ({ ...s, isActive: e.target.value === 'true' }))}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          {error ? <div className="error-box" style={{ gridColumn: '1 / -1' }}>{error}</div> : null}
        </div>
      </Modal>

      <Modal
        open={providerCreateOpen}
        title="添加提供商"
        onClose={() => setProviderCreateOpen(false)}
        footer={
          <div className="modal-footer-row">
            <button className="btn" type="button" onClick={() => setProviderCreateOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                setProviderCreateError(null);
                try {
                  const created = await llmProvidersApi.create({
                    code: providerCreateForm.code.trim(),
                    displayName: providerCreateForm.displayName.trim(),
                    kind: providerCreateForm.kind,
                    requestUrl: providerCreateForm.requestUrl.trim(),
                  });
                  setProviderCreateOpen(false);
                  await refreshProviders();
                  setCreateForm((s) => ({ ...s, provider: created.code }));
                } catch (e: unknown) {
                  const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
                  setProviderCreateError(msg);
                }
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label>Provider Code</label>
            <input
              value={providerCreateForm.code}
              onChange={(e) => setProviderCreateForm((s) => ({ ...s, code: e.target.value }))}
              placeholder="openai"
            />
          </div>
          <div className="field">
            <label>Display Name</label>
            <input
              value={providerCreateForm.displayName}
              onChange={(e) => setProviderCreateForm((s) => ({ ...s, displayName: e.target.value }))}
              placeholder="OpenAI"
            />
          </div>
          <div className="field">
            <label>Kind</label>
            <select
              value={providerCreateForm.kind}
              onChange={(e) => setProviderCreateForm((s) => ({ ...s, kind: e.target.value as LlmProviderKind }))}
            >
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>服务商 API 请求地址</label>
            <input
              value={providerCreateForm.requestUrl}
              onChange={(e) => setProviderCreateForm((s) => ({ ...s, requestUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          {providerCreateError ? (
            <div className="error-box" style={{ gridColumn: '1 / -1' }}>
              {providerCreateError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={detailsOpen}
        title="LLM Key Details"
        onClose={() => setDetailsOpen(false)}
        footer={
          selected ? (
            <div className="modal-footer-row">
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  setError(null);
                  try {
                    if (!selected) return;
                    if (selected.isActive) await llmKeysApi.disable(selected.id);
                    else await llmKeysApi.enable(selected.id);
                    setSelected({ ...selected, isActive: !selected.isActive });
                    await refresh();
                  } catch (e: unknown) {
                    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
                    setError(msg);
                  }
                }}
              >
                {selected.isActive ? 'Disable' : 'Enable'}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={async () => {
                  if (!selected) return;
                  const ok = window.confirm(`Delete key "${selected.keyAlias}"?`);
                  if (!ok) return;
                  setError(null);
                  try {
                    await llmKeysApi.remove(selected.id);
                    setDetailsOpen(false);
                    await refresh();
                  } catch (e: unknown) {
                    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
                    setError(msg);
                  }
                }}
              >
                Delete
              </button>
              <button className="btn btn-primary" type="button" onClick={() => setDetailsOpen(false)}>
                Close
              </button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="details-grid">
            <div className="detail-item">
              <div className="detail-label">Provider</div>
              <div className="detail-value">{selected.provider}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Model</div>
              <div className="detail-value">{selected.modelName}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Key Alias</div>
              <div className="detail-value">{selected.keyAlias}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Status</div>
              <div className="detail-value">{selected.isActive ? 'Active' : 'Inactive'}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Daily Quota Tokens</div>
              <div className="detail-value">{selected.dailyQuotaTokens}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Used Today Tokens</div>
              <div className="detail-value">{selected.usedTodayTokens}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Remaining Tokens</div>
              <div className="detail-value">{selected.remainingTokens}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Assigned Companies</div>
              <div className="detail-value">{selected.assignedCompanyCount}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Last Used At</div>
              <div className="detail-value">{formatDateTimeUTC(selected.lastUsedAt)}</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};

