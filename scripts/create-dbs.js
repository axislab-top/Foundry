/**
 * 创建 Gateway 和 API 数据库
 * 用法: node scripts/create-dbs.js
 */
const { Client } = require('pg');

const DATABASES = ['gateway_db', 'service_db'];

async function createDatabases() {
  // 连接到默认 postgres 数据库来创建新数据库
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();

    for (const dbName of DATABASES) {
      try {
        const check = await client.query(
          "SELECT 1 FROM pg_database WHERE datname = $1",
          [dbName]
        );

        if (check.rows.length === 0) {
          await client.query(`CREATE DATABASE ${dbName}`);
          console.log(`✅ Created ${dbName}`);
        } else {
          console.log(`ℹ️  ${dbName} already exists`);
        }
      } catch (err) {
        if (err.message && err.message.includes('already exists')) {
          console.log(`ℹ️  ${dbName} already exists`);
        } else {
          console.error(`❌ Failed to create ${dbName}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabases();
