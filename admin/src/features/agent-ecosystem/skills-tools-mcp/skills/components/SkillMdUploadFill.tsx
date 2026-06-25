import { UploadOutlined } from '@ant-design/icons';
import { Button, Space, Typography, Upload } from 'antd';
import { useState, type ReactElement } from 'react';

export type SkillMdParsedPayload = {
  name: string;
  displayName: string;
  description: string;
  promptTemplate: string;
  implementationType?: string;
  category?: string[] | null;
};

type SkillMdUploadFillProps = {
  onApply: (payload: SkillMdParsedPayload) => void;
  onParse: (raw: string) => Promise<{
    issues: Array<{ field: string; message: string }>;
    payload?: SkillMdParsedPayload;
  }>;
  onError: (message: string) => void;
};

export function SkillMdUploadFill({ onApply, onParse, onError }: SkillMdUploadFillProps): ReactElement {
  const [loading, setLoading] = useState(false);

  return (
    <Space orientation="vertical" size={6} style={{ width: '100%' }}>
      <Typography.Text type="secondary">
        上传 AgentSkills 格式的 SKILL.md 可自动填充下方表单（name、description、指令正文等）。也可手动填写。
      </Typography.Text>
      <Upload
        accept=".md,text/markdown"
        showUploadList={false}
        disabled={loading}
        beforeUpload={(file) => {
          setLoading(true);
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const text = typeof reader.result === 'string' ? reader.result : '';
              if (!text.trim()) {
                onError('文件为空');
                return;
              }
              const res = await onParse(text);
              if (res.issues?.length || !res.payload) {
                onError(res.issues?.map((i) => `${i.field}: ${i.message}`).join('; ') || '解析失败');
                return;
              }
              onApply(res.payload);
            } catch (e: unknown) {
              onError(e instanceof Error ? e.message : String(e));
            } finally {
              setLoading(false);
            }
          };
          reader.onerror = () => {
            setLoading(false);
            onError('读取文件失败');
          };
          reader.readAsText(file);
          return false;
        }}
      >
        <Button icon={<UploadOutlined />} loading={loading}>
          上传 SKILL.md 填充表单
        </Button>
      </Upload>
    </Space>
  );
}
