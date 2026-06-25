import { apiClient } from "@/shared/api/client";
import {
  mapDailyBriefResponse,
  type DailyBriefApiResponse,
  type DailyBriefViewModel,
} from "./daily-brief-types";

type GatewaySuccess<T> = { success: true; data: T; timestamp?: string };

function unwrapDailyBrief(raw: unknown): DailyBriefApiResponse {
  if (raw && typeof raw === "object" && "success" in raw && (raw as GatewaySuccess<DailyBriefApiResponse>).success) {
    return (raw as GatewaySuccess<DailyBriefApiResponse>).data;
  }
  return raw as DailyBriefApiResponse;
}

export async function fetchDailyBrief(): Promise<DailyBriefViewModel> {
  const { data } = await apiClient.get<DailyBriefApiResponse | GatewaySuccess<DailyBriefApiResponse>>(
    "/api/v1/daily-brief",
  );
  return mapDailyBriefResponse(unwrapDailyBrief(data));
}

export type { DailyBriefApiResponse, DailyBriefViewModel };
