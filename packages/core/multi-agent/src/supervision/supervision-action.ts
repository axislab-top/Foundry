export type SupervisionAction = 'allow' | 'warn' | 'block' | 'request-human-review';

export interface SupervisionResult {
  action: SupervisionAction;
  reason: string;
  policyRef?: string;
}
