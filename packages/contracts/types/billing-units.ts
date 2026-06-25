/** 产品定价：1 元人民币 = 1,000,000 Credit；入账与预算均以 Credit 计 */
export const CREDITS_PER_RMB = 1_000_000;

/** 新注册用户账号级赠送额度（Credit，仅发放一次，多公司共用） */
export const NEW_USER_REGISTRATION_CREDIT_BONUS = 1_000_000;

/** 非首家公司默认公司预算行占位（实际门控走账号 Credit 池） */
export const DEFAULT_COMPANY_BUDGET_CREDIT = 0;

/** 前后端展示用汇率说明 */
export const BILLING_CREDIT_RATE_HINT = '1,000,000 Credit = ¥1';

export function formatCredit(credit: number): string {
  return `${credit.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} Credit`;
}

export function formatRmbFromCredit(credit: number): string {
  const rmb = credit / CREDITS_PER_RMB;
  return `¥${rmb.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export function creditFromRmb(rmb: number): number {
  if (!Number.isFinite(rmb)) return 0;
  return Math.round(rmb * CREDITS_PER_RMB);
}

export function rmbFromCredit(credit: number): number {
  if (!Number.isFinite(credit)) return 0;
  return Math.round((credit / CREDITS_PER_RMB) * 1_000_000) / 1_000_000;
}

/** Admin：model_pricing 存 Credit/百万 tokens，表单展示 ¥/百万 tokens */
export function yuanPerMillionTokensFromCatalogCredits(creditsPerMillion: number): number {
  return rmbFromCredit(creditsPerMillion);
}

export function catalogCreditsPerMillionFromYuan(yuanPerMillion: number): number {
  return creditFromRmb(yuanPerMillion);
}

/**
 * 新公司预算行占位（Credit）：不再按公司发放注册赠送；账号池在 user.created 时一次性发放。
 * 显式 initialBudget 仍写入公司字段供展示，但不作为账号门控来源。
 */
export function resolveNewCompanyBudgetCredit(params: {
  initialBudgetRaw: string | number | null | undefined;
  isFirstOwnedCompany: boolean;
  registrationBonusCredit?: number;
}): number {
  void params.isFirstOwnedCompany;
  void params.registrationBonusCredit;
  const raw = params.initialBudgetRaw;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    const explicit = parseFloat(String(raw));
    if (Number.isFinite(explicit) && explicit >= 0) {
      return explicit;
    }
  }
  return DEFAULT_COMPANY_BUDGET_CREDIT;
}
