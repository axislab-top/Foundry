import type { ReactElement } from 'react';
import { Button, Form, Input, Select, Space, Typography } from 'antd';
import type { FormInstance } from 'antd';
import {
  DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS,
  TASK_TYPE_TAG_OPTIONS,
  templateCapabilityForSlug,
  validateSummaryClient,
} from './capability-helpers';

export function DepartmentCapabilityFields(props: {
  form: FormInstance;
  slugFieldName?: string;
  showFillFromTemplate?: boolean;
}): ReactElement {
  const slugField = props.slugFieldName ?? 'slug';
  const slug = Form.useWatch(slugField, props.form);

  const fillFromTemplate = (): void => {
    const tmpl = templateCapabilityForSlug(String(slug ?? ''));
    if (!tmpl) return;
    props.form.setFieldsValue({
      responsibilitySummary: tmpl.responsibilitySummary,
      taskTypeTags: tmpl.taskTypeTags,
      excludesTaskTypeTags: tmpl.excludesTaskTypeTags,
    });
  };

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        职能描述用于编排按任务类型匹配部门；摘要至少 {DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS}{' '}
        字。任务类型标签可选，留空时创建会尝试使用契约模板默认值。
      </Typography.Paragraph>
      {props.showFillFromTemplate ? (
        <Space style={{ marginBottom: 8 }}>
          <Button size="small" onClick={fillFromTemplate} disabled={!templateCapabilityForSlug(String(slug ?? ''))}>
            从平台模板填充
          </Button>
        </Space>
      ) : null}
      <Form.Item
        label="职能摘要"
        name="responsibilitySummary"
        rules={[
          { required: true, message: '请填写职能摘要' },
          {
            validator: async (_, value) => {
              const err = validateSummaryClient(value);
              if (err) throw new Error(err);
            },
          },
        ]}
      >
        <Input.TextArea
          rows={4}
          placeholder="例如：工程部负责产品研发、工程实现、技术可行性与代码交付。"
          showCount
          maxLength={500}
        />
      </Form.Item>
      <Form.Item label="任务类型标签（可选）" name="taskTypeTags">
        <Select
          mode="tags"
          placeholder="选择或输入，如 software_delivery"
          options={TASK_TYPE_TAG_OPTIONS.map((t) => ({ value: t, label: t }))}
          tokenSeparators={[',', ' ']}
        />
      </Form.Item>
      <Form.Item label="排除任务类型（可选）" name="excludesTaskTypeTags">
        <Select
          mode="tags"
          placeholder="该部门不应承接的任务类型"
          options={TASK_TYPE_TAG_OPTIONS.map((t) => ({ value: t, label: t }))}
          tokenSeparators={[',', ' ']}
        />
      </Form.Item>
    </>
  );
}
