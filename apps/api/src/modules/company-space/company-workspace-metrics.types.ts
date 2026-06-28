import type { WarmPoolHealth } from './company-workspace-metrics.util.js';

/** P18：admin-system 公司空间仪表盘聚合 DTO（Gateway → API RPC）。 */
export type CompanyWorkspaceMetrics = {
  companyId: string;
  execMode: string;
  namespace: string;
  warmPool: {
    enabled: boolean;
    currentIdle: number;
    target: number;
    health: WarmPoolHealth;
    /** 与 `health` 同值；前端描边/色条直接绑定，避免重复阈值逻辑 */
    healthColor: WarmPoolHealth;
    reconcileIntervalMs?: number;
    effectiveReconcileTimerMs?: number;
    eventDrivenWarmPool?: boolean;
    lastReconcileAt: string | null;
    idleJobCount: number;
    idleJobs: Array<{
      name: string;
      phase: string | null;
      creationTimestamp: string | null;
      activePods: number | null;
      runtimeKind?: 'gvisor' | 'firecracker' | null;
    }>;
  };
  snapshots: {
    total: number;
    /** 0–1；无审计样本时为 null */
    successRate: number | null;
    lastRestoreAt: string | null;
    latestSnapshotName: string | null;
    latestSnapshotReadyToUse: boolean | null;
  };
  costTrend: Array<{ date: string; cost: string }>;
  /** P19：Runner RuntimeClass（gVisor / Firecracker）租户偏好与集群默认 */
  runtime: {
    clusterDefaultRuntimeKind: 'gvisor' | 'firecracker';
    /** 无行或未覆盖时为 null，表示继承集群默认 */
    companyStoredKind: 'gvisor' | 'firecracker' | null;
    effectiveRuntimeKind: 'gvisor' | 'firecracker';
    gvisorRuntimeClassName: string;
    firecrackerRuntimeClassName: string | null;
    firecrackerPlacementConfigured: boolean;
  };
};
