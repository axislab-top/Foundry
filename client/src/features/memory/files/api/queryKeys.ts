import type { FileListQueryParams } from "./fileAssetsTypes";

export const fileAssetKeys = {
  all: ["file-assets"] as const,
  list: (companyId: string | undefined, params: FileListQueryParams) =>
    [...fileAssetKeys.all, "list", companyId, params] as const,
  stats: (companyId: string | undefined) =>
    [...fileAssetKeys.all, "stats", companyId] as const,
  detail: (companyId: string | undefined, id: string) =>
    [...fileAssetKeys.all, "detail", companyId, id] as const,
};
