import type { ReactElement } from 'react';
import { Alert, Tabs, Typography } from 'antd';
import { IntentLayerConfigTab } from './intent-layer-config-tab';
import { CeoReplayConfigTab } from './ceo-replay-config-tab';
import {
  CeoL1StrategyConfigTab,
  CeoL2CoordinationConfigTab,
  CeoL3SupervisionConfigTab
} from './ceo-layers-config-tab';

const { Paragraph } = Typography;

export default function AgentMarketplaceCeoPage(): ReactElement {
  return (
    <div className="erp-page-stack">
      <Alert
        type="info"
        showIcon
        message="CEO 平台模板配置"
        description="以下 Tab 均已对接后端。运行监控类指标将纳入总览（admin/dashboard）后在本页或总览展示。"
        style={{ marginBottom: 0 }}
      />
      <Tabs
        className="erp-ceo-tabs"
        defaultActiveKey="planning"
        items={[
          {
            key: 'planning',
            label: 'IntentLayer 配置',
            children: <IntentLayerConfigTab />
          },
          {
            key: 'replay-layer',
            label: 'Replay 层配置',
            children: <CeoReplayConfigTab />
          },
          {
            key: 'l1-strategy',
            label: 'L1 战略层',
            children: <CeoL1StrategyConfigTab />
          },
          {
            key: 'l2-coordination',
            label: 'L2 协调层',
            children: <CeoL2CoordinationConfigTab />
          },
          {
            key: 'l3-supervision',
            label: 'L3 监督层',
            children: <CeoL3SupervisionConfigTab />
          }
        ]}
      />
      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
        已隐藏「基础概览」「治理与授权」：前者暂无真实监控 API，后者尚未实现。
      </Paragraph>
    </div>
  );
}
