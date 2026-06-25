import { adminAuthedRequestJson } from '../../../shared/api/client';

export type BillingActivityRow = {
  code: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  enabled: boolean;
  creditAmount: number;
};

export type BillingActivitiesResponse = {
  activities: BillingActivityRow[];
  updatedAt: string | null;
};

const SETTINGS_PATH = '/api/v1/admin/platform-settings/billing-activities';

export async function listBillingActivities(): Promise<BillingActivitiesResponse> {
  return adminAuthedRequestJson<BillingActivitiesResponse>(SETTINGS_PATH);
}

export async function patchBillingActivity(payload: {
  code: string;
  enabled?: boolean;
  creditAmount?: number;
}): Promise<BillingActivitiesResponse> {
  return adminAuthedRequestJson<BillingActivitiesResponse>(SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
