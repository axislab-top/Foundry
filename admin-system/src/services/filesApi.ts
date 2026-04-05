import { apiClient } from './apiClient';

export interface UploadedFileInfo {
  path: string;
  name: string;
  size: number;
  contentType: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
}

function unwrapResponse<T>(data: unknown): T {
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

export const filesApi = {
  async upload(file: File, opts?: { path?: string; public?: boolean; contentType?: string }): Promise<UploadedFileInfo> {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await apiClient.post('/files', fd, {
      params: {
        path: opts?.path,
        public: opts?.public ? 'true' : 'false',
        contentType: opts?.contentType,
      },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrapResponse<UploadedFileInfo>(data);
  },
};

