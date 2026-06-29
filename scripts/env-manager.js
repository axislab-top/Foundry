#!/usr/bin/env node
// ============================================================================
// 环境变量管理脚本 (Node.js 跨平台版本)
// ============================================================================

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

// 解析 .env 文件
function parseEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;

  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }
  return vars;
}

// 获取环境变量值
function getEnvValue(key, vars) {
  return vars[key] || '';
}

// 生成 Docker Compose 环境变量文件
function generateDockerEnv(outputPath, vars) {
  console.log(colors.cyan(`生成 Docker 环境变量文件: ${outputPath}`));

  let content = `# Docker Compose 环境变量配置\n`;
  content += `# 此文件由 env-manager.js 自动生成，请勿手动编辑\n`;
  content += `# 生成时间: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}\n\n`;

  // 通用配置
  content += `# 通用配置\n`;
  content += `NODE_ENV=${getEnvValue('NODE_ENV', vars)}\n`;
  content += `LOG_LEVEL=${getEnvValue('LOG_LEVEL', vars)}\n\n`;

  // 数据库配置
  content += `# 数据库配置\n`;
  content += `DB_HOST=${getEnvValue('DB_HOST', vars)}\n`;
  content += `DB_PORT=${getEnvValue('DB_PORT', vars)}\n`;
  content += `DB_USERNAME=${getEnvValue('DB_USERNAME', vars)}\n`;
  content += `DB_PASSWORD=${getEnvValue('DB_PASSWORD', vars)}\n`;
  content += `DB_DATABASE=${getEnvValue('DB_DATABASE', vars)}\n`;
  content += `DB_SYNCHRONIZE=${getEnvValue('DB_SYNCHRONIZE', vars)}\n`;
  content += `DB_LOGGING=${getEnvValue('DB_LOGGING', vars)}\n\n`;

  // Redis 配置
  content += `# Redis 配置\n`;
  content += `REDIS_HOST=${getEnvValue('REDIS_HOST', vars)}\n`;
  content += `REDIS_PORT=${getEnvValue('REDIS_PORT', vars)}\n`;
  content += `REDIS_PASSWORD=${getEnvValue('REDIS_PASSWORD', vars)}\n\n`;

  // JWT 配置
  content += `# JWT 配置\n`;
  content += `JWT_SECRET=${getEnvValue('JWT_SECRET', vars)}\n`;
  content += `JWT_REFRESH_SECRET=${getEnvValue('JWT_REFRESH_SECRET', vars)}\n`;
  content += `JWT_EXPIRES_IN=${getEnvValue('JWT_EXPIRES_IN', vars)}\n`;
  content += `JWT_REFRESH_EXPIRES_IN=${getEnvValue('JWT_REFRESH_EXPIRES_IN', vars)}\n\n`;

  // 服务端口配置
  content += `# 服务端口配置\n`;
  content += `GATEWAY_SERVICE_PORT=${getEnvValue('GATEWAY_SERVICE_PORT', vars)}\n`;
  content += `API_SERVICE_PORT=${getEnvValue('API_SERVICE_PORT', vars)}\n`;
  content += `WEBHOOKS_SERVICE_PORT=${getEnvValue('WEBHOOKS_SERVICE_PORT', vars)}\n`;
  content += `WORKER_SERVICE_PORT=${getEnvValue('WORKER_SERVICE_PORT', vars)}\n\n`;

  // 前端 URL
  content += `# 前端 URL\n`;
  content += `FRONTEND_URL=${getEnvValue('FRONTEND_URL', vars)}\n`;

  // 确保目录存在
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(colors.green(`✓ 已生成: ${outputPath}`));
}

// 生成服务的 .env 文件
function generateServiceEnv(serviceName, outputPath, vars) {
  console.log(colors.cyan(`生成 ${serviceName} 服务的环境变量文件: ${outputPath}`));

  let content = `# ${serviceName} 服务环境变量配置\n`;
  content += `# 此文件由 env-manager.js 自动生成，请勿手动编辑\n`;
  content += `# 生成时间: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}\n\n`;

  switch (serviceName) {
    case 'gateway':
      content += `# 应用配置\n`;
      content += `NODE_ENV=${getEnvValue('NODE_ENV', vars)}\n`;
      content += `PORT=${getEnvValue('GATEWAY_SERVICE_PORT', vars)}\n\n`;
      content += `# 数据库配置\n`;
      content += `DB_HOST=${getEnvValue('DB_HOST', vars)}\n`;
      content += `DB_PORT=${getEnvValue('DB_PORT', vars)}\n`;
      content += `DB_USERNAME=${getEnvValue('DB_USERNAME', vars)}\n`;
      content += `DB_PASSWORD=${getEnvValue('DB_PASSWORD', vars)}\n`;
      content += `DB_DATABASE=${getEnvValue('GATEWAY_DB_DATABASE', vars)}\n`;
      content += `DB_SYNCHRONIZE=${getEnvValue('DB_SYNCHRONIZE', vars)}\n`;
      content += `DB_LOGGING=${getEnvValue('DB_LOGGING', vars)}\n\n`;
      content += `# Redis 配置\n`;
      content += `REDIS_HOST=${getEnvValue('REDIS_HOST', vars)}\n`;
      content += `REDIS_PORT=${getEnvValue('REDIS_PORT', vars)}\n`;
      content += `REDIS_PASSWORD=${getEnvValue('REDIS_PASSWORD', vars)}\n`;
      content += `REDIS_DB=${getEnvValue('REDIS_DB_GATEWAY', vars)}\n`;
      content += `ENABLE_ADVANCED_APPROVAL=${getEnvValue('ENABLE_ADVANCED_APPROVAL', vars)}\n`;
      content += `TENANT_MEMBERSHIP_ENFORCED=${getEnvValue('TENANT_MEMBERSHIP_ENFORCED', vars)}\n`;
      break;

    case 'api':
      content += `# 应用配置\n`;
      content += `NODE_ENV=${getEnvValue('NODE_ENV', vars)}\n`;
      content += `PORT=${getEnvValue('API_SERVICE_PORT', vars)}\n\n`;
      content += `# 数据库配置\n`;
      content += `DB_HOST=${getEnvValue('DB_HOST', vars)}\n`;
      content += `DB_PORT=${getEnvValue('DB_PORT', vars)}\n`;
      content += `DB_USERNAME=${getEnvValue('DB_USERNAME', vars)}\n`;
      content += `DB_PASSWORD=${getEnvValue('DB_PASSWORD', vars)}\n`;
      content += `DB_DATABASE=${getEnvValue('API_DB_DATABASE', vars)}\n`;
      content += `DB_SYNCHRONIZE=${getEnvValue('DB_SYNCHRONIZE', vars)}\n`;
      content += `DB_LOGGING=${getEnvValue('DB_LOGGING', vars)}\n`;
      content += `MIGRATIONS_DIRS=${getEnvValue('MIGRATIONS_DIRS', vars)}\n`;
      content += `MIGRATIONS_DIR=${getEnvValue('MIGRATIONS_DIR', vars)}\n`;
      content += `ENABLE_ADVANCED_APPROVAL=${getEnvValue('ENABLE_ADVANCED_APPROVAL', vars)}\n`;
      content += `TENANT_MEMBERSHIP_ENFORCED=${getEnvValue('TENANT_MEMBERSHIP_ENFORCED', vars)}\n\n`;
      content += `# 认证 / 邮件（密码重置）\n`;
      content += `FRONTEND_URL=${getEnvValue('FRONTEND_URL', vars)}\n`;
      content += `MAIL_DEV_LOG_ONLY=${getEnvValue('MAIL_DEV_LOG_ONLY', vars)}\n`;
      content += `SMTP_HOST=${getEnvValue('SMTP_HOST', vars)}\n`;
      content += `SMTP_PORT=${getEnvValue('SMTP_PORT', vars)}\n`;
      content += `SMTP_SECURE=${getEnvValue('SMTP_SECURE', vars)}\n`;
      content += `SMTP_USER=${getEnvValue('SMTP_USER', vars)}\n`;
      content += `SMTP_PASS=${getEnvValue('SMTP_PASS', vars)}\n`;
      content += `SMTP_FROM=${getEnvValue('SMTP_FROM', vars)}\n`;
      content += `SMTP_CONNECTION_TIMEOUT_MS=${getEnvValue('SMTP_CONNECTION_TIMEOUT_MS', vars)}\n`;
      content += `SMTP_GREETING_TIMEOUT_MS=${getEnvValue('SMTP_GREETING_TIMEOUT_MS', vars)}\n`;
      content += `SMTP_SOCKET_TIMEOUT_MS=${getEnvValue('SMTP_SOCKET_TIMEOUT_MS', vars)}\n`;
      break;

    default:
      console.log(colors.yellow(`未知服务: ${serviceName}，跳过`));
      return;
  }

  // 确保目录存在
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(colors.green(`✓ 已生成: ${outputPath}`));
}

// 主逻辑
function main() {
  const args = process.argv.slice(2);
  let source = '.env.shared';
  let service = null;

  // 解析参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      source = args[i + 1];
      i++;
    } else if (args[i] === '--service' && args[i + 1]) {
      service = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`环境变量管理脚本

用法:
    node scripts/env-manager.js [选项]

选项:
    --source <文件>     源环境变量文件（默认: .env.shared）
    --service <服务名>  生成特定服务的 .env 文件（gateway, api）
    --help              显示此帮助信息

示例:
    # 从 .env.shared 生成所有服务的环境变量文件
    node scripts/env-manager.js

    # 为特定服务生成 .env 文件
    node scripts/env-manager.js --service gateway`);
      process.exit(0);
    }
  }

  // 检查源文件
  if (!fs.existsSync(source)) {
    console.log(colors.red(`错误: 源文件不存在: ${source}`));
    console.log('提示: 请先复制 env.shared.example 为 .env.shared 并修改配置值');
    process.exit(1);
  }

  console.log(colors.green(`读取源文件: ${source}`));
  const vars = parseEnvFile(source);

  if (!service) {
    // 生成所有服务的环境变量文件
    console.log(colors.yellow('开始生成所有服务的环境变量文件...'));
    generateServiceEnv('gateway', 'apps/gateway/.env', vars);
    generateServiceEnv('api', 'apps/api/.env', vars);
    generateDockerEnv('deployment/docker/.env', vars);
    console.log(colors.green('✓ 环境变量文件生成完成！'));
  } else {
    generateServiceEnv(service, `apps/${service}/.env`, vars);
    console.log(colors.green(`✓ ${service} 服务环境变量文件生成完成！`));
  }
}

main();
