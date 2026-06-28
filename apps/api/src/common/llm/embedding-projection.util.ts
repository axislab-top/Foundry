/**
 * Phase3：将上游 embedding（如多模态 2048）线性投影到 Memory Graph / memory_entries 目标维（如 1536）。
 * 使用固定种子的伪随机投影矩阵 + L2 归一化，无 PyTorch 依赖；同 seed 同 (from,to) 下矩阵缓存复用。
 */

const matrixCache = new Map<string, Float32Array>();

function matrixCacheKey(fromDim: number, toDim: number, seed: string): string {
  return `${seed}:${fromDim}:${toDim}`;
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildRandomProjectionMatrix(fromDim: number, toDim: number, seed: string): Float32Array {
  const m = new Float32Array(toDim * fromDim);
  let state = hashSeed(seed) >>> 0;
  for (let i = 0; i < m.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const u = state / 0xffffffff;
    m[i] = (u * 2 - 1) / Math.sqrt(fromDim);
  }
  return m;
}

function getOrCreateProjectionMatrix(fromDim: number, toDim: number, seed: string): Float32Array {
  const key = matrixCacheKey(fromDim, toDim, seed);
  let mat = matrixCache.get(key);
  if (!mat) {
    mat = buildRandomProjectionMatrix(fromDim, toDim, seed);
    matrixCache.set(key, mat);
  }
  return mat;
}

/**
 * 将向量从 fromDim 维投影到 toDim 维（fromDim > toDim 常见；相等则拷贝）。
 */
export function projectEmbeddingLinearDown(
  embedding: number[],
  fromDim: number,
  toDim: number,
  seed = 'foundry:emb:proj:v1',
): number[] {
  if (fromDim === toDim) return [...embedding];
  if (embedding.length !== fromDim) {
    throw new Error(`projectEmbeddingLinearDown: expected length ${fromDim}, got ${embedding.length}`);
  }
  if (toDim < 1 || fromDim < 1) {
    throw new Error(`projectEmbeddingLinearDown: invalid dims from=${fromDim} to=${toDim}`);
  }
  const m = getOrCreateProjectionMatrix(fromDim, toDim, seed);
  const out = new Array<number>(toDim);
  for (let i = 0; i < toDim; i++) {
    const row = i * fromDim;
    let s = 0;
    for (let j = 0; j < fromDim; j++) {
      s += m[row + j]! * embedding[j]!;
    }
    out[i] = s;
  }
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n) || 1;
  return out.map((x) => x / n);
}

/** 测试或内存压力场景下释放矩阵缓存 */
export function clearEmbeddingProjectionMatrixCache(): void {
  matrixCache.clear();
}
