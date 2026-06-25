import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Typography,
  message,
} from 'antd';
import { adminAuthedRequestJson } from '../../../shared/api/client';

const { Paragraph, Title, Text } = Typography;

type ReplayGlobalForm = {
  mainRoomIntentInlineReplyEnabled: boolean;
  mainRoomIntentInlineReplyMinConfidence: number;
  ceoReplayMemoryThreshold: number;
  modelName: string;
  modelProviderCode: string;
  keyIds: string[];
};

const DEFAULT_REPLAY_FORM: ReplayGlobalForm = {
  mainRoomIntentInlineReplyEnabled: false,
  mainRoomIntentInlineReplyMinConfidence: 0.88,
  ceoReplayMemoryThreshold: 0.92,
  modelName: 'glm-4-flash',
  modelProviderCode: '',
  keyIds: [],
};

type LlmModelInfo = {
  id: string;
  providerCode: string;
  modelName: string;
  modelType: string;
  isActive: boolean;
};

type LlmKeyInfo = {
  id: string;
  keyAlias: string;
  isActive: boolean;
  isBound?: boolean;
};

type LlmKeyPoolGroup = {
  provider?: string;
  modelName: string;
  modelType?: string;
  keys: LlmKeyInfo[];
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return adminAuthedRequestJson<T>(url, init);
}

function normalizeReplayForm(row: Record<string, unknown> | null): ReplayGlobalForm {
  if (!row || typeof row !== 'object') return { ...DEFAULT_REPLAY_FORM };
  const keyIdsRaw = row.keyIds;
  const keyIds =
    Array.isArray(keyIdsRaw) && keyIdsRaw.length > 0
      ? keyIdsRaw.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 16)
      : typeof row.llmKeyId === 'string' && row.llmKeyId.trim()
        ? [row.llmKeyId.trim()]
        : [];
  return {
    mainRoomIntentInlineReplyEnabled:
      typeof row.mainRoomIntentInlineReplyEnabled === 'boolean'
        ? row.mainRoomIntentInlineReplyEnabled
        : DEFAULT_REPLAY_FORM.mainRoomIntentInlineReplyEnabled,
    mainRoomIntentInlineReplyMinConfidence:
      typeof row.mainRoomIntentInlineReplyMinConfidence === 'number' &&
      Number.isFinite(row.mainRoomIntentInlineReplyMinConfidence)
        ? Math.max(0, Math.min(1, row.mainRoomIntentInlineReplyMinConfidence))
        : DEFAULT_REPLAY_FORM.mainRoomIntentInlineReplyMinConfidence,
    ceoReplayMemoryThreshold:
      typeof row.ceoReplayMemoryThreshold === 'number' && Number.isFinite(row.ceoReplayMemoryThreshold)
        ? Math.max(0, Math.min(1, row.ceoReplayMemoryThreshold))
        : DEFAULT_REPLAY_FORM.ceoReplayMemoryThreshold,
    modelName:
      typeof row.modelName === 'string' && row.modelName.trim()
        ? row.modelName.trim().slice(0, 200)
        : DEFAULT_REPLAY_FORM.modelName,
    modelProviderCode:
      typeof row.modelProviderCode === 'string' ? row.modelProviderCode.trim().slice(0, 64) : DEFAULT_REPLAY_FORM.modelProviderCode,
    keyIds,
  };
}

/**
 * CEO 配置页 — Replay 层：平台存盘（`collab.replay.globalSettings`）+ 下发各公司 `strategy.contextPolicy.replay`；
 * Worker 与进程 env 合并，未在此设置的字段仍使用部署环境变量默认。
 */
export function CeoReplayConfigTab(): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ReplayGlobalForm>(DEFAULT_REPLAY_FORM);

  const [models, setModels] = useState<LlmModelInfo[]>([]);
  const [groups, setGroups] = useState<LlmKeyPoolGroup[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);
  /** 仅在服务端配置加载完成后同步一次模型库选择，避免用户改选后被 form 旧值覆盖 */
  const [hydrateTick, setHydrateTick] = useState(0);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId],
  );

  const currentModelKeys = useMemo(() => {
    if (!selectedModel) return [];
    const pc = selectedModel.providerCode;
    const group =
      groups.find(
        (g) => g.modelName === selectedModel.modelName && g.provider === pc && g.modelType === 'chat',
      ) ??
      groups.find((g) => g.modelName === selectedModel.modelName && g.provider === pc) ??
      groups.find((g) => g.modelName === selectedModel.modelName && g.modelType === 'chat') ??
      groups.find((g) => g.modelName === selectedModel.modelName);
    return (group?.keys ?? []).filter((k) => k.isActive);
  }, [groups, selectedModel]);

  const loadModelLibrary = async (): Promise<void> => {
    setLibLoading(true);
    setLibError(null);
    try {
      const [modelsRes, keysRes] = await Promise.all([
        requestJson<{ items?: LlmModelInfo[] }>('/api/admin/llm-models?modelType=chat&isActive=true'),
        requestJson<{ groups?: LlmKeyPoolGroup[] }>('/api/admin/llm-keys/grouped?modelType=chat'),
      ]);
      setModels((modelsRes.items ?? []).filter((i) => i.modelType === 'chat' && i.isActive));
      setGroups(keysRes.groups ?? []);
    } catch (e) {
      setLibError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibLoading(false);
    }
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const row = await requestJson<Record<string, unknown>>('/api/v1/admin/platform-settings/replay-global-settings');
      setForm(normalizeReplayForm(row));
      setHydrateTick((t) => t + 1);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadModelLibrary();
  }, []);

  useEffect(() => {
    if (models.length === 0 || hydrateTick === 0) return;
    const mn = form.modelName.trim();
    if (!mn) return;
    const mpc = form.modelProviderCode.trim();
    const matched =
      (mpc ? models.find((m) => m.modelName === mn && m.providerCode === mpc) : undefined) ??
      models.find((m) => m.modelName === mn);
    if (matched) {
      setSelectedModelId(matched.id);
      setSelectedKeyIds(form.keyIds.map((id) => String(id).trim()).filter(Boolean));
    }
  }, [hydrateTick, models, form.modelName, form.modelProviderCode, form.keyIds]);

  const save = async (): Promise<void> => {
    if (!selectedModel) {
      messageApi.warning('请先在「模型库」中选择 Replay 使用的 chat 模型');
      return;
    }
    const unknown = selectedKeyIds.filter((id) => !currentModelKeys.some((k) => k.id === id));
    if (unknown.length > 0) {
      messageApi.error('存在不属于当前模型的 Key，请重新选择');
      return;
    }
    if (selectedKeyIds.length === 0) {
      messageApi.warning('请至少选择一个 Key（与 CEO 其他层一致）');
      return;
    }
    setSaving(true);
    try {
      await requestJson('/api/v1/admin/platform-settings/replay-global-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          mainRoomIntentInlineReplyEnabled: form.mainRoomIntentInlineReplyEnabled,
          mainRoomIntentInlineReplyMinConfidence: form.mainRoomIntentInlineReplyMinConfidence,
          ceoReplayMemoryThreshold: form.ceoReplayMemoryThreshold,
          modelName: selectedModel.modelName,
          modelProviderCode: selectedModel.providerCode,
          keyIds: selectedKeyIds,
          keySource: 'dedicated',
          llmKeyId: null,
        }),
      });
      messageApi.success('已保存并下发至各公司 CEO layer（contextPolicy.replay）');
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="erp-ceo-tab-content">
      {contextHolder}
      <Card variant="borderless" className="erp-market-table-card">
        <Title level={4} style={{ marginTop: 0 }}>
          Replay 层（Intent→replay）
        </Title>
        <Paragraph type="secondary">
          主群内经 <Text code>runMainRoomCeoReplayDelegatePhase</Text> 的 natural replay 等路径；模型与 Key 与「CEO 层配置」Tab 相同来源（平台模型库 +
          分组密钥）。保存后会写入各公司 <Text code>strategy.contextPolicy.replay</Text>
          （含 keyIds）；若在后台保存过商城 CEO 模板后发现 Replay 密钥池被清空，在本页再保存一次即可重新下发。
        </Paragraph>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="字段说明（本页每一项在做什么）"
          description={
            <Descriptions size="small" column={1} bordered style={{ marginTop: 8 }}>
              <Descriptions.Item label="Intent 内联 CEO 副本">
                开关；对应环境变量 <Text code>MAIN_ROOM_INTENT_INLINE_REPLY_ENABLED</Text>。历史上用于 Intent 自带用户可见句的早发路径；当前 Worker
                主链可不使用，仍可由平台下发供将来或实验开启。
              </Descriptions.Item>
              <Descriptions.Item label="内联最低 Intent 置信度">
                0–1；与 <Text code>MAIN_ROOM_INTENT_INLINE_REPLY_MIN_CONFIDENCE</Text> 同源。仅在内联开启且走该路径时，低于此置信度则不贴内联句。
              </Descriptions.Item>
              <Descriptions.Item label="natural replay 记忆置信阈值">
                0–1；与 <Text code>CEO_REPLAY_MEMORY_THRESHOLD</Text> 同源，下发至各公司{' '}
                <Text code>strategy.contextPolicy.replay</Text>。与进程记忆阈值及 <Text code>@service/ai</Text> 包内门控工具对齐；主群协作是否走
                Replay 委托另受进程 <Text code>CEO_REPLAY_ENABLED</Text> 与公司级 <Text code>ceoReplayEnabled</Text> 控制。
              </Descriptions.Item>
              <Descriptions.Item label="Replay 模型（模型库）">
                写入各公司 <Text code>strategy.contextPolicy.replay.modelName</Text> 与 <Text code>modelProviderCode</Text>；Worker 使用独立{' '}
                <Text code>replay</Text> CEO 层解析，不再借用 orchestration。
              </Descriptions.Item>
              <Descriptions.Item label="Replay Key（模型库）">
                写入 <Text code>contextPolicy.replay.keyIds</Text>（UUID 列表，顺序即尝试优先级）。与 L1/L2/L3 层在商城模板里保存的{' '}
                <Text code>keyIds</Text> 语义一致；调用前会插入 CEO 密钥候选池最前。
              </Descriptions.Item>
            </Descriptions>
          }
        />
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          title="与本页保存项的关系"
          description="阈值与开关写入平台库并同步到各公司 `strategy.contextPolicy.replay`；模型与 Key 亦写入同一路径。进程级总开关 CEO_REPLAY_ENABLED 仍须在部署层开启。未配置模型名时 Worker 可回落 CEO_REPLAY_MODEL_NAME。"
        />
      </Card>

      <Card variant="borderless" className="erp-market-table-card" style={{ marginTop: 16 }}>
        <div className="erp-ceo-section-title">平台默认（可下发）</div>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div className="erp-intent-global-row">
            <div>
              <div className="erp-ceo-section-title" style={{ fontSize: 14 }}>
                Intent 内联 CEO 副本
              </div>
              <div className="erp-market-agent-meta">对应 MAIN_ROOM_INTENT_INLINE_REPLY_ENABLED</div>
            </div>
            <Switch
              checked={form.mainRoomIntentInlineReplyEnabled}
              onChange={(c) => setForm((p) => ({ ...p, mainRoomIntentInlineReplyEnabled: c }))}
            />
          </div>
          <div className="erp-intent-global-row">
            <div>
              <div className="erp-ceo-section-title" style={{ fontSize: 14 }}>
                内联最低 Intent 置信度
              </div>
              <div className="erp-market-agent-meta">MAIN_ROOM_INTENT_INLINE_REPLY_MIN_CONFIDENCE（0–1）</div>
            </div>
            <InputNumber
              min={0}
              max={1}
              step={0.01}
              value={form.mainRoomIntentInlineReplyMinConfidence}
              onChange={(v) =>
                setForm((p) => ({
                  ...p,
                  mainRoomIntentInlineReplyMinConfidence:
                    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : p.mainRoomIntentInlineReplyMinConfidence,
                }))
              }
            />
          </div>
          <div className="erp-intent-global-row">
            <div>
              <div className="erp-ceo-section-title" style={{ fontSize: 14 }}>
                natural replay 记忆置信阈值
              </div>
              <div className="erp-market-agent-meta">对齐 CEO_REPLAY_MEMORY_THRESHOLD 语义（0–1）</div>
            </div>
            <InputNumber
              min={0}
              max={1}
              step={0.01}
              value={form.ceoReplayMemoryThreshold}
              onChange={(v) =>
                setForm((p) => ({
                  ...p,
                  ceoReplayMemoryThreshold:
                    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : p.ceoReplayMemoryThreshold,
                }))
              }
            />
          </div>

          <div className="erp-ceo-section-title" style={{ marginTop: 8 }}>
            Replay 模型与 Key（与「CEO 层配置」相同模型库）
          </div>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Select
                placeholder="从模型库选择 chat 模型"
                style={{ minWidth: 280, flex: 1 }}
                value={selectedModelId}
                onChange={(v) => {
                  setSelectedModelId(v);
                  setSelectedKeyIds([]);
                }}
                options={models.map((m) => ({
                  label: `${m.modelName} (${m.providerCode})`,
                  value: m.id,
                }))}
                loading={libLoading}
              />
              <Button onClick={() => void loadModelLibrary()} loading={libLoading}>
                刷新模型库
              </Button>
            </div>
            <Select
              mode="multiple"
              placeholder={selectedModel ? '选择该模型下的 Key（可多选，顺序即优先级）' : '请先选择模型'}
              style={{ width: '100%' }}
              value={selectedKeyIds}
              onChange={setSelectedKeyIds}
              disabled={!selectedModel}
              options={currentModelKeys.map((k) => ({
                label: `${k.keyAlias} (${k.id.slice(0, 8)}…)${k.isBound ? ' · 已绑定' : ''}`,
                value: k.id,
              }))}
            />
            {libLoading ? <Spin size="small" /> : null}
            {libError ? <Alert type="error" showIcon message="模型库加载失败" description={libError} /> : null}
          </Space>
        </Space>
        <div className="erp-intent-actions" style={{ marginTop: 16 }}>
          <Button onClick={() => void load()} loading={loading} disabled={saving}>
            重新加载
          </Button>
          <Button type="primary" onClick={() => void save()} loading={saving} disabled={!selectedModel}>
            保存并下发
          </Button>
        </div>
      </Card>

      <Card variant="borderless" className="erp-market-table-card" style={{ marginTop: 16 }}>
        <div className="erp-ceo-section-title">主链顺序（简）</div>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Intent">受众路由 JSON → 白名单 / summon 富化</Descriptions.Item>
          <Descriptions.Item label="导向">房内直连 或 Intent→replay</Descriptions.Item>
          <Descriptions.Item label="执行栈">replay 未命中 → Strategy → Orchestration → Supervision</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card variant="borderless" className="erp-market-table-card" style={{ marginTop: 16 }}>
        <div className="erp-ceo-section-title">部署环境变量（未被平台上文覆盖的字段仍以此为准）</div>
        <Table
          size="small"
          pagination={false}
          rowKey="key"
          columns={[
            { title: '变量', dataIndex: 'env', width: '36%', render: (t: string) => <Text code>{t}</Text> },
            { title: '作用', dataIndex: 'role' },
          ]}
          dataSource={[
            { key: '1', env: 'CEO_REPLAY_ENABLED', role: '协作 replay 进程总开关（兼 legacy 键回退）' },
            { key: '2', env: 'MAIN_ROOM_INTENT_INLINE_REPLY_*', role: '与本页「内联」两项同源；平台保存覆盖公司合并值' },
            { key: '3', env: 'CEO_REPLAY_MEMORY_THRESHOLD', role: '与本页「记忆阈值」同源；平台保存覆盖' },
            { key: '4', env: 'CEO_REPLAY_MODEL_NAME', role: '未在平台配置 replay.modelName 时的默认模型名' },
            {
              key: '5',
              env: 'CEO_REPLAY_TOOLS_ENABLED',
              role: '默认 true：replay 按需 memory.search / facts.company.query；false 仅作紧急回滚（大包预取、无委托工具）',
            },
          ]}
        />
      </Card>
    </div>
  );
}
