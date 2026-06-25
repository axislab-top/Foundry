export type GatewaySuccessResponse<T> = {
  success: true;
  data: T;
  timestamp?: string;
};

export function unwrapGatewayResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as any).success === true &&
    "data" in payload
  ) {
    return (payload as GatewaySuccessResponse<T>).data;
  }
  return payload as T;
}

