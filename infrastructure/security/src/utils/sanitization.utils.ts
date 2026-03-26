/**
 * 清理工具函数（防止 XSS 等攻击）
 */

/**
 * HTML 转义
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * 清理 HTML 标签
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * 清理 SQL 注入风险字符（简单版本，实际应使用参数化查询）
 */
export function sanitizeSqlInput(input: string): string {
  return input.replace(/['";\\]/g, '');
}

/**
 * 清理文件名
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .substring(0, 255);
}

/**
 * 清理 URL
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // 只允许 http 和 https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * 清理用户输入（综合清理）
 */
export function sanitizeUserInput(input: string): string {
  return escapeHtml(input.trim());
}






































