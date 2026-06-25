import { useMemo, type ReactElement } from 'react';
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';

type LoginFormValues = {
  email: string;
  password: string;
};

export default function LoginPage(): ReactElement {
  const [form] = Form.useForm<LoginFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const from = useMemo(
    () => (typeof location.state?.from?.pathname === 'string' ? location.state.from.pathname : '/dashboard'),
    [location.state]
  );

  const handleSubmit = async (values: LoginFormValues): Promise<void> => {
    const result = await login(values);
    if (!result.ok) {
      messageApi.error(result.message ?? '登录失败，请重试。');
      return;
    }
    messageApi.success('登录成功');
    navigate(from, { replace: true });
  };

  return (
    <div className="erp-auth-page">
      {contextHolder}
      <Card className="erp-auth-card" variant="borderless">
        <div className="erp-auth-title-wrap">
          <Typography.Title level={3}>后台管理系统登录</Typography.Title>
          <Typography.Paragraph type="secondary">
            登录后可配置 Agent 生态、平台模型密钥、运行治理开关，并查询网关请求审计。
          </Typography.Paragraph>
        </div>
        <Alert
          type="info"
          showIcon
          className="erp-auth-demo-alert"
          title="首次使用请先注册账号；数据保存在浏览器本地。"
        />
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="管理员邮箱"
            name="email"
            rules={[{ required: true, message: '请输入管理员邮箱' }]}
          >
            <Input autoComplete="email" placeholder="请输入管理员邮箱" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="current-password" placeholder="请输入密码" />
          </Form.Item>
          <Button block type="primary" htmlType="submit">
            登录
          </Button>
        </Form>
        <Typography.Paragraph className="erp-auth-switch-tip">
          还没有账号？<Link to="/register">去注册</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
