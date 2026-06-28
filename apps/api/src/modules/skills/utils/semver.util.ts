/** 轻量 semver（主.次.修）比较；非数字段按 0 处理，满足 P20 默认 1.0.0 与常见三段式版本。 */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string): number[] =>
    String(s ?? '')
      .trim()
      .split('.')
      .map((p) => {
        const n = parseInt(p.replace(/[^\d].*$/, ''), 10);
        return Number.isFinite(n) ? n : 0;
      });
  const pa = parse(a);
  const pb = parse(b);
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}
