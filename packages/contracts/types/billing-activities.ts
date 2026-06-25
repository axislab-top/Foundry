import { NEW_USER_REGISTRATION_CREDIT_BONUS } from './billing-units.js';

/** 平台计费活动 code（与 Admin 活动页、platform_settings 存盘一致） */
export const BILLING_ACTIVITY_CODES = {
  NEW_USER_REGISTRATION_BONUS: 'new_user_registration_bonus',
} as const;

export type BillingActivityCode =
  (typeof BILLING_ACTIVITY_CODES)[keyof typeof BILLING_ACTIVITY_CODES];

export type BillingActivity = {
  code: BillingActivityCode;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  enabled: boolean;
  creditAmount: number;
};

export type BillingActivitiesStored = Partial<
  Record<BillingActivityCode, Partial<Pick<BillingActivity, 'enabled' | 'creditAmount'>>>
>;

export const DEFAULT_BILLING_ACTIVITIES: Record<BillingActivityCode, BillingActivity> = {
  [BILLING_ACTIVITY_CODES.NEW_USER_REGISTRATION_BONUS]: {
    code: BILLING_ACTIVITY_CODES.NEW_USER_REGISTRATION_BONUS,
    title: '新用户注册赠送',
    titleEn: 'New user registration bonus',
    description: '用户注册后自动发放账号级 Credit，名下所有公司共用同一额度池。',
    descriptionEn: 'Grants account-level credit once on registration; shared across all owned companies.',
    enabled: true,
    creditAmount: NEW_USER_REGISTRATION_CREDIT_BONUS,
  },
};

export function mergeBillingActivities(stored: BillingActivitiesStored | null | undefined): BillingActivity[] {
  const raw = stored ?? {};
  return (Object.keys(DEFAULT_BILLING_ACTIVITIES) as BillingActivityCode[]).map((code) => {
    const defaults = DEFAULT_BILLING_ACTIVITIES[code];
    const patch = raw[code] ?? {};
    const creditAmount =
      typeof patch.creditAmount === 'number' && Number.isFinite(patch.creditAmount) && patch.creditAmount >= 0
        ? Math.floor(patch.creditAmount)
        : defaults.creditAmount;
    return {
      ...defaults,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : defaults.enabled,
      creditAmount,
    };
  });
}

/** 当前生效的「新用户注册赠送」额度；关闭活动或非法金额时返回 0。 */
export function resolveRegistrationBonusCredit(stored: BillingActivitiesStored | null | undefined): number {
  const activity = mergeBillingActivities(stored).find(
    (row) => row.code === BILLING_ACTIVITY_CODES.NEW_USER_REGISTRATION_BONUS,
  );
  if (!activity?.enabled) return 0;
  return activity.creditAmount;
}
