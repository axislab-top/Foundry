import type { CeoHeartbeatRunCoordinatorOptions, CeoHeartbeatTriggerSource } from '../../tasks/ceo-heartbeat-run-coordinator.service.js';

export interface CompanyHeartbeatContext {
  companyId: string;
  tickAt: string;
  triggerSource: CeoHeartbeatTriggerSource;
  options: CeoHeartbeatRunCoordinatorOptions;
}

export interface CompanyStuckTaskSignal {
  id: string;
  possibleCause: string;
  [key: string]: unknown;
}
