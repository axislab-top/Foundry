import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

export type TaskFileAssetRow = {
  fileAssetId: string;
  name: string;
  sourceTaskId: string;
};

/** 按 sourceTaskId 查询 file_assets（结案摘要 / 交付物卡片下载）。 */
export async function fetchFileAssetsForTask(params: {
  apiRpc: ClientProxy;
  companyId: string;
  actor: { id: string; roles: string[] };
  taskId: string;
  rpcTimeoutMs: number;
}): Promise<TaskFileAssetRow[]> {
  const taskId = String(params.taskId ?? '').trim();
  if (!taskId) return [];
  try {
    const res = await firstValueFrom(
      params.apiRpc
        .send<{ items?: Array<{ id?: string; name?: string; sourceTaskId?: string }> }>('fileAssets.findAll', {
          companyId: params.companyId,
          actor: params.actor,
          sourceTaskId: taskId,
          page: 1,
          pageSize: 20,
        })
        .pipe(timeout({ first: params.rpcTimeoutMs })),
    );
    const items = Array.isArray(res?.items) ? res.items : [];
    return items
      .map((row) => {
        const id = String(row?.id ?? '').trim();
        if (!id) return null;
        return {
          fileAssetId: id,
          name: String(row?.name ?? '交付文件').trim() || '交付文件',
          sourceTaskId: String(row?.sourceTaskId ?? taskId).trim() || taskId,
        };
      })
      .filter((x): x is TaskFileAssetRow => Boolean(x));
  } catch {
    return [];
  }
}

export async function fetchFileAssetsForTasks(params: {
  apiRpc: ClientProxy;
  companyId: string;
  actor: { id: string; roles: string[] };
  taskIds: string[];
  rpcTimeoutMs: number;
}): Promise<TaskFileAssetRow[]> {
  const seen = new Set<string>();
  const out: TaskFileAssetRow[] = [];
  for (const taskId of params.taskIds) {
    const tid = String(taskId ?? '').trim();
    if (!tid || seen.has(tid)) continue;
    seen.add(tid);
    const rows = await fetchFileAssetsForTask({
      apiRpc: params.apiRpc,
      companyId: params.companyId,
      actor: params.actor,
      taskId: tid,
      rpcTimeoutMs: params.rpcTimeoutMs,
    });
    for (const r of rows) {
      if (!out.some((x) => x.fileAssetId === r.fileAssetId)) out.push(r);
    }
  }
  return out;
}
