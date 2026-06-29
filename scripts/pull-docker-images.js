#!/usr/bin/env node
// ============================================================================
// Docker 镜像自动拉取脚本 (Node.js 跨平台版本)
// 自动拉取所有需要的 Docker 镜像，避免构建时拉取失败
// ============================================================================

const { execSync } = require('child_process');

// 颜色输出
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

// 需要拉取的镜像列表
const REQUIRED_IMAGES = [
  'node:20-alpine',
  'node:20-bookworm-slim',
  'nginx:1.25-alpine',
  'postgres:18-alpine',
  'redis:7-alpine',
  'rabbitmq:3.13-management-alpine',
  'grafana/grafana:10.2.0',
  'grafana/loki:latest',
  'grafana/promtail:latest',
  'clickhouse/clickhouse-server:24.8',
];

// 执行命令
function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

// 检查镜像是否存在
function imageExists(image) {
  const result = exec(`docker image inspect ${image}`);
  return result !== null;
}

// 拉取镜像
function pullImage(image) {
  console.log(colors.cyan(`拉取镜像: ${image}`));
  try {
    execSync(`docker pull ${image}`, { stdio: 'inherit' });
    console.log(colors.green(`✓ 成功: ${image}`));
    return true;
  } catch (e) {
    console.log(colors.red(`✗ 失败: ${image}`));
    return false;
  }
}

// 主函数
function main() {
  console.log(colors.yellow('=== Docker 镜像拉取 ===\n'));

  let failed = [];
  let skipped = [];

  for (const image of REQUIRED_IMAGES) {
    if (imageExists(image)) {
      console.log(colors.green(`跳过（已存在）: ${image}`));
      skipped.push(image);
    } else {
      const success = pullImage(image);
      if (!success) {
        failed.push(image);
      }
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log(colors.green(`跳过: ${skipped.length} 个`));
  console.log(colors.green(`成功: ${REQUIRED_IMAGES.length - skipped.length - failed.length} 个`));

  if (failed.length > 0) {
    console.log(colors.red(`失败: ${failed.length} 个`));
    console.log('\n失败的镜像:');
    failed.forEach(img => console.log(colors.red(`  - ${img}`)));
    console.log('\n' + colors.yellow('提示: 如果拉取失败，请检查网络连接或配置 Docker 镜像加速器'));
    console.log(colors.yellow('配置方法: Docker Desktop → Settings → Docker Engine → 添加:'));
    console.log(colors.yellow('  "registry-mirrors": ["https://docker.1ms.run", "https://docker.xuanyuan.me"]'));
    process.exit(1);
  }

  console.log(colors.green('\n✅ 所有镜像拉取完成'));
}

main();
