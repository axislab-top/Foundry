import { useCallback, useState, type ReactElement } from 'react';
import { Alert, Button, Input, Space, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { defaultSkillMdTemplate } from '../skillMdTemplate';

type SkillMdEditorProps = {
  value: string;
  onChange: (next: string) => void;
  onValidate?: (raw: string) => Promise<{ ok: boolean; issues: Array<{ field: string; message: string }> }>;
  minRows?: number;
  readOnly?: boolean;
};

export function SkillMdEditor({
  value,
  onChange,
  onValidate,
  minRows = 22,
  readOnly = false
}: SkillMdEditorProps): ReactElement {
  const [validating, setValidating] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [validationOk, setValidationOk] = useState<boolean | null>(null);

  const runValidate = useCallback(async (): Promise<void> => {
    if (!onValidate) return;
    setValidating(true);
    setValidationMsg(null);
    try {
      const res = await onValidate(value);
      setValidationOk(res.ok);
      if (!res.ok) {
        setValidationMsg(res.issues.map((i) => `${i.field}: ${i.message}`).join('\n'));
      } else {
        setValidationMsg('SKILL.md 校验通过');
      }
    } catch (e: unknown) {
      setValidationOk(false);
      setValidationMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  }, [onValidate, value]);

  return (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        按 AgentSkills / OpenClaw 规范编辑完整 SKILL.md。正文（frontmatter 下方）会写入运行时的 prompt_template；不要在别处重复填写
        System Prompt。
      </Typography.Paragraph>
      {!readOnly ? (
        <Space wrap>
          <Button size="small" onClick={() => onChange(defaultSkillMdTemplate())}>
            插入模板
          </Button>
          <Upload
            accept=".md,text/markdown"
            showUploadList={false}
            beforeUpload={(file) => {
              const reader = new FileReader();
              reader.onload = () => {
                const text = typeof reader.result === 'string' ? reader.result : '';
                if (text.trim()) onChange(text);
              };
              reader.readAsText(file);
              return false;
            }}
          >
            <Button size="small" icon={<UploadOutlined />}>
              上传 SKILL.md
            </Button>
          </Upload>
          {onValidate ? (
            <Button size="small" loading={validating} onClick={() => void runValidate()}>
              校验
            </Button>
          ) : null}
        </Space>
      ) : null}
      {validationMsg ? (
        <Alert type={validationOk ? 'success' : 'error'} showIcon message={validationMsg} />
      ) : null}
      <Input.TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        rows={minRows}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 13 }}
        placeholder="---&#10;name: my-skill&#10;description: ...&#10;---&#10;&#10;# Instructions"
      />
    </Space>
  );
}
