import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Alert, Button, Collapse, Descriptions, Form, Input, Modal, Select, Spin, Typography, message } from 'antd';
import { adminAuthedRequestJson } from '../../../shared/api/client';

export type MarketplaceAgentTestKeyOption = {
  llmKeyId: string;
  keyAlias?: string;
  modelName?: string;
  provider?: string;
  isActive?: boolean;
};

type TestInvokeResult = {
  ok: true;
  reply: string;
  modelName: string;
  boundModelName: string | null;
  llmKeyId: string;
  keyAlias: string;
  provider: string;
  durationMs: number;
  upstreamDurationMs: number;
  recommendedSkills: string[];
  systemPromptUsed: boolean;
  agentName: string;
  debug: {
    requestEndpoint: string;
    requestBody: Record<string, unknown>;
    responseBody: unknown;
    httpStatus: number;
    systemPrompt: string;
    userMessage: string;
  };
};

type Props = {
  open: boolean;
  agentId: string;
  agentName?: string;
  boundModelName?: string | null;
  keyBindings?: MarketplaceAgentTestKeyOption[];
  onClose: () => void;
};

type FormValues = {
  message: string;
  llmKeyId?: string;
};

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function copyText(text: string, label: string): void {
  void navigator.clipboard
    .writeText(text)
    .then(() => message.success(`已复制${label}`))
    .catch(() => message.error('复制失败'));
}

export function MarketplaceAgentTestModal({
  open,
  agentId,
  agentName,
  boundModelName,
  keyBindings,
  onClose,
}: Props): ReactElement {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [result, setResult] = useState<TestInvokeResult | null>(null);
  const [resolvedKeys, setResolvedKeys] = useState<MarketplaceAgentTestKeyOption[]>(keyBindings ?? []);

  const keyOptions = useMemo(
    () =>
      resolvedKeys
        .filter((k) => k.isActive !== false)
        .map((k) => ({
          value: k.llmKeyId,
          label: `${k.keyAlias ?? k.llmKeyId.slice(0, 8)} · ${k.modelName ?? '?'} (${k.provider ?? '?'})`,
        })),
    [resolvedKeys],
  );

  useEffect(() => {
    if (!open) {
      setResult(null);
      form.resetFields();
      return;
    }
    form.setFieldsValue({
      message: '请用一句话介绍你能为公司做什么。',
    });
    if (keyBindings?.length) {
      setResolvedKeys(keyBindings);
      return;
    }
    void (async () => {
      try {
        setLoadingDetail(true);
        const detail = await adminAuthedRequestJson<{
          name: string;
          boundModelName: string | null;
          keyBindings?: Array<{
            llmKeyId: string;
            keyAlias?: string;
            modelName?: string;
            provider?: string;
            isActive?: boolean;
          }>;
        }>(`/api/admin/marketplace/agents/${agentId}`);
        setResolvedKeys(
          (detail.keyBindings ?? []).map((b) => ({
            llmKeyId: b.llmKeyId,
            keyAlias: b.keyAlias,
            modelName: b.modelName,
            provider: b.provider,
            isActive: b.isActive,
          })),
        );
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [open, agentId, keyBindings, form]);

  const runTest = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setResult(null);
      const res = await adminAuthedRequestJson<TestInvokeResult>(
        `/api/admin/marketplace/agents/${agentId}/test-invoke`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: values.message,
            llmKeyId: values.llmKeyId,
          }),
        },
      );
      setResult(res);
      message.success(`调用成功（总耗时 ${res.durationMs}ms，上游 ${res.upstreamDurationMs}ms）`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const debugRequestText = result
    ? formatJson({
        method: 'POST',
        endpoint: result.debug.requestEndpoint,
        body: result.debug.requestBody,
      })
    : '';

  const debugResponseText = result ? formatJson(result.debug.responseBody) : '';

  return (
    <Modal
      title={`试调用 · ${agentName ?? agentId}`}
      open={open}
      onCancel={onClose}
      onOk={() => void runTest()}
      okText="发送测试"
      confirmLoading={loading}
      width={720}
      destroyOnClose
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="管理端试调用"
        description="使用模板 systemPrompt + 已绑定 Key/模型直接对话，无需安装到公司组织树。不会执行 Skill 工具链，仅验证提示词与模型配置。"
      />
      {loadingDetail ? (
        <Spin style={{ display: 'block', margin: '24px auto' }} />
      ) : (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="绑定模型">{boundModelName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="可用 Key">{keyOptions.length}</Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item
              name="message"
              label="测试消息"
              rules={[{ required: true, message: '请输入测试消息' }]}
            >
              <Input.TextArea rows={4} placeholder="输入你想对该员工说的话…" maxLength={8000} showCount />
            </Form.Item>
            <Form.Item name="llmKeyId" label="指定 Key（可选，默认自动选择）">
              <Select
                allowClear
                placeholder={keyOptions.length ? '自动选择匹配模型的 Key' : '请先绑定 Key'}
                options={keyOptions}
                disabled={!keyOptions.length}
              />
            </Form.Item>
          </Form>
          {loading ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
              message="正在调用上游 LLM…"
              description="试调用超时上限 90 秒。若长时间无响应，可在下方「请求详情」展开后查看完整请求体，或检查 Key/模型/网络。"
            />
          ) : null}
          {result ? (
            <div style={{ marginTop: 16 }}>
              <Descriptions size="small" column={2} style={{ marginBottom: 8 }}>
                <Descriptions.Item label="模型">{result.modelName}</Descriptions.Item>
                <Descriptions.Item label="Key">{result.keyAlias}</Descriptions.Item>
                <Descriptions.Item label="总耗时">{result.durationMs} ms</Descriptions.Item>
                <Descriptions.Item label="上游耗时">{result.upstreamDurationMs} ms</Descriptions.Item>
                <Descriptions.Item label="HTTP">{result.debug.httpStatus}</Descriptions.Item>
                <Descriptions.Item label="Provider">{result.provider}</Descriptions.Item>
              </Descriptions>
              {!result.systemPromptUsed ? (
                <Typography.Text type="warning">未配置 systemPrompt，已使用默认兜底提示词</Typography.Text>
              ) : null}
              <Typography.Paragraph strong style={{ marginTop: 12, marginBottom: 4 }}>
                模型回复
              </Typography.Paragraph>
              <Input.TextArea
                readOnly
                rows={6}
                value={result.reply}
                style={{ fontFamily: 'inherit' }}
              />
              {result.recommendedSkills.length > 0 ? (
                <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                  推荐技能（试调用不执行）：{result.recommendedSkills.join(', ')}
                </Typography.Paragraph>
              ) : null}
              <Collapse
                style={{ marginTop: 12 }}
                items={[
                  {
                    key: 'systemPrompt',
                    label: `System Prompt（${result.debug.systemPrompt.length} 字符）`,
                    children: (
                      <>
                        <Button size="small" onClick={() => copyText(result.debug.systemPrompt, ' System Prompt')}>
                          复制
                        </Button>
                        <Input.TextArea
                          readOnly
                          rows={8}
                          value={result.debug.systemPrompt}
                          style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </>
                    ),
                  },
                  {
                    key: 'request',
                    label: '请求详情（POST body，不含 API Key）',
                    children: (
                      <>
                        <Button size="small" onClick={() => copyText(debugRequestText, '请求详情')}>
                          复制 JSON
                        </Button>
                        <Input.TextArea
                          readOnly
                          rows={12}
                          value={debugRequestText}
                          style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </>
                    ),
                  },
                  {
                    key: 'response',
                    label: '上游原始响应（完整 JSON）',
                    children: (
                      <>
                        <Button size="small" onClick={() => copyText(debugResponseText, '响应详情')}>
                          复制 JSON
                        </Button>
                        <Input.TextArea
                          readOnly
                          rows={14}
                          value={debugResponseText}
                          style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </>
                    ),
                  },
                ]}
              />
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
