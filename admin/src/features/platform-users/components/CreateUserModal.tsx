import { useEffect, type ReactElement } from 'react';
import { Form, Input, Modal, Switch } from 'antd';
import type { CreatePlatformUserPayload } from '../types';

export type CreateUserFormValues = {
  username: string;
  email: string;
  password: string;
  enabled: boolean;
};

type CreateUserModalProps = {
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CreatePlatformUserPayload) => Promise<void>;
};

export function CreateUserModal({
  open,
  submitting,
  onCancel,
  onSubmit,
}: CreateUserModalProps): ReactElement {
  const [form] = Form.useForm<CreateUserFormValues>();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ enabled: true });
    }
  }, [open, form]);

  const handleOk = async (): Promise<void> => {
    const values = await form.validateFields();
    await onSubmit({
      username: values.username.trim(),
      email: values.email.trim(),
      password: values.password,
      enabled: values.enabled,
    });
  };

  return (
    <Modal
      title="新建平台用户"
      open={open}
      okText="创建"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      onCancel={onCancel}
      onOk={() => void handleOk().catch(() => undefined)}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="username"
          label="用户名"
          rules={[
            { required: true, message: '请输入用户名' },
            { min: 3, message: '用户名至少 3 位' },
            { max: 100, message: '用户名最多 100 位' },
          ]}
        >
          <Input placeholder="3–100 字符" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="email"
          label="邮箱"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input placeholder="user@example.com" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label="初始密码"
          rules={[
            { required: true, message: '请输入初始密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="enabled" label="启用账号" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="禁用" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
