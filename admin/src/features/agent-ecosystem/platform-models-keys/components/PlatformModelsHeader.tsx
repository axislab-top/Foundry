import type { ReactElement } from 'react';
import { Button, Card, Input } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';

type PlatformModelsHeaderProps = {
  searchValue: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onAddProvider: () => void;
};

export function PlatformModelsHeader({
  searchValue,
  loading,
  onSearchChange,
  onRefresh,
  onAddProvider
}: PlatformModelsHeaderProps): ReactElement {
  return (
    <Card className="erp-llm-header" variant="borderless">
      <div className="erp-llm-header__top">
        <div>
          <h1 className="erp-llm-title">平台模型与密钥</h1>
          <p className="erp-llm-subtitle">
            管理 LLM 供应商、模型目录与密钥池；配置默认向量模型后，Memory 与 Agent 将按平台规则解析。
          </p>
        </div>
        <div className="erp-llm-toolbar">
          <Input
            allowClear
            className="erp-llm-search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            prefix={<SearchOutlined />}
            placeholder="搜索供应商、模型或密钥别名…"
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddProvider}>
            新建供应商
          </Button>
        </div>
      </div>
    </Card>
  );
}
