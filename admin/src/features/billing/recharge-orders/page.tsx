import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  approveRechargeOrder,
  createRechargeOrder,
  listCompanies,
  listRechargeOrders,
  rejectRechargeOrder,
} from '../api';
import type { CompanyOption, RechargeOrder, RechargeOrderStatus } from '../types';
import { CompanySelect } from './components/CompanySelect';
import { CreateOrderModal, type CreateOrderFormValues } from './components/CreateOrderModal';
import { RejectOrderModal } from './components/RejectOrderModal';
import {
  RechargeOrderTable,
  buildOrderRows,
  exportRechargeOrdersCsv,
  type RechargeOrderRow,
} from './components/RechargeOrderTable';

const STATUS_OPTIONS: { label: string; value: RechargeOrderStatus }[] = [
  { label: '待审批', value: 'pending' },
  { label: '已入账', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '已取消', value: 'cancelled' },
];

function dateRangeToQuery(range: [Dayjs, Dayjs] | null): {
  createdAfter?: string;
  createdBefore?: string;
} {
  if (!range) return {};
  const [start, end] = range;
  return {
    createdAfter: start.startOf('day').toISOString(),
    createdBefore: end.endOf('day').toISOString(),
  };
}

export default function BillingRechargeOrdersPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const initialCompanyId = searchParams.get('companyId') ?? undefined;
  const initialRequestedByUserId = searchParams.get('requestedByUserId') ?? undefined;

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState<string | undefined>(initialCompanyId);
  const [requestedByUserId] = useState<string | undefined>(initialRequestedByUserId);
  const [draftStatus, setDraftStatus] = useState<RechargeOrderStatus | undefined>();
  const [appliedStatus, setAppliedStatus] = useState<RechargeOrderStatus | undefined>();
  const [draftDateRange, setDraftDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [appliedDateRange, setAppliedDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [rawItems, setRawItems] = useState<RechargeOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectOrder, setRejectOrder] = useState<RechargeOrder | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    void listCompanies().then(setCompanies);
  }, []);

  useEffect(() => {
    if (initialCompanyId) {
      setCompanyId(initialCompanyId);
      setPage(1);
    }
  }, [initialCompanyId]);

  const listFilters = useMemo(
    () => ({
      companyId,
      requestedByUserId,
      status: appliedStatus,
      ...dateRangeToQuery(appliedDateRange),
    }),
    [companyId, requestedByUserId, appliedStatus, appliedDateRange],
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await listRechargeOrders({
        ...listFilters,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setRawItems(result.items);
      setTotal(result.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载订单失败');
      setRawItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listFilters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const pagedRows: RechargeOrderRow[] = useMemo(
    () => buildOrderRows(rawItems, companies),
    [rawItems, companies],
  );

  const applyFilters = (): void => {
    setAppliedStatus(draftStatus);
    setAppliedDateRange(draftDateRange);
    setPage(1);
  };

  const resetFilters = (): void => {
    setCompanyId(undefined);
    setDraftStatus(undefined);
    setAppliedStatus(undefined);
    setDraftDateRange(null);
    setAppliedDateRange(null);
    setPage(1);
  };

  const onTableChange = (pagination: TablePaginationConfig): void => {
    if (pagination.current) setPage(pagination.current);
    if (pagination.pageSize) setPageSize(pagination.pageSize);
  };

  const handleExport = async (): Promise<void> => {
    setExportLoading(true);
    try {
      const result = await listRechargeOrders({
        ...listFilters,
        limit: 500,
        offset: 0,
      });
      const rows = buildOrderRows(result.items, companies);
      if (rows.length === 0) {
        message.info('没有可导出的订单');
        return;
      }
      exportRechargeOrdersCsv(rows);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  const handleApprove = async (row: RechargeOrderRow): Promise<void> => {
    setActionLoadingId(row.id);
    try {
      await approveRechargeOrder(row.companyId, row.id);
      message.success('已通过并入账');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '审批失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectSubmit = async (rejectReason?: string): Promise<void> => {
    if (!rejectOrder) return;
    setRejectSubmitting(true);
    try {
      await rejectRechargeOrder(rejectOrder.companyId, rejectOrder.id, rejectReason);
      message.success('已拒绝');
      setRejectOpen(false);
      setRejectOrder(null);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '拒绝失败');
    } finally {
      setRejectSubmitting(false);
    }
  };

  const handleCreate = async (
    cid: string,
    values: CreateOrderFormValues,
  ): Promise<void> => {
    setCreateSubmitting(true);
    try {
      await createRechargeOrder(cid, {
        amount: values.amountCredit,
        applyNote: values.applyNote,
        idempotencyKey: values.idempotencyKey,
        mode: values.mode,
      });
      message.success(values.mode === 'approval' ? '已创建待审批订单' : '已代录并入账');
      setCreateOpen(false);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '代录失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <>
      <Card
        title="购额订单管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              代录购额
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={exportLoading}
              onClick={() => void handleExport()}
            >
              导出 CSV
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          默认展示全部公司购额单，按创建时间倒序；可选择公司筛选。汇率 1,000,000 Credit = 1 元。
          {requestedByUserId ? (
            <>
              {' '}
              当前筛选申请人：
              <Link to={`/users/platform?userId=${encodeURIComponent(requestedByUserId)}`}>
                {requestedByUserId.slice(0, 8)}…
              </Link>
            </>
          ) : null}
        </Typography.Paragraph>

        <Space wrap size={12} style={{ marginBottom: 16 }}>
          <CompanySelect value={companyId} onChange={(id) => { setCompanyId(id); setPage(1); }} />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 140 }}
            value={draftStatus}
            onChange={setDraftStatus}
            options={STATUS_OPTIONS}
          />
          <DatePicker.RangePicker
            value={draftDateRange}
            onChange={(value) =>
              setDraftDateRange(value ? [value[0]!, value[1]!] : null)
            }
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>
            查询
          </Button>
          <Button onClick={resetFilters}>重置</Button>
        </Space>

        <RechargeOrderTable
          rows={pagedRows}
          loading={loading}
          page={page}
          pageSize={pageSize}
          total={total}
          onTableChange={onTableChange}
          onApprove={(row) => void handleApprove(row)}
          onReject={(row) => {
            setRejectOrder(row);
            setRejectOpen(true);
          }}
          actionLoadingId={actionLoadingId}
        />
      </Card>

      <CreateOrderModal
        open={createOpen}
        companies={companies}
        companyId={companyId}
        submitting={createSubmitting}
        onCancel={() => setCreateOpen(false)}
        onSubmit={(cid, values) => void handleCreate(cid, values)}
      />

      <RejectOrderModal
        open={rejectOpen}
        order={rejectOrder}
        submitting={rejectSubmitting}
        onCancel={() => {
          setRejectOpen(false);
          setRejectOrder(null);
        }}
        onSubmit={(reason) => void handleRejectSubmit(reason)}
      />
    </>
  );
}
