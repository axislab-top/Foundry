import { createHash } from 'node:crypto';

/** Normalize free-text errors for stable bucketing (M5 repeat-failure metrics). */
export function normalizeForFailureSignature(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.-]+Z\b/g, '<ts>')
    .replace(/\s+/g, ' ')
    .slice(0, 4000);
}

export function computeFailureSignatureHash(parts: {
  errorSummary: string;
  taskTitle?: string | null;
}): string {
  const payload = [
    normalizeForFailureSignature(parts.errorSummary),
    (parts.taskTitle ?? '').trim().toLowerCase().slice(0, 512),
  ].join('\n');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
