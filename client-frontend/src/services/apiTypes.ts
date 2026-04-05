/**
 * Gateway auth routes use `{ success, data }`; RPC proxy may return raw JSON.
 */
export function unwrapResponse<T>(data: unknown): T {
  if (
    data &&
    typeof data === 'object' &&
    'success' in data &&
    (data as { success: boolean }).success === true &&
    'data' in data
  ) {
    return (data as { data: T }).data;
  }
  return data as T;
}
