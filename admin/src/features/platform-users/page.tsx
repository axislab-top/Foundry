import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Alert, Button, Card, Space, Typography, message } from 'antd';
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { TablePaginationConfig } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import {
  createPlatformUser,
  deletePlatformUser,
  listAllPlatformUsersForExport,
  listPlatformUsers,
  updatePlatformUser,
} from './api';
import { CreateUserModal } from './components/CreateUserModal';
import { EditUserModal } from './components/EditUserModal';
import { UserDetailDrawer } from './components/UserDetailDrawer';
import { DEFAULT_USER_FILTERS, UserFilters, type UserFiltersDraft } from './components/UserFilters';
import { UserTable, exportPlatformUsersCsv } from './components/UserTable';
import type { PlatformUser, PlatformUserRow } from './types';

export default function PlatformUsersPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftFilters, setDraftFilters] = useState<UserFiltersDraft>(DEFAULT_USER_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<UserFiltersDraft>(DEFAULT_USER_FILTERS);

  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [items, setItems] = useState<PlatformUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  const [permissionError, setPermissionError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<PlatformUser | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const queryFilters = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      enabled: appliedFilters.enabled,
      deleted: appliedFilters.deleted,
      page,
      pageSize,
      sortBy,
      sortOrder,
      includeStats: true,
    }),
    [appliedFilters, page, pageSize, sortBy, sortOrder],
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setPermissionError(null);
    try {
      const result = await listPlatformUsers(queryFilters);
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载用户列表失败';
      if (msg.includes('无用户管理权限')) {
        setPermissionError(msg);
      }
      message.error(msg);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const urlUserId = searchParams.get('userId');

  useEffect(() => {
    if (urlUserId) {
      setDetailUserId(urlUserId);
      setDetailOpen(true);
    }
  }, [urlUserId]);

  const openUserDetail = (id: string): void => {
    setDetailUserId(id);
    setDetailOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('userId', id);
      return next;
    });
  };

  const closeUserDetail = (): void => {
    setDetailOpen(false);
    setDetailUserId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('userId');
      return next;
    });
  };

  const rows: PlatformUserRow[] = useMemo(
    () => items.map((item) => ({ ...item, key: item.id })),
    [items],
  );

  const applyFilters = (): void => {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  };

  const resetFilters = (): void => {
    setDraftFilters(DEFAULT_USER_FILTERS);
    setAppliedFilters(DEFAULT_USER_FILTERS);
    setPage(1);
  };

  const onTableChange = (
    pagination: TablePaginationConfig,
    sorter: { field?: string; order?: string },
  ): void => {
    if (pagination.current) setPage(pagination.current);
    if (pagination.pageSize) setPageSize(pagination.pageSize);

    if (sorter.field && sorter.order) {
      setSortBy(sorter.field);
      setSortOrder(sorter.order === 'ascend' ? 'ASC' : 'DESC');
      setPage(1);
    }
  };

  const handleExport = async (): Promise<void> => {
    setExportLoading(true);
    try {
      const all = await listAllPlatformUsersForExport({
        search: appliedFilters.search || undefined,
        enabled: appliedFilters.enabled,
        deleted: appliedFilters.deleted,
        sortBy,
        sortOrder,
      });
      if (all.length === 0) {
        message.info('没有可导出的用户');
        return;
      }
      exportPlatformUsersCsv(all.map((item) => ({ ...item, key: item.id })));
      message.success(`已导出 ${all.length} 条记录`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  const handleCreate = async (
    payload: Parameters<typeof createPlatformUser>[0],
  ): Promise<void> => {
    setCreateSubmitting(true);
    try {
      await createPlatformUser(payload);
      message.success('用户创建成功');
      setCreateOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '创建失败';
      message.error(msg);
      throw e;
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEdit = async (
    payload: Parameters<typeof updatePlatformUser>[1],
  ): Promise<void> => {
    if (!editUser) return;
    setEditSubmitting(true);
    try {
      await updatePlatformUser(editUser.id, payload);
      message.success('用户已更新');
      setEditOpen(false);
      setEditUser(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '更新失败';
      message.error(msg);
      throw e;
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleEnabled = async (row: PlatformUserRow, enabled: boolean): Promise<void> => {
    setActionLoadingId(row.id);
    try {
      await updatePlatformUser(row.id, { enabled });
      message.success(enabled ? '已启用' : '已禁用');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (row: PlatformUserRow): Promise<void> => {
    setActionLoadingId(row.id);
    try {
      await deletePlatformUser(row.id);
      message.success('用户已软删除');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <>
      <Card
        title="平台用户"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              刷新
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={exportLoading}
              onClick={() => void handleExport()}
            >
              导出 CSV
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建用户
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          管理 OPC 主客户端账号，含关联企业、Credit 余额、购额记录与第三方绑定。Credit 归属企业而非个人。
        </Typography.Paragraph>

        {permissionError ? (
          <Alert type="warning" message={permissionError} showIcon style={{ marginBottom: 16 }} />
        ) : null}

        <UserFilters
          draft={draftFilters}
          onDraftChange={(patch) => setDraftFilters((prev) => ({ ...prev, ...patch }))}
          onApply={applyFilters}
          onReset={resetFilters}
        />

        <UserTable
          rows={rows}
          loading={loading}
          page={page}
          pageSize={pageSize}
          total={total}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onTableChange={onTableChange}
          onView={(row) => openUserDetail(row.id)}
          onEdit={(row) => {
            setEditUser(row);
            setEditOpen(true);
          }}
          onToggleEnabled={(row, enabled) => void handleToggleEnabled(row, enabled)}
          onDelete={(row) => void handleDelete(row)}
          actionLoadingId={actionLoadingId}
        />
      </Card>

      <CreateUserModal
        open={createOpen}
        submitting={createSubmitting}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <EditUserModal
        open={editOpen}
        user={editUser}
        submitting={editSubmitting}
        onCancel={() => {
          setEditOpen(false);
          setEditUser(null);
        }}
        onSubmit={handleEdit}
      />

      <UserDetailDrawer
        open={detailOpen}
        userId={detailUserId}
        onClose={closeUserDetail}
      />
    </>
  );
}
