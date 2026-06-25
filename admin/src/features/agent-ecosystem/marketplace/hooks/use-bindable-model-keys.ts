import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAuthedRequestJson } from '../../../../shared/api/client';

export type LlmModelInfo = {
  id: string;
  providerCode: string;
  modelName: string;
  modelType: string;
  isActive: boolean;
};

export type LlmKeyInfo = {
  id: string;
  keyAlias: string;
  isActive: boolean;
  isBound?: boolean;
  llmModelId?: string | null;
};

export type LlmKeyPoolGroup = {
  provider?: string;
  modelName: string;
  modelType?: string;
  keys: LlmKeyInfo[];
};

type UseBindableModelKeysOptions = {
  agentId?: string;
  enabled?: boolean;
  modelType?: 'chat';
};

function buildGroupedKeysUrl(agentId?: string, modelType: 'chat' = 'chat'): string {
  const params = new URLSearchParams({
    modelType,
    isActive: 'true',
  });
  if (agentId) {
    params.set('bindableForAgentId', agentId);
  } else {
    params.set('bindableOnly', 'true');
  }
  return `/api/admin/llm-keys/grouped?${params.toString()}`;
}

export function getCurrentModelKeys(
  keyGroups: LlmKeyPoolGroup[],
  selectedModel: LlmModelInfo | undefined,
): LlmKeyInfo[] {
  if (!selectedModel) return [];
  const group = keyGroups.find(
    (item) =>
      item.provider === selectedModel.providerCode &&
      item.modelName === selectedModel.modelName &&
      (item.modelType === 'chat' || !item.modelType),
  );
  return (group?.keys ?? []).filter((key) => key.isActive);
}

export function buildKeySelectOptions(
  keys: LlmKeyInfo[],
  options?: { showCurrentBoundLabel?: boolean },
): Array<{ label: string; value: string }> {
  return keys.map((key) => ({
    label: `${key.keyAlias} (${key.id.slice(0, 8)})${
      options?.showCurrentBoundLabel && key.isBound ? ' · 当前已绑定' : ''
    }`,
    value: key.id,
  }));
}

export function useBindableModelKeys(options: UseBindableModelKeysOptions = {}) {
  const { agentId, enabled = true, modelType = 'chat' } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<LlmModelInfo[]>([]);
  const [keyGroups, setKeyGroups] = useState<LlmKeyPoolGroup[]>([]);

  const groupedUrl = useMemo(() => buildGroupedKeysUrl(agentId, modelType), [agentId, modelType]);

  const reload = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, keysRes] = await Promise.all([
        adminAuthedRequestJson<{ items?: LlmModelInfo[] }>(
          `/api/admin/llm-models?modelType=${modelType}&isActive=true`,
        ),
        adminAuthedRequestJson<{ groups?: LlmKeyPoolGroup[] }>(groupedUrl),
      ]);
      setModels(modelsRes.items ?? []);
      setKeyGroups(keysRes.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, groupedUrl, modelType]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const chatModelOptions = useMemo(
    () =>
      models
        .filter((item) => item.modelType === modelType && item.isActive)
        .map((item) => ({
          label: `${item.modelName} (${item.providerCode})`,
          value: item.id,
        })),
    [models, modelType],
  );

  return {
    models,
    keyGroups,
    loading,
    error,
    reload,
    chatModelOptions,
    getCurrentModelKeys: (selectedModel: LlmModelInfo | undefined) =>
      getCurrentModelKeys(keyGroups, selectedModel),
  };
}
