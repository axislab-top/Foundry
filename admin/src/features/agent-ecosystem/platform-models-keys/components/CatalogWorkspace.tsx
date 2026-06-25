import type { ReactElement } from 'react';
import { Breadcrumb, Card } from 'antd';
import { ApiOutlined, DeploymentUnitOutlined, KeyOutlined } from '@ant-design/icons';
import type { ProviderGroup, ProviderModel } from '../types';
import { KeyPoolPanel } from './KeyPoolPanel';
import { ModelPanel } from './ModelPanel';
import { ProviderPanel } from './ProviderPanel';

type CatalogWorkspaceProps = {
  loading: boolean;
  providers: ProviderGroup[];
  selectedProvider: ProviderGroup | undefined;
  selectedModel: ProviderModel | undefined;
  selectedProviderId: string | undefined;
  selectedModelId: string | undefined;
  selectedKeyId: string | null;
  activeKeyActionId: string | null;
  testingKeyId: string | null;
  onSelectProvider: (providerId: string, firstModelId: string) => void;
  onSelectModel: (modelId: string) => void;
  onSelectKey: (keyId: string) => void;
  onEditProvider: (provider: ProviderGroup) => void;
  onAddModel: () => void;
  onEditModel: (model: ProviderModel) => void;
  onNewKey: () => void;
  onRotateSelected: () => void;
  onUpdateKeyStatus: (keyId: string, status: import('../types').KeyStatus) => void;
  onRotateKey: (key: import('../types').ModelKey) => void;
  onTestKey: (keyId: string) => void;
  onRevokeKey: (keyId: string) => void;
};

export function CatalogWorkspace(props: CatalogWorkspaceProps): ReactElement {
  const {
    loading,
    providers,
    selectedProvider,
    selectedModel,
    selectedProviderId,
    selectedModelId,
    selectedKeyId,
    activeKeyActionId,
    testingKeyId,
    onSelectProvider,
    onSelectModel,
    onSelectKey,
    onEditProvider,
    onAddModel,
    onEditModel,
    onNewKey,
    onRotateSelected,
    onUpdateKeyStatus,
    onRotateKey,
    onTestKey,
    onRevokeKey
  } = props;

  const breadcrumbItems = [
    {
      title: (
        <>
          <ApiOutlined /> {selectedProvider?.name ?? '未选择供应商'}
        </>
      )
    },
    {
      title: (
        <>
          <DeploymentUnitOutlined /> {selectedModel?.name ?? '未选择模型'}
        </>
      )
    },
    {
      title: (
        <>
          <KeyOutlined /> 密钥池
        </>
      )
    }
  ];

  return (
    <Card className="erp-llm-workspace" variant="borderless">
      <nav className="erp-llm-breadcrumb" aria-label="目录导航">
        <Breadcrumb items={breadcrumbItems} />
      </nav>
      <div className="erp-llm-workspace__grid">
        <ProviderPanel
          loading={loading}
          providers={providers}
          selectedProviderId={selectedProviderId}
          onSelect={onSelectProvider}
          onEdit={onEditProvider}
        />
        <ModelPanel
          loading={loading}
          provider={selectedProvider}
          selectedModelId={selectedModelId}
          onSelectModel={onSelectModel}
          onAddModel={onAddModel}
          onEditModel={onEditModel}
        />
        <KeyPoolPanel
          provider={selectedProvider}
          model={selectedModel}
          selectedKeyId={selectedKeyId}
          activeKeyActionId={activeKeyActionId}
          testingKeyId={testingKeyId}
          onSelectKey={onSelectKey}
          onNewKey={onNewKey}
          onRotateSelected={onRotateSelected}
          onUpdateStatus={onUpdateKeyStatus}
          onRotate={onRotateKey}
          onTest={onTestKey}
          onRevoke={onRevokeKey}
        />
      </div>
    </Card>
  );
}
