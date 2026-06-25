import {
  BILLING_ACTIVITY_CODES,
  mergeBillingActivities,
  resolveRegistrationBonusCredit,
} from './billing-activities.js';
import { NEW_USER_REGISTRATION_CREDIT_BONUS } from './billing-units.js';

describe('billing activities', () => {
  it('merges defaults when storage is empty', () => {
    const rows = mergeBillingActivities({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe(BILLING_ACTIVITY_CODES.NEW_USER_REGISTRATION_BONUS);
    expect(rows[0]?.enabled).toBe(true);
    expect(rows[0]?.creditAmount).toBe(NEW_USER_REGISTRATION_CREDIT_BONUS);
  });

  it('returns zero when registration bonus is disabled', () => {
    expect(
      resolveRegistrationBonusCredit({
        [BILLING_ACTIVITY_CODES.NEW_USER_REGISTRATION_BONUS]: { enabled: false },
      }),
    ).toBe(0);
  });

  it('uses overridden credit amount when enabled', () => {
    expect(
      resolveRegistrationBonusCredit({
        [BILLING_ACTIVITY_CODES.NEW_USER_REGISTRATION_BONUS]: {
          enabled: true,
          creditAmount: 1_200_000,
        },
      }),
    ).toBe(1_200_000);
  });
});
