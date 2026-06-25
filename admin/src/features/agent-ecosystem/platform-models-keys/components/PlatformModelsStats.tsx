import type { ReactElement } from 'react';
import { EditOutlined } from '@ant-design/icons';
import type { CatalogStats } from '../types';

type PlatformModelsStatsProps = {
  stats: CatalogStats;
  effectiveEmbeddingModelName: string;
  effectiveEmbeddingSubtitle: string | null;
  onConfigureEmbedding: () => void;
};

export function PlatformModelsStats({
  stats,
  effectiveEmbeddingModelName,
  effectiveEmbeddingSubtitle,
  onConfigureEmbedding
}: PlatformModelsStatsProps): ReactElement {
  return (
    <div className="erp-llm-stats">
      <StatCard label="供应商" value={String(stats.providerCount)} />
      <StatCard label="模型" value={String(stats.modelCount)} hint="含目录中全部类型" />
      <StatCard label="密钥" value={String(stats.keyCount)} hint={`${stats.activeKeys} 个启用中`} />
      <button
        type="button"
        className="erp-llm-stat-card erp-llm-stat-card--clickable"
        onClick={onConfigureEmbedding}
      >
        <div className="erp-llm-stat-card__label">
          默认向量模型 <EditOutlined style={{ marginLeft: 4, fontSize: 11 }} />
        </div>
        <div className="erp-llm-stat-card__value" style={{ fontSize: 15 }}>
          {effectiveEmbeddingModelName}
        </div>
        <p className="erp-llm-stat-card__hint">
          {effectiveEmbeddingSubtitle ?? '点击配置 Memory 默认 embedding'}
        </p>
      </button>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}): ReactElement {
  return (
    <div className="erp-llm-stat-card">
      <div className="erp-llm-stat-card__label">{label}</div>
      <div className="erp-llm-stat-card__value">{value}</div>
      {hint ? <p className="erp-llm-stat-card__hint">{hint}</p> : null}
    </div>
  );
}
