/** 生成强制下载的 Content-Disposition 头（支持中文文件名）。 */
export function buildAttachmentContentDisposition(fileName: string): string {
  const base = (fileName || 'download').replace(/["\r\n\\]/g, '_').trim() || 'download';
  return `attachment; filename="${base}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}
