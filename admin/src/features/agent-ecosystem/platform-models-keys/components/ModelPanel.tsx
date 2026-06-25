import type { ReactElement } from 'react';
import { Button, Empty, Spin, Tag, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  EMBEDDING_PATH_MULTIMODAL,
  EMBEDDING_PATH_TEXT,
  MODEL_TYPE_LABELS
} from '../constants';
import type { ModelType, ProviderGroup, ProviderModel } from '../types';
import { formatCatalogPricing } from '../utils';

type ModelPanelProps = {
  loading: boolean;
  provider: ProviderGroup | undefined;
  selectedModelId: string | undefined;
  onSelectModel: (modelId: string) => void;
  onAddModel: () => void;
  onEditModel: (model: ProviderModel) => void;
};

export function ModelPanel({
  loading,
  provider,
  selectedModelId,
  onSelectModel,
  onAddModel,
  onEditModel
}: ModelPanelProps): ReactElement {
  const models = provider?.models ?? [];

  return (
    <section className="erp-llm-panel">
      <header className="erp-llm-panel__head">
        <span className="erp-llm-panel__title">模型</span>
        <Button
          size="small"
          type="primary"
          icon={<PlusOutlined />}
          disabled={!provider}
          onClick={onAddModel}
        >
          新建
        </Button>
      </header>
      <div className="erp-llm-panel__body">
        {!provider ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择供应商" />
        ) : loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : models.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该供应商下暂无模型">
            <Button type="primary" size="small" onClick={onAddModel}>
              添加第一个模型
            </Button>
          </Empty>
        ) : (
          models.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              selected={model.id === selectedModelId}
              onSelect={() => onSelectModel(model.id)}
              onEdit={() => onEditModel(model)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ModelListItem({
  model,
  selected,
  onSelect,
  onEdit
}: {
  model: ProviderModel;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}): ReactElement {
  const typeLabel = MODEL_TYPE_LABELS[model.modelType as ModelType] ?? model.modelType;
  const pricing = formatCatalogPricing(model);
  const pathLabel = embeddingPathLabel(model);

  return (
    <article
      className={`erp-llm-list-item${selected ? ' erp-llm-list-item--selected' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="erp-llm-list-item__row">
        <Tooltip title={model.name}>
          <span className="erp-llm-list-item__name">{model.name}</span>
        </Tooltip>
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          aria-label="编辑模型"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        />
      </div>
      <div className="erp-llm-list-item__meta">
        <Tag>{typeLabel}</Tag>
        {model.isActive ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>}
        {pathLabel ? <Tag color="geekblue">{pathLabel}</Tag> : null}
        {model.modelType === 'embedding' && model.embeddingDimensions ? (
          <Tag>{model.embeddingDimensions} 维</Tag>
        ) : null}
        <Tag color={model.keys.length > 0 ? 'purple' : 'default'}>{model.keys.length} 密钥</Tag>
      </div>
      {pricing ? (
        <span style={{ fontSize: 11, color: 'var(--erp-color-text-muted)' }}>{pricing}</span>
      ) : null}
    </article>
  );
}

function embeddingPathLabel(model: ProviderModel): string | null {
  if (model.modelType !== 'embedding') {
    const p = String(model.requestPathSuffix ?? '').trim();
    return p || null;
  }
  const p = String(model.requestPathSuffix ?? '').trim();
  if (p === EMBEDDING_PATH_MULTIMODAL) return '多模态';
  if (p === EMBEDDING_PATH_TEXT) return '文本';
  return p || null;
}
