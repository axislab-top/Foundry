import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { queryAuditLogs, type AuditLogItem } from './api';

type AuditRow = AuditLogItem & { key: string };

function formatTime(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

function statusTag(statusCode: number): ReactElement {
  if (statusCode >= 500) return <Tag color="error">{statusCode}</Tag>;
  if (statusCode >= 400) return <Tag color="warning">{statusCode}</Tag>;
  if (statusCode >= 200 && statusCode < 300) return <Tag color="success">{statusCode}</Tag>;
  return <Tag>{statusCode}</Tag>;
}

function operatorText(row: AuditLogItem): string {
  if (row.userId) return row.userId;
  if (row.apiKeyId) return `api-key:${row.apiKeyId}`;
  return '—';
}

function operatorLabel(row: AuditLogItem): ReactElement | string {
  if (row.userId) {
    return (
      <Link to={`/users/platform?userId=${encodeURIComponent(row.userId)}`} title={row.userId}>
        {row.userId}
      </Link>
    );
  }
  if (row.apiKeyId) return `api-key:${row.apiKeyId}`;
  return '—';
}

function actionLabel(row: AuditLogItem): string {
  if (row.errorMessage) return row.errorMessage;
  return `${row.method} ${row.path}`;
}

function exportCsv(rows: AuditRow[]): void {
  const header = ['time', 'operator', 'service', 'method', 'path', 'status', 'durationMs', 'error'];
  const lines = rows.map((row) =>
    [
      formatTime(row.createdAt),
      operatorText(row),
      row.service,
      row.method,
      row.path,
      String(row.statusCode),
      row.durationMs == null ? '' : String(row.durationMs),
      row.errorMessage ?? '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-logs-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const auditColumns: ColumnsType<AuditRow> = [
  {
    title: '时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180,
    render: (value: string) => formatTime(value),
  },
  {
    title: '操作者',
    key: 'operator',
    width: 200,
    ellipsis: true,
    render: (_value, row) => operatorLabel(row),
  },
  {
    title: '服务',
    dataIndex: 'service',
    key: 'service',
    width: 120,
  },
  {
    title: '请求',
    key: 'request',
    ellipsis: true,
    render: (_value, row) => (
      <span title={`${row.method} ${row.path}`}>
        <Tag style={{ marginInlineEnd: 6 }}>{row.method}</Tag>
        {row.path}
      </span>
    ),
  },
  {
    title: '状态码',
    dataIndex: 'statusCode',
    key: 'statusCode',
    width: 100,
    render: (statusCode: number) => statusTag(statusCode),
  },
  {
    title: '耗时',
    dataIndex: 'durationMs',
    key: 'durationMs',
    width: 100,
    render: (value: number | null) => (value == null ? '—' : `${value} ms`),
  },
  {
    title: '详情',
    key: 'detail',
    ellipsis: true,
    render: (_value, row) => actionLabel(row),
  },
];

const defaultFilters = {
  search: '',
  service: undefined as string | undefined,
  statusCode: undefined as number | undefined,
  dateRange: null as [Dayjs, Dayjs] | null,
};

export default function AuditLogsPage(): ReactElement {
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const search = appliedFilters.search.trim();
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);

      const result = await queryAuditLogs({
        userId: isUuid ? search : undefined,
        path: !isUuid && search ? search : undefined,
        service: appliedFilters.service,
        statusCode: appliedFilters.statusCode,
        startDate: appliedFilters.dateRange?.[0]?.startOf('day').toISOString(),
        endDate: appliedFilters.dateRange?.[1]?.endOf('day').toISOString(),
        page,
        pageSize,
      });

      setRows(
        (result.items ?? []).map((item) => ({
          ...item,
          key: item.id,
          createdAt:
            typeof item.createdAt === 'string'
              ? item.createdAt
              : new Date(item.createdAt as unknown as string).toISOString(),
        })),
      );
      setTotal(result.total ?? 0);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载审计日志失败');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const dataSource = useMemo(() => rows, [rows]);

  const applyFilters = (): void => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };

  const resetFilters = (): void => {
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  const onTableChange = (pagination: TablePaginationConfig): void => {
    if (pagination.current) setPage(pagination.current);
    if (pagination.pageSize) setPageSize(pagination.pageSize);
  };

  return (
    <Card
      title="网关 HTTP 请求审计"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={dataSource.length === 0}
            onClick={() => exportCsv(dataSource)}
          >
            导出当前页
          </Button>
        </Space>
      }
    >
      <p style={{ marginTop: 0, marginBottom: 16, color: 'rgba(0,0,0,0.45)' }}>
        记录经 Gateway 转发的 HTTP 请求（路径、状态码、耗时等），非业务配置变更审计。path 筛选为<strong>精确匹配</strong>。
      </p>
      <Space wrap size={12} className="erp-audit-toolbar" style={{ marginBottom: 16 }}>
        <Input
          placeholder="用户 UUID 或完整请求 path"
          style={{ width: 280 }}
          value={draftFilters.search}
          onChange={(e) => setDraftFilters((prev) => ({ ...prev, search: e.target.value }))}
          onPressEnter={applyFilters}
          allowClear
        />
        <Input
          placeholder="Service"
          style={{ width: 140 }}
          value={draftFilters.service}
          onChange={(e) =>
            setDraftFilters((prev) => ({ ...prev, service: e.target.value || undefined }))
          }
          onPressEnter={applyFilters}
          allowClear
        />
        <Select
          allowClear
          placeholder="Status code"
          style={{ width: 140 }}
          value={draftFilters.statusCode}
          onChange={(value) =>
            setDraftFilters((prev) => ({ ...prev, statusCode: value }))
          }
          options={[200, 201, 400, 401, 403, 404, 500, 502].map((code) => ({
            label: String(code),
            value: code,
          }))}
        />
        <DatePicker.RangePicker
          value={draftFilters.dateRange}
          onChange={(value) =>
            setDraftFilters((prev) => ({
              ...prev,
              dateRange: value ? [value[0]!, value[1]!] : null,
            }))
          }
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>
          查询
        </Button>
        <Button onClick={resetFilters}>重置</Button>
      </Space>

      <Table
        columns={auditColumns}
        dataSource={dataSource}
        loading={loading}
        size="middle"
        className="erp-audit-table"
        onChange={onTableChange}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (count) => `Total ${count} records`,
        }}
      />
    </Card>
  );
}
