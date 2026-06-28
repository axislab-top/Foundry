import { createHash } from 'crypto';
import type { CompanyStateSnapshot } from './dto/company-heartbeat-context.dto.js';

/** 稳定快照指纹（不含 tickAt），用于判断公司运营计数是否变化。 */
export function computeHeartbeatStateFingerprint(snapshot: CompanyStateSnapshot): string {
  const payload = {
    tasks: {
      pending: snapshot.tasks.pending,
      inProgress: snapshot.tasks.inProgress,
      review: snapshot.tasks.review,
      blocked: snapshot.tasks.blocked,
    },
    approvals: { pending: snapshot.approvals.pending },
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
