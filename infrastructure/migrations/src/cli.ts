#!/usr/bin/env node

/**
 * 数据库迁移CLI工具
 * 基于TypeORM提供迁移功能
 */

import { existsSync, readFileSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { createDataSource } from './data-source.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 从仓库内常见 .env 注入 process.env（不覆盖已有环境变量） */
function loadEnvFiles(): void {
  const migrationsRoot = join(__dirname, '..');
  const projectRoot = join(migrationsRoot, '..', '..');
  const candidates = [
    join(projectRoot, 'infrastructure', 'postgres', '.env'),
    join(projectRoot, 'apps', 'api', '.env'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === '') {
          process.env[key] = val;
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * 打印使用说明
 */
function printUsage() {
  console.log(`
数据库迁移工具

用法:
  migrate <command> [options]

命令:
  migration:generate <name>    生成新的迁移文件
  migration:run                 运行所有待执行的迁移
  migration:revert              回滚最后一次迁移
  migration:show                显示迁移状态

选项:
  --help, -h                    显示帮助信息

示例:
  migrate migration:generate CreateUsersTable
  migrate migration:run
  migrate migration:revert
  migrate migration:show
`);
}

/**
 * 生成迁移文件
 */
async function generateMigration(name: string) {
  if (!name) {
    console.error('错误: 迁移名称不能为空');
    console.log('用法: migrate migration:generate <name>');
    process.exit(1);
  }

  try {
    const dataSource = await createDataSource();
    await dataSource.initialize();

    // TypeORM的generateMigration方法需要手动调用
    // 这里我们使用TypeORM CLI的方式
    console.log('正在生成迁移文件...');
    console.log(`迁移名称: ${name}`);
    
    // 注意：TypeORM的generateMigration需要直接调用数据源的方法
    // 但由于TypeORM的API限制，建议使用typeorm CLI命令
    console.log('\n提示: 建议使用TypeORM CLI来生成迁移文件:');
    console.log('  typeorm migration:generate -n', name);
    console.log('\n或者使用以下方式:');
    console.log('  1. 确保数据源配置正确');
    console.log('  2. 使用TypeORM CLI: npx typeorm migration:generate');
    
    await dataSource.destroy();
  } catch (error: any) {
    console.error('生成迁移文件失败:', error.message);
    process.exit(1);
  }
}

/**
 * 运行迁移
 */
async function runMigrations() {
  try {
    console.log('正在连接数据库...');
    const dataSource = await createDataSource();
    await dataSource.initialize();

    console.log('正在运行迁移...');
    const migrations = await dataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('没有待执行的迁移');
    } else {
      console.log(`成功执行 ${migrations.length} 个迁移:`);
      migrations.forEach((migration) => {
        console.log(`  - ${migration.name}`);
      });
    }

    await dataSource.destroy();
    console.log('迁移完成');
  } catch (error: any) {
    console.error('运行迁移失败:', error.message);
    if (String(error?.code) === 'ECONNREFUSED' || /ECONNREFUSED/i.test(String(error))) {
      console.error(
        '\n提示: 无法连接数据库。请先在本机启动 PostgreSQL（例如启动 Docker Desktop 后在 infrastructure/postgres 执行: docker compose up -d），再重试 pnpm run migrate:run。',
      );
    }
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * 回滚迁移
 */
async function revertMigration() {
  try {
    console.log('正在连接数据库...');
    const dataSource = await createDataSource();
    await dataSource.initialize();

    console.log('正在回滚最后一次迁移...');
    await dataSource.undoLastMigration();
    
    console.log('回滚成功');
    await dataSource.destroy();
  } catch (error: any) {
    console.error('回滚迁移失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * 显示迁移状态
 */
async function showMigrations() {
  try {
    console.log('正在连接数据库...');
    const dataSource = await createDataSource();
    await dataSource.initialize();

    console.log('\n迁移状态:');
    
    // 获取所有迁移文件
    const allMigrations = dataSource.migrations;
    
    // 获取已执行的迁移
    const executedMigrations = await dataSource.query(
      `SELECT * FROM migrations ORDER BY timestamp DESC`
    );

    const executedNames = executedMigrations.map((m: any) => m.name);
    const pendingMigrations = allMigrations.filter(
      (migration) => !executedNames.includes(migration.name)
    );

    if (executedMigrations.length > 0) {
      console.log('\n已执行的迁移:');
      executedMigrations.forEach((migration: any) => {
        console.log(`  ✓ ${migration.name} (${new Date(parseInt(migration.timestamp)).toISOString()})`);
      });
    }

    if (pendingMigrations.length > 0) {
      console.log('\n待执行的迁移:');
      pendingMigrations.forEach((migration) => {
        console.log(`  ○ ${migration.name}`);
      });
    } else {
      console.log('\n没有待执行的迁移');
    }

    await dataSource.destroy();
  } catch (error: any) {
    // 如果migrations表不存在，说明还没有运行过迁移
    // 检查中英文错误信息
    const errorMessage = error.message || '';
    if (errorMessage.includes('relation "migrations" does not exist') || 
        errorMessage.includes('关系 "migrations" 不存在') ||
        errorMessage.includes('migrations') && errorMessage.includes('does not exist') ||
        errorMessage.includes('migrations') && errorMessage.includes('不存在')) {
      console.log('\n迁移状态:');
      console.log('数据库中没有migrations表，还没有运行过迁移');
      const dataSource = await createDataSource();
      await dataSource.initialize();
      const allMigrations = dataSource.migrations;
      if (allMigrations.length > 0) {
        console.log('\n待执行的迁移:');
        allMigrations.forEach((migration) => {
          console.log(`  ○ ${migration.name}`);
        });
      }
      await dataSource.destroy();
    } else {
      console.error('获取迁移状态失败:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  loadEnvFiles();

  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case 'migration:generate':
      await generateMigration(commandArgs[0]);
      break;
    case 'migration:run':
      await runMigrations();
      break;
    case 'migration:revert':
      await revertMigration();
      break;
    case 'migration:show':
      await showMigrations();
      break;
    default:
      console.error(`错误: 未知命令 "${command}"`);
      printUsage();
      process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  console.error('发生错误:', error);
  process.exit(1);
});

