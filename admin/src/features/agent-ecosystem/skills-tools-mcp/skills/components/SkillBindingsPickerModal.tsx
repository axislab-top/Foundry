import type { ReactElement } from 'react';
import { Input, Modal, Select, Space, Typography } from 'antd';

type PickerItem = {
  id: string;
  name: string;
  version: string;
};

type SkillBindingsPickerModalProps = {
  target: 'tool' | 'mcp' | null;
  searchValue: string;
  selectedIds: string[];
  options: PickerItem[];
  loading?: boolean;
  confirmLoading?: boolean;
  onSearchChange: (value: string) => void;
  onSelectedIdsChange: (value: string[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SkillBindingsPickerModal({
  target,
  searchValue,
  selectedIds,
  options,
  loading = false,
  confirmLoading = false,
  onSearchChange,
  onSelectedIdsChange,
  onCancel,
  onConfirm
}: SkillBindingsPickerModalProps): ReactElement {
  return (
    <Modal
      title={target === 'mcp' ? '添加 MCPTool' : '添加 Tool'}
      open={!!target}
      onCancel={onCancel}
      onOk={onConfirm}
      confirmLoading={confirmLoading}
      okButtonProps={{ disabled: loading || !selectedIds.length }}
      okText="绑定并保存"
      width={680}
    >
      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          确认后将立即保存到服务器，无需再点详情页底部的「保存内容」。
        </Typography.Text>
        <Input
          allowClear
          placeholder="搜索全局 Tool..."
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          loading={loading}
          disabled={confirmLoading}
          placeholder="选择需要绑定的项（支持多选）"
          value={selectedIds}
          onChange={onSelectedIdsChange}
          options={options.map((item) => ({
            label: `${item.name}  (v${item.version})`,
            value: item.id
          }))}
        />
        <Typography.Text type="secondary">共 {options.length} 条可选项</Typography.Text>
      </Space>
    </Modal>
  );
}
