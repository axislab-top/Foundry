import { PlusOutlined } from '@ant-design/icons';
import { useState, type ReactElement } from 'react';
import { Alert, Button, Card, Col, Drawer, Empty, Form, Input, Popconfirm, Row, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import type { BoundTool, Skill, SkillDetailDraft, StatusBadge } from '../types';
import { SkillMdEditor } from './SkillMdEditor';

type SkillDetailDrawerProps = {
  activeSkill: Skill | null;
  detailDraft: SkillDetailDraft | null;
  detailOpen: boolean;
  hasUnsavedContentChanges: boolean;
  bindingSaving: boolean;
  savingContent: boolean;
  activeDrawerTab: 'governance' | 'skillMd' | 'bindings';
  activeBindingTab: 'tools' | 'mcpTools';
  onClose: () => void;
  onSave: () => void;
  onDrawerTabChange: (key: 'governance' | 'skillMd' | 'bindings') => void;
  onBindingTabChange: (key: 'tools' | 'mcpTools') => void;
  onFieldUpdate: <K extends keyof SkillDetailDraft>(key: K, value: SkillDetailDraft[K]) => void;
  onToggleOverride: (target: 'tool' | 'mcp', id: string) => void;
  onRemoveBinding: (target: 'tool' | 'mcp', id: string) => void;
  onMoveBinding: (target: 'tool' | 'mcp', sourceId: string, targetId: string) => void;
  onStartAddBindings: (target: 'tool' | 'mcp') => void;
  onDelete: () => void;
  onValidateSkillMd?: (raw: string) => Promise<{ ok: boolean; issues: Array<{ field: string; message: string }> }>;
  deleting: boolean;
  validationErrors?: Partial<Record<'changeReason', string>>;
};

function renderBindingCards(
  target: 'tool' | 'mcp',
  items: BoundTool[],
  draggingItemId: string | null,
  bindingSaving: boolean,
  onDraggingItemChange: (id: string | null) => void,
  onToggleOverride: (target: 'tool' | 'mcp', id: string) => void,
  onRemoveBinding: (target: 'tool' | 'mcp', id: string) => void,
  onMoveBinding: (target: 'tool' | 'mcp', sourceId: string, targetId: string) => void
): ReactElement {
  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
      {items.map((item) => (
        <Card
          key={item.id}
          size="small"
          draggable={!bindingSaving}
          onDragStart={() => {
            if (bindingSaving) return;
            onDraggingItemChange(item.id);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (bindingSaving || !draggingItemId || draggingItemId === item.id) return;
            onMoveBinding(target, draggingItemId, item.id);
            onDraggingItemChange(null);
          }}
          styles={{ body: { paddingBlock: 10 } }}
        >
          <Row align="middle" justify="space-between" gutter={[8, 8]}>
            <Col>
              <Space size={8}>
                <Typography.Text strong>{item.name}</Typography.Text>
                <Tag>v{item.version}</Tag>
                {item.overridden ? <Tag color="processing">Config Overridden</Tag> : <Tag>Default Config</Tag>}
              </Space>
            </Col>
            <Col>
              <Space size={8}>
                <Button size="small" disabled={bindingSaving} onClick={() => onToggleOverride(target, item.id)}>
                  配置覆盖
                </Button>
                <Button size="small" danger disabled={bindingSaving} onClick={() => onRemoveBinding(target, item.id)}>
                  移除
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      ))}
      {!items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无绑定项" /> : null}
    </Space>
  );
}

export function SkillDetailDrawer({
  activeSkill,
  detailDraft,
  detailOpen,
  hasUnsavedContentChanges,
  bindingSaving,
  savingContent,
  activeDrawerTab,
  activeBindingTab,
  onClose,
  onSave,
  onDrawerTabChange,
  onBindingTabChange,
  onFieldUpdate,
  onToggleOverride,
  onRemoveBinding,
  onMoveBinding,
  onStartAddBindings,
  onDelete,
  onValidateSkillMd,
  deleting,
  validationErrors
}: SkillDetailDrawerProps): ReactElement {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  const footerStatusText = hasUnsavedContentChanges
    ? 'SKILL.md / 治理有未保存变更'
    : bindingSaving
      ? '正在保存绑定…'
      : '内容已保存 · 绑定自动持久化';

  return (
    <Drawer
      title={
        activeSkill && detailDraft ? (
          <Space size={10}>
            <Typography.Text strong>{activeSkill.name}</Typography.Text>
            <Tag
              color={
                detailDraft.statusBadge === 'Active'
                  ? 'success'
                  : detailDraft.statusBadge === 'Deprecated'
                    ? 'warning'
                    : 'default'
              }
            >
              {detailDraft.statusBadge}
            </Tag>
          </Space>
        ) : (
          'Skill Details'
        )
      }
      open={detailOpen}
      onClose={onClose}
      size="large"
      footer={
        <Row align="middle" justify="space-between">
          <Col>
            <Typography.Text type={hasUnsavedContentChanges ? 'warning' : 'secondary'}>{footerStatusText}</Typography.Text>
          </Col>
          <Col>
            <Space>
              <Popconfirm
                title="删除 Skill？"
                description="删除后不可恢复。"
                okText="删除"
                okButtonProps={{ danger: true, loading: deleting }}
                onConfirm={onDelete}
              >
                <Button danger loading={deleting} disabled={bindingSaving || savingContent}>
                  删除
                </Button>
              </Popconfirm>
              <Button onClick={onClose} disabled={bindingSaving || savingContent}>
                关闭
              </Button>
              <Button type="primary" loading={savingContent} disabled={bindingSaving} onClick={onSave}>
                保存内容
              </Button>
            </Space>
          </Col>
        </Row>
      }
    >
      {activeSkill && detailDraft ? (
        <Tabs
          activeKey={activeDrawerTab}
          onChange={(key) => onDrawerTabChange(key as 'governance' | 'skillMd' | 'bindings')}
          items={[
            {
              key: 'skillMd',
              label: 'SKILL.md',
              children: (
                <SkillMdEditor
                  value={detailDraft.skillMd}
                  onChange={(next) => onFieldUpdate('skillMd', next)}
                  onValidate={onValidateSkillMd}
                  minRows={24}
                />
              )
            },
            {
              key: 'governance',
              label: '治理',
              children: (
                <Form layout="vertical">
                  <Form.Item label="Status">
                    <Select
                      value={detailDraft.statusBadge}
                      onChange={(value) => onFieldUpdate('statusBadge', value as StatusBadge)}
                      options={(['Draft', 'Active', 'Deprecated'] as StatusBadge[]).map((item) => ({
                        label: item,
                        value: item
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    label="Change Reason"
                    required
                    validateStatus={validationErrors?.changeReason ? 'error' : undefined}
                    help={
                      validationErrors?.changeReason ??
                      '保存 SKILL.md / 治理时使用；绑定 Tool 时若已填写也会写入审计日志'
                    }
                  >
                    <Input
                      value={detailDraft.changeReason}
                      onChange={(event) => onFieldUpdate('changeReason', event.target.value)}
                      placeholder="Describe why this change is needed"
                    />
                  </Form.Item>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    安全等级、审批与租户绑定仍在平台治理流程中处理；技能定义内容请仅在 SKILL.md 中维护。
                  </Typography.Paragraph>
                </Form>
              )
            },
            {
              key: 'bindings',
              label: 'Tool / MCP 绑定',
              children: (
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="绑定即时保存"
                    description="添加、移除、排序或配置覆盖会立即写入服务器，无需点击底部「保存内容」。刷新页面后绑定仍然保留。"
                  />
                  {bindingSaving ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                      <Spin size="small" tip="正在保存绑定…" />
                    </div>
                  ) : null}
                  <Tabs
                    activeKey={activeBindingTab}
                    onChange={(key) => onBindingTabChange(key as 'tools' | 'mcpTools')}
                    items={[
                      {
                        key: 'tools',
                        label: 'Tools',
                        children: (
                          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                            <Row justify="end">
                              <Button
                                type="dashed"
                                icon={<PlusOutlined />}
                                disabled={bindingSaving}
                                onClick={() => onStartAddBindings('tool')}
                              >
                                添加 Tool
                              </Button>
                            </Row>
                            {renderBindingCards(
                              'tool',
                              detailDraft.boundTools,
                              draggingItemId,
                              bindingSaving,
                              setDraggingItemId,
                              onToggleOverride,
                              onRemoveBinding,
                              onMoveBinding
                            )}
                          </Space>
                        )
                      },
                      {
                        key: 'mcpTools',
                        label: 'MCP Tools',
                        children: (
                          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                            <Row justify="end">
                              <Button
                                type="dashed"
                                icon={<PlusOutlined />}
                                disabled={bindingSaving}
                                onClick={() => onStartAddBindings('mcp')}
                              >
                                添加 MCP Tool
                              </Button>
                            </Row>
                            {renderBindingCards(
                              'mcp',
                              detailDraft.boundMcpTools,
                              draggingItemId,
                              bindingSaving,
                              setDraggingItemId,
                              onToggleOverride,
                              onRemoveBinding,
                              onMoveBinding
                            )}
                          </Space>
                        )
                      }
                    ]}
                  />
                </Space>
              )
            }
          ]}
        />
      ) : (
        <Empty description="Select a skill to view details." />
      )}
    </Drawer>
  );
}
