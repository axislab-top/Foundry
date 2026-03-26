#!/usr/bin/env node

import { createDataSource } from './dist/data-source.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env 文件
function loadEnvFile() {
  // 尝试从多个位置加载 .env 文件
  const envPaths = [
    join(__dirname, '..', 'postgres', '.env'), // infrastructure/postgres/.env
    join(__dirname, '..', '..', 'postgres', '.env'), // 如果从 dist 运行
    join(process.cwd(), 'infrastructure', 'postgres', '.env'), // 从项目根目录
    join(process.cwd(), '.env'), // 当前目录的 .env
  ];

  for (const envPath of envPaths) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        // 跳过空行和注释
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue;
        }
        
        // 解析 KEY=VALUE 格式
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmedLine.substring(0, equalIndex).trim();
          let value = trimmedLine.substring(equalIndex + 1).trim();
          
          // 移除引号
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          // 如果环境变量未设置，则设置它
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
      
      console.log(`✓ 已加载 .env 文件: ${envPath}`);
      return;
    } catch (error) {
      // 文件不存在，继续尝试下一个路径
      continue;
    }
  }
  
  console.log('⚠ 未找到 .env 文件，使用环境变量或默认值');
}

// 在测试连接前加载 .env 文件
loadEnvFile();

// 运行迁移时不需要加载实体文件
process.env.TYPEORM_ENTITIES = 'false';

async function testConnection() {
  console.log('\n环境变量:');
  console.log('  DB_HOST:', process.env.DB_HOST || '(未设置，将使用 POSTGRES_HOST 或默认值)');
  console.log('  DB_PORT:', process.env.DB_PORT || '(未设置，将使用 POSTGRES_PORT 或默认值)');
  console.log('  DB_USERNAME:', process.env.DB_USERNAME || '(未设置，将使用 POSTGRES_USER 或默认值)');
  console.log('  DB_DATABASE:', process.env.DB_DATABASE || '(未设置，将使用 POSTGRES_DB 或默认值)');
  console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : '(未设置，将使用 POSTGRES_PASSWORD 或默认值)');
  console.log('\nPOSTGRES_* 环境变量:');
  console.log('  POSTGRES_HOST:', process.env.POSTGRES_HOST || '(未设置)');
  console.log('  POSTGRES_PORT:', process.env.POSTGRES_PORT || '(未设置)');
  console.log('  POSTGRES_USER:', process.env.POSTGRES_USER || '(未设置)');
  console.log('  POSTGRES_DB:', process.env.POSTGRES_DB || '(未设置)');
  console.log('  POSTGRES_PASSWORD:', process.env.POSTGRES_PASSWORD ? '***' : '(未设置)');
  
  try {
    // 创建数据源配置，但不加载迁移文件（避免 TypeScript 加载问题）
    // 直接从 data-source.js 导入，避免触发 cli.js 的执行
    const { createDataSourceOptions } = await import('./dist/data-source.js');
    const options = await createDataSourceOptions();
    
    // 移除迁移文件配置，只用于测试连接
    const testOptions = {
      ...options,
      migrations: [], // 不加载迁移文件
      entities: [], // 不加载实体文件
    };
    
    const { DataSource } = await import('typeorm');
    const ds = new DataSource(testOptions);
    const tempDs = new DataSource({ ...testOptions, database: 'postgres' });
    
    console.log('\n数据源配置:');
    console.log('  host:', ds.options.host);
    console.log('  port:', ds.options.port);
    console.log('  username:', ds.options.username);
    console.log('  database:', ds.options.database);
    
    // 先连接到 postgres 数据库检查 service_db 是否存在
    console.log('\n先连接到 postgres 数据库检查...');
    await tempDs.initialize();
    console.log('✓ 连接到 postgres 数据库成功!');
    
    const result = await tempDs.query("SELECT datname FROM pg_database WHERE datname = 'service_db'");
    console.log('\n查询结果:', result);
    
    // TypeORM 的 query() 方法返回的是数组，不是 { rows: [] } 格式
    const rows = Array.isArray(result) ? result : (result.rows || []);
    console.log('数据库列表:', rows);
    
    if (rows.length === 0) {
      console.log('\n⚠ service_db 数据库不存在，正在创建...');
      try {
        await tempDs.query(`CREATE DATABASE service_db`);
        console.log('✓ 数据库创建成功！');
      } catch (createError) {
        console.error('✗ 创建数据库失败:', createError.message);
        await tempDs.destroy();
        process.exit(1);
      }
    } else {
      console.log('✓ service_db 数据库已存在');
    }
    
    // 销毁临时连接
    await tempDs.destroy();
    
    console.log('\n正在连接到 service_db 数据库...');
    await ds.initialize();
    console.log('✓ 连接成功!');
    
    // 销毁主连接
    await ds.destroy();
    console.log('\n✓ 所有测试完成！数据库连接正常。');
  } catch (error) {
    console.error('\n✗ 连接失败:');
    console.error('  错误消息:', error.message);
    console.error('  错误代码:', error.code);
    if (error.stack) {
      console.error('  堆栈:', error.stack);
    }
    process.exit(1);
  }
}

testConnection();

