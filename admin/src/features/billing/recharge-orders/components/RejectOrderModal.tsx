import { useEffect, type ReactElement } from 'react';
import { Form, Input, Modal } from 'antd';
import type { RechargeOrder } from '../../types';

type Props = {
  open: boolean;
  order: RechargeOrder | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (rejectReason?: string) => void;
};

export function RejectOrderModal({
  open,
  order,
  submitting,
  onCancel,
  onSubmit,
}: Props): ReactElement {
  const [form] = Form.useForm<{ rejectReason?: string }>();

  useEffect(() => {
    if (open) {
      form.resetFields();
    }
  }, [open, form]);

  return (
    <Modal
      title="拒绝购额订单"
      open={open}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then((values) => {
          onSubmit(values.rejectReason);
        });
      }}
      destroyOnClose
    >
      {order ? (
        <p style={{ marginBottom: 12, color: 'rgba(0,0,0,0.45)' }}>
          订单 {order.id.slice(0, 8)}… · {order.amount} Credit
        </p>
      ) : null}
      <Form form={form} layout="vertical">
        <Form.Item name="rejectReason" label="拒绝原因（可选）">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="填写拒绝说明" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
