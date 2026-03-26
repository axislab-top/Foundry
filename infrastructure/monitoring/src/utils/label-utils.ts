/**
 * 标签工具函数
 */

import { MetricLabels } from '../types/metric.types.js';

/**
 * 规范化标签（确保所有值都是字符串）
 */
export function normalizeLabels(labels?: MetricLabels): MetricLabels {
  if (!labels) {
    return {};
  }

  const normalized: MetricLabels = {};
  for (const [key, value] of Object.entries(labels)) {
    normalized[key] = String(value);
  }
  return normalized;
}

/**
 * 合并标签
 */
export function mergeLabels(...labelSets: (MetricLabels | undefined)[]): MetricLabels {
  const merged: MetricLabels = {};
  for (const labels of labelSets) {
    if (labels) {
      Object.assign(merged, labels);
    }
  }
  return normalizeLabels(merged);
}

/**
 * 验证标签键
 */
export function validateLabelKeys(labelNames: readonly string[], labels: MetricLabels): void {
  const labelKeys = Object.keys(labels);
  const unknownKeys = labelKeys.filter(key => !labelNames.includes(key));
  
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown label keys: ${unknownKeys.join(', ')}. Expected: ${labelNames.join(', ')}`
    );
  }
}







































