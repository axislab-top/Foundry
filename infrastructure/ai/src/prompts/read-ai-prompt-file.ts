import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 从 monorepo 任意子目录启动（含 Jest / Nest）时，向上查找 `infrastructure/ai` 下的 prompt 文件。
 * 避免 `import.meta.url` 在部分 ts-jest 配置下与宿主 tsconfig 不兼容。
 */
export function readAiPromptFile(fileName: string): string {
  const cwd = process.cwd();
  const localFirst = [join(cwd, 'src', 'prompts', fileName), join(cwd, 'dist', 'prompts', fileName)];
  for (const p of localFirst) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  let d = cwd;
  for (let i = 0; i < 16; i++) {
    const srcPath = join(d, 'infrastructure', 'ai', 'src', 'prompts', fileName);
    const distPath = join(d, 'infrastructure', 'ai', 'dist', 'prompts', fileName);
    if (existsSync(srcPath)) return readFileSync(srcPath, 'utf8');
    if (existsSync(distPath)) return readFileSync(distPath, 'utf8');
    const next = dirname(d);
    if (next === d) break;
    d = next;
  }
  throw new Error(`AI prompt file not found: ${fileName} (cwd=${process.cwd()})`);
}
