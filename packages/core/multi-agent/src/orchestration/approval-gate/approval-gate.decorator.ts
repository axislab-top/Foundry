import { SetMetadata } from '@nestjs/common';
import { RiskLevel } from '../../contracts/approval.contract.js';
import { REQUIRE_APPROVAL, type RequireApprovalOptions } from './types.js';

export const RequireApproval = (options: RequireApprovalOptions = {}) =>
  SetMetadata(REQUIRE_APPROVAL, {
    riskLevel: options.riskLevel ?? RiskLevel.HIGH,
    action: options.action,
    policyRef: options.policyRef,
  } satisfies RequireApprovalOptions);
