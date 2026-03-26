/**
 * 路径解析工具
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * 解析配置文件路径
 */
export function resolveConfigPath(path: string, cwd?: string): string {
  // 如果是绝对路径，直接返回
  if (path.startsWith('/') || /^[A-Z]:/.test(path)) {
    return path;
  }

  // 相对路径，基于当前工作目录或指定目录
  const baseDir = cwd || process.cwd();
  return resolve(baseDir, path);
}

/**
 * 查找配置文件
 * 按优先级查找：指定路径 -> 当前目录 -> 项目根目录
 */
export function findConfigFile(
  filename: string,
  searchPaths: string[] = []
): string | null {
  const paths = [
    ...searchPaths,
    process.cwd(),
    resolve(process.cwd(), '..'),
  ];

  for (const basePath of paths) {
    const fullPath = resolve(basePath, filename);
    try {
      if (existsSync(fullPath)) {
        return fullPath;
      }
    } catch {
      // 忽略错误，继续查找
    }
  }

  return null;
}

