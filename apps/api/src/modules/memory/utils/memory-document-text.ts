import { Logger } from '@nestjs/common';

const logger = new Logger('memory-document-text');

export function isPdfBuffer(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  return buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * 从存储文件缓冲区提取纯文本：PDF（pdf-parse）或 UTF-8 文本。
 */
export async function extractTextFromDocumentBuffer(
  buf: Buffer,
  pathHint?: string,
): Promise<{ text: string; detectedAs: 'pdf' | 'utf8' }> {
  const lower = pathHint?.toLowerCase() ?? '';
  const treatAsPdf = isPdfBuffer(buf) || lower.endsWith('.pdf');

  if (treatAsPdf) {
    try {
      const pdfParse = (await import('pdf-parse')).default as (
        data: Buffer,
      ) => Promise<{ text?: string }>;
      const res = await pdfParse(buf);
      const text = (res.text ?? '').replace(/\u0000/g, '').trim();
      return { text, detectedAs: 'pdf' };
    } catch (e: any) {
      logger.warn('pdf-parse failed', { message: e?.message, pathHint });
      throw e;
    }
  }

  let text: string;
  try {
    text = buf.toString('utf8');
  } catch (e: any) {
    logger.warn('utf8 decode failed', { message: e?.message });
    throw e;
  }
  return { text, detectedAs: 'utf8' };
}
