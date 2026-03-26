/**
 * 值格式化工具函数
 */

/**
 * 格式化字节数
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 格式化持续时间（毫秒转秒）
 */
export function formatDuration(milliseconds: number): number {
  return milliseconds / 1000;
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}







































