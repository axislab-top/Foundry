import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Alert,
  Button,
  Card,
  InputNumber,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  BILLING_CREDIT_RATE_HINT,
  formatCredit,
  formatRmbFromCredit,
} from '../constants';
import {
  listBillingActivities,
  patchBillingActivity,
  type BillingActivityRow,
} from './api';

type DraftRow = BillingActivityRow & { dirty?: boolean };

export default function BillingActivitiesPage(): ReactElement {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBillingActivities();
      setRows(data.activities.map((row) => ({ ...row, dirty: false })));
      setUpdatedAt(data.updatedAt);
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRow = (code: string, patch: Partial<DraftRow>): void => {
    setRows((prev) =>
      prev.map((row) =>
        row.code === code ? { ...row, ...patch, dirty: true } : row,
      ),
    );
  };

  const saveRow = async (row: DraftRow): Promise<void> => {
    setSavingCode(row.code);
    setError(null);
    try {
      const data = await patchBillingActivity({
        code: row.code,
        enabled: row.enabled,
        creditAmount: row.creditAmount,
      });
      setRows(data.activities.map((item) => ({ ...item, dirty: false })));
      setUpdatedAt(data.updatedAt);
      messageApi.success('活动配置已保存');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      messageApi.error(msg);
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <div className="erp-page-stack">
      {messageContextHolder}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            平台活动
          </Typography.Title>
          <Typography.Text type="secondary">
            管理注册赠送等平台计费活动；关闭后新用户将不再自动获得对应额度。
            {updatedAt ? ` 最近更新：${new Date(updatedAt).toLocaleString('zh-CN')}` : ''}
          </Typography.Text>
        </div>

        <Alert
          type="info"
          showIcon
          message={`汇率：${BILLING_CREDIT_RATE_HINT}。活动额度在用户创建首家公司拥有者公司时写入公司预算。`}
        />

        {error ? <Alert type="error" showIcon message="操作失败" description={error} /> : null}

        <Card
          title="活动列表"
          extra={
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              刷新
            </Button>
          }
        >
          <Table<DraftRow>
            rowKey="code"
            loading={loading}
            dataSource={rows}
            pagination={false}
            columns={[
              {
                title: '活动',
                key: 'title',
                render: (_, row) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{row.title}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.titleEn}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.description}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '状态',
                dataIndex: 'enabled',
                width: 120,
                render: (enabled: boolean, row) => (
                  <Switch
                    checked={enabled}
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                    onChange={(checked) => updateRow(row.code, { enabled: checked })}
                  />
                ),
              },
              {
                title: '赠送额度',
                key: 'creditAmount',
                width: 220,
                render: (_, row) => (
                  <Space direction="vertical" size={4}>
                    <InputNumber
                      min={0}
                      step={10_000}
                      style={{ width: 180 }}
                      value={row.creditAmount}
                      disabled={!row.enabled}
                      onChange={(value) =>
                        updateRow(row.code, { creditAmount: typeof value === 'number' ? value : 0 })
                      }
                      addonAfter="Credit"
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      ≈ {formatRmbFromCredit(row.creditAmount)}（{formatCredit(row.creditAmount)}）
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '标识',
                dataIndex: 'code',
                width: 220,
                render: (code: string, row) => (
                  <Space>
                    <Tag>{code}</Tag>
                    {row.dirty ? <Tag color="gold">未保存</Tag> : null}
                  </Space>
                ),
              },
              {
                title: '操作',
                key: 'actions',
                width: 120,
                render: (_, row) => (
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    disabled={!row.dirty}
                    loading={savingCode === row.code}
                    onClick={() => void saveRow(row)}
                  >
                    保存
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </div>
  );
}
