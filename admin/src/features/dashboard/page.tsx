import type { ReactElement } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Col, Input, Row, Space, Statistic, Typography } from 'antd';
import { adminAuthedRequestJson } from '../../shared/api/client';

const { Text, Paragraph, Title } = Typography;

type DashboardPayload = {
  phase3?: {
    rollout: {
      masterEnabled: boolean;
      cohortMember: boolean;
      percent: number;
      heartbeatPercentOverride?: number | null;
    };
    memoryGraph: { processEnabled: boolean; effectiveForCompany: boolean };
    slo: { targets: Record<string, number>; signals: Record<string, unknown> };
  };
  costAwareMetrics?: { enabled: boolean; tokenSavingsRateApprox?: number | null };
};

const PLANNED_CAPABILITIES = [
  { title: '租户与企业空间', desc: '企业列表、工作区指标、运行时类与导出（API 已就绪，界面待建设）' },
  { title: '业务审批工作台', desc: '高风险操作审批流（密钥轮换、Skill 发布等）' },
  { title: '平台运维与告警', desc: '集群快照、成本摘要、告警处置' },
  { title: '业务操作审计', desc: '与当前「网关 HTTP 审计」互补的配置变更留痕' },
];

function Phase3OpsCard(): ReactElement {
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    try {
      const cid = companyId.trim();
      const headers: Record<string, string> = {};
      if (cid) headers['x-company-id'] = cid;
      const payload = await adminAuthedRequestJson<DashboardPayload>('/v1/dashboard', { headers });
      setData(payload);
    } catch (e: unknown) {
      setData(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const p3 = data?.phase3;

  return (
    <Card title="Phase 3 运行快照（真实数据）" size="small">
      <Paragraph type="secondary" style={{ marginBottom: 8 }}>
        来源：<Text code>GET /v1/dashboard</Text> → <Text code>phase3</Text> /{' '}
        <Text code>costAwareMetrics</Text>。可选填写企业 UUID 作为 <Text code>x-company-id</Text>。
      </Paragraph>
      <Space wrap>
        <Input
          placeholder="企业 companyId（UUID，可选）"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <Button type="primary" loading={loading} onClick={() => void load()}>
          加载
        </Button>
        <Link to="/rollout/phase3">
          <Button>查看 Phase 3 环境变量对照表</Button>
        </Link>
        <Link to="/agent-ecosystem/collaboration-main-chain">
          <Button>协作主链开关</Button>
        </Link>
      </Space>
      {err ? (
        <Paragraph type="danger" style={{ marginTop: 8, marginBottom: 0 }}>
          {err}
        </Paragraph>
      ) : null}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Statistic
            title="成本节省率（近似）"
            value={data?.costAwareMetrics?.tokenSavingsRateApprox ?? '—'}
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
        <Col xs={24} md={8}>
          <Statistic
            title="Phase3 灰度 cohort"
            value={
              p3?.rollout?.cohortMember === undefined ? '—' : p3.rollout.cohortMember ? '是' : '否'
            }
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
        <Col xs={24} md={8}>
          <Statistic
            title="Memory Graph 对企业生效"
            value={
              p3?.memoryGraph?.effectiveForCompany === undefined
                ? '—'
                : p3.memoryGraph.effectiveForCompany
                  ? '是'
                  : '否'
            }
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
      </Row>
    </Card>
  );
}

export default function DashboardPage(): ReactElement {
  return (
    <div className="erp-page-stack">
      <Title level={4} style={{ margin: 0 }}>
        平台总览
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        本页仅展示已接入后端的数据。租户治理、审批与业务监控等指标将在对应模块上线后出现在此处。
      </Paragraph>

      <Alert
        type="info"
        showIcon
        message="当前后台定位"
        description="以 Agent 生态配置（市场模板、模型密钥、Skills/Tools/MCP、IntentLayer）为主；运行治理类开关见侧栏「运行治理」。"
      />

      <Phase3OpsCard />

      <Card title="规划中的总览能力" size="small">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {PLANNED_CAPABILITIES.map((item) => (
            <div key={item.title}>
              <Text strong>{item.title}</Text>
              <br />
              <Text type="secondary">{item.desc}</Text>
            </div>
          ))}
        </Space>
      </Card>
    </div>
  );
}
