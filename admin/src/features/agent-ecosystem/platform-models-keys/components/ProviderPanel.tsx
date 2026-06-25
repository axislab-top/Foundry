import type { ReactElement } from 'react';
import { Button, Empty, Spin, Tag } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { ProviderGroup } from '../types';

type ProviderPanelProps = {
  loading: boolean;
  providers: ProviderGroup[];
  selectedProviderId: string | undefined;
  onSelect: (providerId: string, firstModelId: string) => void;
  onEdit: (provider: ProviderGroup) => void;
};

export function ProviderPanel({
  loading,
  providers,
  selectedProviderId,
  onSelect,
  onEdit
}: ProviderPanelProps): ReactElement {
  return (
    <section className="erp-llm-panel">
      <header className="erp-llm-panel__head">
        <span className="erp-llm-panel__title">供应商</span>
        <Tag>{providers.length}</Tag>
      </header>
      <div className="erp-llm-panel__body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : providers.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无供应商" />
        ) : (
          providers.map((provider) => {
            const keyCount = provider.models.reduce((n, m) => n + m.keys.length, 0);
            const modelCount = provider.models.length;
            const selected = provider.id === selectedProviderId;
            return (
              <article
                key={provider.id}
                className={`erp-llm-list-item${selected ? ' erp-llm-list-item--selected' : ''}`}
                onClick={() => onSelect(provider.id, provider.models[0]?.id ?? '')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(provider.id, provider.models[0]?.id ?? '');
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="erp-llm-list-item__row">
                  <span className="erp-llm-list-item__name">{provider.name}</span>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label="编辑供应商"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(provider);
                    }}
                  />
                </div>
                <div className="erp-llm-list-item__meta">
                  <Tag>{provider.region}</Tag>
                  <Tag color="blue">{modelCount} 模型</Tag>
                  <Tag color="purple">{keyCount} 密钥</Tag>
                </div>
                <span style={{ fontSize: 11, color: 'var(--erp-color-text-muted)' }}>{provider.id}</span>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
