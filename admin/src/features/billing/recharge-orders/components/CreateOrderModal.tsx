import { useEffect, useMemo, type ReactElement } from 'react';
import { Form, Input, InputNumber, Modal, Radio, Select, Typography } from 'antd';
import {
  BILLING_CREDIT_RATE_HINT,
  creditFromRmb,
  formatRmbFromCredit,
  rmbFromCredit,
} from '../../constants';
import type { CompanyOption } from '../../types';

export type CreateOrderFormValues = {
  amountCredit: number;
  applyNote?: string;
  idempotencyKey?: string;
  mode: 'instant' | 'approval';
};

type CreateOrderFormFields = CreateOrderFormValues & {
  companyId: string;
  amountRmb?: number;
};

type Props = {
  open: boolean;
  companies: CompanyOption[];
  companyId?: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (companyId: string, values: CreateOrderFormValues) => void;
};

export function CreateOrderModal({
  open,
  companies,
  companyId: initialCompanyId,
  submitting,
  onCancel,
  onSubmit,
}: Props): ReactElement {
  const [form] = Form.useForm<CreateOrderFormFields>();

  const creditWatch = Form.useWatch('amountCredit', form);

  const rmbHint = useMemo(() => {
    const c = typeof creditWatch === 'number' ? creditWatch : 0;
    return formatRmbFromCredit(c);
  }, [creditWatch]);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        companyId: initialCompanyId,
        mode: 'instant',
        amountCredit: 10_000_000,
        amountRmb: 10,
      });
    }
  }, [open, form, initialCompanyId]);

  const syncRmbFromCredit = (credit: number | null): void => {
    if (credit == null || !Number.isFinite(credit)) return;
    form.setFieldValue('amountRmb', rmbFromCredit(credit));
  };

  const syncCreditFromRmb = (rmb: number | null): void => {
    if (rmb == null || !Number.isFinite(rmb)) return;
    form.setFieldValue('amountCredit', creditFromRmb(rmb));
  };

  return (
    <Modal
      title="代录购额"
      open={open}
      width={520}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then((values) => {
          onSubmit(values.companyId, {
            amountCredit: values.amountCredit,
            applyNote: values.applyNote,
            idempotencyKey: values.idempotencyKey,
            mode: values.mode,
          });
        });
      }}
      destroyOnClose
    >
      <Form form={form} layout="vertical" initialValues={{ mode: 'instant' }}>
        <Form.Item
          label="公司"
          name="companyId"
          rules={[{ required: true, message: '请选择公司' }]}
        >
          <Select
            showSearch
            placeholder="选择入账公司"
            optionFilterProp="label"
            options={companies.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </Form.Item>
          <Form.Item label="到账模式" name="mode" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="instant">即时入账（无需审批，Credit 立即到账）</Radio>
              <Radio value="approval">待审批（需 Admin 确认后入账）</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            label="Credit 数量"
            name="amountCredit"
            rules={[{ required: true, message: '请输入 Credit 数量' }]}
          >
            <InputNumber
              min={0.0001}
              style={{ width: '100%' }}
              onChange={(v) => syncRmbFromCredit(typeof v === 'number' ? v : null)}
            />
          </Form.Item>
          <Form.Item label="约合人民币" name="amountRmb">
            <InputNumber
              min={0.01}
              prefix="¥"
              style={{ width: '100%' }}
              onChange={(v) => syncCreditFromRmb(typeof v === 'number' ? v : null)}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            汇率 {BILLING_CREDIT_RATE_HINT} · 当前约 {rmbHint}
          </Typography.Text>
          <Form.Item label="备注" name="applyNote">
            <Input.TextArea rows={2} placeholder="合同号、打款说明等" />
          </Form.Item>
          <Form.Item label="幂等键" name="idempotencyKey">
            <Input placeholder="可选，防重复提交" maxLength={128} />
          </Form.Item>
      </Form>
    </Modal>
  );
}
