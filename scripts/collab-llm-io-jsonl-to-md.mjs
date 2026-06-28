#!/usr/bin/env node
/**
 * 将 Worker 在 FOUNDRY_LOG_COLLAB_LLM_IO 下写入的 JSONL 转为可读 Markdown。
 *
 * 用法:
 *   node scripts/collab-llm-io-jsonl-to-md.mjs <input.jsonl> [output.md]
 *
 * 默认 output: 与 input 同目录，文件名加 -report.md
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('用法: node scripts/collab-llm-io-jsonl-to-md.mjs <input.jsonl> [output.md]');
  process.exit(1);
}

const defaultOut = join(
  dirname(inputPath),
  basename(inputPath, '.jsonl').replace(/\.jsonl$/i, '') + '-llm-io-report.md',
);
const outputPath = process.argv[3] || defaultOut;

const raw = readFileSync(inputPath, 'utf8');
const lines = raw.split(/\r?\n/).filter((l) => l.trim());

let md = `# Collaboration LLM 调用抓取报告\n\n`;
md += `源文件: \`${inputPath.replace(/\\/g, '/')}\`\n\n`;
md += `共 **${lines.length}** 次经 \`CollaborationLlmBridge\` 的 \`invoke\`。\n\n`;
md += `> 说明：仅包含走协作 Bridge 的聊天模型调用；未走 Bridge 的路径不会出现。\n\n`;
md += `---\n\n`;

for (let i = 0; i < lines.length; i++) {
  let o;
  try {
    o = JSON.parse(lines[i]);
  } catch (e) {
    md += `## 行 ${i + 1}（JSON 解析失败）\n\n\`\`\`\n${String(e)}\n\`\`\`\n\n---\n\n`;
    continue;
  }
  const seq = o.seq ?? i + 1;
  md += `## 调用 #${seq}\n\n`;
  md += `| 字段 | 值 |\n| --- | --- |\n`;
  md += `| 时间 | ${o.ts ?? ''} |\n`;
  md += `| callsite | \`${String(o.callsite ?? '')}\` |\n`;
  md += `| messageId | \`${String(o.messageId ?? '')}\` |\n`;
  md += `| modelName | \`${String(o.modelName ?? '')}\` |\n`;
  md += `| ok | ${o.ok === false ? 'false' : 'true'} |\n`;
  md += `| ms | ${o.ms ?? ''} |\n`;
  if (o.error) md += `| error | \`${String(o.error).replace(/\|/g, '\\|')}\` |\n`;
  md += `\n`;
  if (o._note) md += `> ${o._note}\n\n`;
  md += `### 请求输入\n\n\`\`\`json\n${JSON.stringify(o.input, null, 2)}\n\`\`\`\n\n`;
  md += `### 模型输出\n\n`;
  if (o.ok === false) {
    md += `_（调用失败，无输出体）_\n\n`;
  } else {
    md += `\`\`\`json\n${JSON.stringify(o.output, null, 2)}\n\`\`\`\n\n`;
  }
  md += `---\n\n`;
}

writeFileSync(outputPath, md, 'utf8');
console.log(`已写入: ${outputPath}`);
