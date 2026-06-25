import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Col, Input, Row, Space, Table, Typography } from "antd";
import { adminAuthedRequestJson } from "../../shared/api/client";

const { Paragraph, Text } = Typography;

type FlagRow = { key: string; label: string; env: string; description: string };

const PHASE3_FLAG_ROWS: FlagRow[] = [
  { key: "p3_master", label: "Phase3 总闸", env: "PHASE3_ROLLOUT_ENABLED", description: "渐进 cohort 总开关（默认 false）" },
  { key: "p3_cost", label: "成本感知路由", env: "COST_AWARE_ROUTING_ENABLED", description: "Worker / API 对齐" },
  { key: "p3_graph", label: "Memory Graph V2", env: "MEMORY_GRAPH_V2_ENABLED", description: "API 图检索与 Worker 门控" },
  { key: "p3_cross", label: "跨部门协调", env: "CROSS_DEPARTMENT_COORDINATION_ENABLED", description: "L2 Graph 协调" },
  { key: "p3_bus", label: "领域事件总线 V2", env: "AUTONOMOUS_EVENT_BUS_V2_ENABLED", description: "出站 domain / 入站 v2" },
  { key: "p3_mg", label: "Multi-Agent Graph V2", env: "MULTI_AGENT_GRAPH_V2_ENABLED", description: "动态子图" },
  { key: "p3_dir", label: "Director 自主", env: "DIRECTOR_AUTONOMOUS_ENABLED", description: "部门 Director" },
  { key: "p3_emp", label: "Employee 自主", env: "EMPLOYEE_AUTONOMOUS_ENABLED", description: "员工提议子任务" },
];

type DashboardPayload = {
  phase3?: Record<string, unknown>;
};

export default function Phase3RolloutPage(): ReactElement {
  const columns = useMemo(
    () => [
      { title: "能力", dataIndex: "label", key: "label" },
      { title: "环境变量", dataIndex: "env", key: "env", render: (v: string) => <Text code>{v}</Text> },
      { title: "说明", dataIndex: "description", key: "description" },
    ],
    [],
  );

  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardPayload | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const cid = companyId.trim();
      const headers: Record<string, string> = {};
      if (cid) headers["x-company-id"] = cid;
      const payload = await adminAuthedRequestJson<DashboardPayload>("/v1/dashboard", { headers });
      setSnapshot(payload);
    } catch (e: unknown) {
      setSnapshot(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="erp-page-stack">
      <Alert
        type="info"
        showIcon
        message="Phase 3 灰度与培训"
        description={
          <>
            下表为只读对照清单；实际生效以部署环境变量与 runtime_preferences 为准。数据库侧协作开关请使用{' '}
            <Link to="/agent-ecosystem/collaboration-main-chain">协作主链开关</Link>；总览见{' '}
            <Link to="/dashboard">平台总览</Link>。
          </>
        }
        className="mb-4"
      />
      <Card title="Phase 3 子特性一览（只读）" size="small" className="mb-4">
        <Table columns={columns} dataSource={PHASE3_FLAG_ROWS} rowKey="key" size="small" pagination={false} />
      </Card>
      <Card title="服务器 phase3 摘要（GET /v1/dashboard）" size="small">
        <Paragraph className="text-xs text-gray-600">
          需要 Admin 已登录；可选填写 company UUID 作为 <Text code>x-company-id</Text>。
        </Paragraph>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Space.Compact style={{ width: "100%" }}>
              <Input placeholder="companyId (UUID) 可选" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
              <Button type="primary" loading={loading} onClick={() => void load()}>
                加载
              </Button>
            </Space.Compact>
          </Col>
        </Row>
        {err ? (
          <Paragraph className="mt-2 text-xs text-red-600">
            <Text type="danger">{err}</Text>
          </Paragraph>
        ) : null}
        {snapshot?.phase3 ? (
          <pre className="mt-3 max-h-96 overflow-auto rounded border bg-gray-50 p-2 text-[11px]">
            {JSON.stringify(snapshot.phase3, null, 2)}
          </pre>
        ) : null}
      </Card>
    </div>
  );
}
