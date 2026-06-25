import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Alert, Button, Card, Select, Space, Spin, Switch, Typography } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { adminAuthedRequestJson } from '../../shared/api/client';

const SETTINGS_PATH = '/api/v1/admin/platform-settings/collaboration-main-chain';

type Settings = {
  COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED: boolean;
  COLLAB_DISPATCH_CONFIRM_MODE: 'auto' | 'confirm';
  MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED: boolean;
  DIRECTOR_AUTONOMOUS_ENABLED: boolean;
  EMPLOYEE_AUTONOMOUS_ENABLED: boolean;
  MULTI_AGENT_GRAPH_V2_ENABLED: boolean;
  COLLAB_SUPERVISION_INPUT_MODE: 'dept_reports' | 'inline_skill';
  COLLAB_DISPATCH_REQUIRE_DIRECTOR_DEPT_REPORT: boolean;
  MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES: boolean;
};

type CollaborationMainChainPayload = {
  settings: Settings;
  envSnippet: string;
};

const BOOLEAN_TOGGLES = [
  ['COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED', 'Dispatch Plan v2（Markdown 计划主路径）'],
  ['DIRECTOR_AUTONOMOUS_ENABLED', '部门主管自主'],
  ['EMPLOYEE_AUTONOMOUS_ENABLED', '员工自主'],
  ['MULTI_AGENT_GRAPH_V2_ENABLED', '多 Agent 图 v2'],
  ['MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED', '编排结案主群总结'],
  ['MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES', '依赖顺序派发'],
  ['COLLAB_DISPATCH_REQUIRE_DIRECTOR_DEPT_REPORT', '续派需主管部门汇报'],
] as const;

export default function CollaborationMainChainPage(): ReactElement {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [envSnippet, setEnvSnippet] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminAuthedRequestJson<CollaborationMainChainPayload>(SETTINGS_PATH);
      setSettings(data.settings);
      setEnvSnippet(data.envSnippet ?? '');
    } catch (e: unknown) {
      setSettings(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const data = await adminAuthedRequestJson<CollaborationMainChainPayload>(SETTINGS_PATH, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setSettings(data.settings);
      setEnvSnippet(data.envSnippet ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof Settings): void => {
    if (!settings) return;
    const value = settings[key];
    if (typeof value === 'boolean') {
      setSettings({ ...settings, [key]: !value });
    }
  };

  if (loading) {
    return (
      <div className="erp-page-stack" style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="erp-page-stack">
        <Alert
          type="error"
          showIcon
          message="无法加载协作主链配置"
          description={error ?? '未知错误'}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-page-stack">
      <Typography.Title level={4} style={{ margin: 0 }}>
        协作主链配置
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        平台级开关保存在数据库，为协作主链的单一事实来源。Worker 启动后会通过 RPC 自动拉取并覆盖同名 env（约 60s 轮询；Admin 保存后立即 MQ 通知刷新）。下方 env 片段仅作部署/bootstrap 回退参考。
      </Typography.Paragraph>

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} /> : null}

      {settings.COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED &&
      (!settings.DIRECTOR_AUTONOMOUS_ENABLED ||
        !settings.EMPLOYEE_AUTONOMOUS_ENABLED ||
        !settings.MULTI_AGENT_GRAPH_V2_ENABLED) ? (
        <Alert
          type="warning"
          showIcon
          message="部门自动执行可能不完整"
          description="Dispatch Plan v2 已启用，但主管/员工自主或多 Agent 图未全开。主群仍可下发部门子目标，部门内可能不会自动拆工与 Skill 执行。"
        />
      ) : null}

      <Card
        title="运行时开关"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={saving}>
              刷新
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 720 }}>
          {BOOLEAN_TOGGLES.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <Typography.Text strong>{label}</Typography.Text>
                <br />
                <Typography.Text code style={{ fontSize: 12 }}>
                  {key}
                </Typography.Text>
              </div>
              <Switch
                checked={settings[key as keyof Settings] as boolean}
                onChange={() => toggle(key as keyof Settings)}
              />
            </div>
          ))}

          <div>
            <Typography.Text strong>Dispatch Plan 下发模式</Typography.Text>
            <Select
              style={{ display: 'block', marginTop: 8, maxWidth: 480 }}
              value={settings.COLLAB_DISPATCH_CONFIRM_MODE}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  COLLAB_DISPATCH_CONFIRM_MODE: value as Settings['COLLAB_DISPATCH_CONFIRM_MODE'],
                })
              }
              options={[
                { value: 'auto', label: 'auto（编译成功后立即下发）' },
                { value: 'confirm', label: 'confirm（待用户确认再 flush）' },
              ]}
            />
          </div>

          <div>
            <Typography.Text strong>Supervision 输入模式</Typography.Text>
            <Select
              style={{ display: 'block', marginTop: 8, maxWidth: 480 }}
              value={settings.COLLAB_SUPERVISION_INPUT_MODE}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  COLLAB_SUPERVISION_INPUT_MODE: value as Settings['COLLAB_SUPERVISION_INPUT_MODE'],
                })
              }
              options={[
                { value: 'inline_skill', label: 'inline_skill（内联 Skill 执行）' },
                { value: 'dept_reports', label: 'dept_reports（主管部门汇报聚合）' },
              ]}
            />
          </div>
        </Space>
      </Card>

      <Card title="Worker env 片段（bootstrap 回退）">
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{envSnippet}</pre>
      </Card>
    </div>
  );
}
