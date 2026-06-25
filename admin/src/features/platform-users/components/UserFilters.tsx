import type { ReactElement } from 'react';
import { Button, Input, Select, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { DeletedFilter } from '../types';

export type UserFiltersDraft = {
  search: string;
  enabled: boolean | undefined;
  deleted: DeletedFilter;
};

type UserFiltersProps = {
  draft: UserFiltersDraft;
  onDraftChange: (patch: Partial<UserFiltersDraft>) => void;
  onApply: () => void;
  onReset: () => void;
};

const ENABLED_OPTIONS = [
  { label: '全部', value: '' },
  { label: '正常', value: 'true' },
  { label: '已禁用', value: 'false' },
];

const DELETED_OPTIONS: { label: string; value: DeletedFilter }[] = [
  { label: '未删除', value: 'false' },
  { label: '已删除', value: 'true' },
  { label: '全部', value: 'all' },
];

export function UserFilters({
  draft,
  onDraftChange,
  onApply,
  onReset,
}: UserFiltersProps): ReactElement {
  const enabledValue =
    draft.enabled === undefined ? '' : draft.enabled ? 'true' : 'false';

  return (
    <Space wrap size={12} style={{ marginBottom: 16 }}>
      <Input
        allowClear
        placeholder="搜索用户名或邮箱"
        style={{ minWidth: 220 }}
        value={draft.search}
        onChange={(e) => onDraftChange({ search: e.target.value })}
        onPressEnter={onApply}
      />
      <Select
        placeholder="启用状态"
        style={{ width: 120 }}
        value={enabledValue}
        onChange={(value) => {
          if (value === '') {
            onDraftChange({ enabled: undefined });
          } else {
            onDraftChange({ enabled: value === 'true' });
          }
        }}
        options={ENABLED_OPTIONS}
      />
      <Select
        placeholder="删除状态"
        style={{ width: 120 }}
        value={draft.deleted}
        onChange={(value) => onDraftChange({ deleted: value as DeletedFilter })}
        options={DELETED_OPTIONS}
      />
      <Button type="primary" icon={<SearchOutlined />} onClick={onApply}>
        查询
      </Button>
      <Button onClick={onReset}>重置</Button>
    </Space>
  );
}

export const DEFAULT_USER_FILTERS: UserFiltersDraft = {
  search: '',
  enabled: undefined,
  deleted: 'false',
};
