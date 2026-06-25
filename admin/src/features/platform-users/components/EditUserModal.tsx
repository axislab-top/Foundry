import { useEffect, type ReactElement } from 'react';
import { Form, Input, Modal, Switch } from 'antd';
import type { PlatformUser, UpdatePlatformUserPayload } from '../types';

export type EditUserFormValues = {
  username: string;
  email: string;
  enabled: boolean;
};

type EditUserModalProps = {
  open: boolean;
  user: PlatformUser | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: UpdatePlatformUserPayload) => Promise<void>;
};

export function EditUserModal({
  open,
  user,
  submitting,
  onCancel,
  onSubmit,
}: EditUserModalProps): ReactElement {
  const [form] = Form.useForm<EditUserFormValues>();

  useEffect(() => {
    if (open && user) {
      form.setFieldsValue({
        username: user.username,
        email: user.email,
        enabled: user.enabled,
      });
    }
  }, [open, user, form]);

  const handleOk = async (): Promise<void> => {
    const values = await form.validateFields();
    await onSubmit({
      username: values.username.trim(),
      email: values.email.trim(),
      enabled: values.enabled,
    });
  };

  return (
    <Modal
      title={user ? `编辑用户：${user.username}` : '编辑用户'}
      open={open}
      okText="保存"
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
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="email"
          label="邮箱"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name="enabled" label="启用账号" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="禁用" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
