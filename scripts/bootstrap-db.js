#!/usr/bin/env node
// ============================================================================
// 数据库引导脚本 (Node.js 跨平台版本)
// 使用 baseline SQL 一次性创建所有表
// ============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

// 执行命令
function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

// 等待指定时间
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 异步主函数
async function main() {
  console.log(colors.yellow('=== Foundry 数据库初始化 ===\n'));

  const dbUser = process.env.DB_USERNAME || 'postgres';
  const dbName = process.env.DB_DATABASE || 'service_db';
  // 支持自定义容器名称，默认使用 service-postgres-dev（Docker Compose 开发环境）
  const containerName = process.env.POSTGRES_CONTAINER || 'service-postgres-dev';
  const projectRoot = path.resolve(__dirname, '..');
  const baselineSql = path.join(projectRoot, 'infrastructure', 'postgres', 'migrations', 'baseline-schema.sql');

  // 检查 baseline SQL
  if (!fs.existsSync(baselineSql)) {
    console.log(colors.red('❌ 找不到 baseline-schema.sql'));
    process.exit(1);
  }

  // 等待 PostgreSQL 就绪
  process.stdout.write('等待 PostgreSQL...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const result = exec(`docker exec ${containerName} pg_isready -U ${dbUser}`);
    if (result && result.includes('accepting connections')) {
      console.log(colors.green(' 就绪'));
      ready = true;
      break;
    }
    await sleep(1000);
  }

  if (!ready) {
    console.log(colors.red(' 超时，请先运行 pnpm infra:start'));
    process.exit(1);
  }

  // 执行 baseline SQL（过滤掉不兼容的行）
  process.stdout.write('创建数据库表...');
  const sqlContent = fs.readFileSync(baselineSql, 'utf-8');
  const filteredSql = sqlContent
    .split('\n')
    .filter(line => !line.includes('COMMENT ON'))
    .filter(line => !line.includes('set_config'))
    .filter(line => !line.startsWith('\\'))
    .join('\n');

  // 写入临时文件
  const tmpSql = path.join(projectRoot, '.tmp-bootstrap.sql');
  fs.writeFileSync(tmpSql, filteredSql, 'utf-8');

  try {
    exec(`docker exec -i ${containerName} psql -U ${dbUser} -d ${dbName} < "${tmpSql}"`);
  } catch (e) {
    // 忽略错误，可能是表已存在
  }

  // 清理临时文件
  try { fs.unlinkSync(tmpSql); } catch (e) {}

  // 获取表数量
  const tableCount = exec(
    `docker exec ${containerName} psql -U ${dbUser} -d ${dbName} -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"`
  );

  console.log(colors.green(` 完成 (${(tableCount || '0').trim()} 张表)`));
  console.log('');
  console.log(colors.green('✅ 数据库初始化完成'));
}

main().catch(err => {
  console.error(colors.red(`错误: ${err.message}`));
  process.exit(1);
});
