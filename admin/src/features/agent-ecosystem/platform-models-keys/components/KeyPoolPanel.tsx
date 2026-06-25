import type { ReactElement } from 'react';
import {
  Button,
  Dropdown,
  Empty,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
  type MenuProps
} from 'antd';
import {
  KeyOutlined,
  MoreOutlined,
  PlusOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { STATUS_TAG } from '../constants';
import type { KeyStatus, ModelKey, ProviderGroup, ProviderModel } from '../types';
import { formatTokenCount } from '../utils';

const { Text } = Typography;

type KeyPoolPanelProps = {
  provider: ProviderGroup | undefined;
  model: ProviderModel | undefined;
  selectedKeyId: string | null;
  activeKeyActionId: string | null;
  testingKeyId: string | null;
  onSelectKey: (keyId: string) => void;
  onNewKey: () => void;
  onRotateSelected: () => void;
  onUpdateStatus: (keyId: string, status: KeyStatus) => void;
  onRotate: (key: ModelKey) => void;
  onTest: (keyId: string) => void;
  onRevoke: (keyId: string) => void;
};

export function KeyPoolPanel({
  provider,
  model,
  selectedKeyId,
  activeKeyActionId,
  testingKeyId,
  onSelectKey,
  onNewKey,
  onRotateSelected,
  onUpdateStatus,
  onRotate,
  onTest,
  onRevoke
}: KeyPoolPanelProps): ReactElement {
  const keys = model?.keys ?? [];

  return (
    <section className="erp-llm-panel">
      <header className="erp-llm-panel__head">
        <span className="erp-llm-panel__title">
          <KeyOutlined style={{ marginRight: 6 }} />
          密钥池
        </span>
        <Space size={4}>
          <Button size="small" disabled={!selectedKeyId} onClick={onRotateSelected}>
            轮换选中
          </Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} disabled={!model} onClick={onNewKey}>
            新建密钥
          </Button>
        </Space>
      </header>

      <div className="erp-llm-key-section">
        <div className="erp-llm-key-section__scope">
          {provider && model ? (
            <div className="erp-llm-key-scope">
              <Text type="secondary">
                当前范围：<Text strong>{provider.name}</Text> / <Text strong>{model.name}</Text>
              </Text>
              <Space size={4} wrap>
                <Tag color="blue">{model.modelType}</Tag>
                {model.requestPathSuffix ? <Tag>路径 {model.requestPathSuffix}</Tag> : null}
              </Space>
            </div>
          ) : (
            <Text type="secondary">在左侧选择供应商与模型后管理密钥</Text>
          )}
        </div>

        <div className="erp-llm-key-section__body">
          {!model ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择模型" />
          ) : keys.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该模型下暂无密钥">
              <Button type="primary" icon={<PlusOutlined />} onClick={onNewKey}>
                添加密钥
              </Button>
            </Empty>
          ) : (
            <Table<ModelKey>
              className="erp-llm-key-table"
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={keys}
              rowClassName={(record) =>
                record.id === selectedKeyId ? 'erp-llm-key-row--selected' : ''
              }
              onRow={(record) => ({
                onClick: () => onSelectKey(record.id)
              })}
              columns={[
                {
                  title: '别名',
                  dataIndex: 'alias',
                  ellipsis: true,
                  render: (alias: string) => <Text strong>{alias}</Text>
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 80,
                  render: (status: KeyStatus) => {
                    const meta = STATUS_TAG[status];
                    return <Tag color={meta.color}>{meta.text}</Tag>;
                  }
                },
                {
                  title: '今日用量',
                  width: 160,
                  render: (_: unknown, record: ModelKey) => {
                    if (record.dailyQuotaTokens <= 0) {
                      return <Text type="secondary">未设日配额</Text>;
                    }
                    return (
                      <Space direction="vertical" size={0} style={{ width: '100%' }}>
                        <Text style={{ fontSize: 12 }}>
                          {formatTokenCount(record.usedTodayTokens)} /{' '}
                          {formatTokenCount(record.dailyQuotaTokens)}
                        </Text>
                        <Progress
                          percent={record.usedRate}
                          size="small"
                          showInfo={false}
                          status={record.usedRate >= 90 ? 'exception' : 'normal'}
                        />
                      </Space>
                    );
                  }
                },
                {
                  title: '操作',
                  width: 72,
                  align: 'center',
                  render: (_: unknown, record: ModelKey) => (
                    <KeyActionsMenu
                      record={record}
                      loading={activeKeyActionId === record.id}
                      testing={testingKeyId === record.id}
                      onUpdateStatus={onUpdateStatus}
                      onRotate={onRotate}
                      onTest={onTest}
                      onRevoke={onRevoke}
                    />
                  )
                }
              ]}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function KeyActionsMenu({
  record,
  loading,
  testing,
  onUpdateStatus,
  onRotate,
  onTest,
  onRevoke
}: {
  record: ModelKey;
  loading: boolean;
  testing: boolean;
  onUpdateStatus: (keyId: string, status: KeyStatus) => void;
  onRotate: (key: ModelKey) => void;
  onTest: (keyId: string) => void;
  onRevoke: (keyId: string) => void;
}): ReactElement {
  const items: MenuProps['items'] = [
    record.status === 'active'
      ? { key: 'disable', label: '停用', onClick: () => onUpdateStatus(record.id, 'disabled') }
      : { key: 'enable', label: '启用', onClick: () => onUpdateStatus(record.id, 'active') },
    { key: 'test', label: '连通测试', disabled: testing, onClick: () => onTest(record.id) },
    { key: 'rotate', label: '轮换密钥', icon: <SyncOutlined />, onClick: () => onRotate(record) },
    { type: 'divider' },
    { key: 'revoke', label: '吊销', danger: true, onClick: () => onRevoke(record.id) }
  ];

  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button
        type="text"
        size="small"
        icon={<MoreOutlined />}
        loading={loading || testing}
        onClick={(e) => e.stopPropagation()}
      />
    </Dropdown>
  );
}
