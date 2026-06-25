import type { ReactElement } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';

type RegisterFormValues = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterPage(): ReactElement {
  const [form] = Form.useForm<RegisterFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleSubmit = async (values: RegisterFormValues): Promise<void> => {
    const result = await register({
      username: values.username,
      email: values.email,
      password: values.password
    });
    if (!result.ok) {
      messageApi.error(result.message ?? '注册失败，请重试。');
      return;
    }
    messageApi.success('注册成功，请登录');
    navigate('/login', { replace: true });
  };

  return (
    <div className="erp-auth-page">
      {contextHolder}
      <Card className="erp-auth-card" variant="borderless">
        <div className="erp-auth-title-wrap">
          <Typography.Title level={3}>创建后台管理账号</Typography.Title>
          <Typography.Paragraph type="secondary">
            创建后可用于登录后台管理系统。
          </Typography.Paragraph>
        </div>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 位' }
            ]}
          >
            <Input autoComplete="username" placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            label="管理员邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入管理员邮箱' },
              { type: 'email', message: '请输入有效邮箱地址' }
            ]}
          >
            <Input autoComplete="email" placeholder="请输入管理员邮箱" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' }
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次密码输入不一致'));
                }
              })
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="请再次输入密码" />
          </Form.Item>
          <Button block type="primary" htmlType="submit">
            注册
          </Button>
        </Form>
        <Typography.Paragraph className="erp-auth-switch-tip">
          已有账号？<Link to="/login">去登录</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
