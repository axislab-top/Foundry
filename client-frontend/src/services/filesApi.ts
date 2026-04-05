import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  contentType: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
}

export interface ListFilesResult {
  items: FileInfo[];
  count: number;
}

/**
 * Multipart upload via Gateway HTTP fallback → API `POST /api/files`.
 */
export async function uploadFile(file: File, path?: string): Promise<FileInfo> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<unknown>('/v1/files', form, {
    params: path ? { path } : undefined,
  });
  return unwrapResponse<FileInfo>(data);
}

export async function listFiles(params?: {
  prefix?: string;
  maxKeys?: number;
  marker?: string;
  recursive?: boolean;
}): Promise<ListFilesResult> {
  const { data } = await apiClient.get<unknown>('/v1/files', {
    params: {
      ...params,
      recursive: params?.recursive === true ? 'true' : undefined,
    },
  });
  return data as ListFilesResult;
}
