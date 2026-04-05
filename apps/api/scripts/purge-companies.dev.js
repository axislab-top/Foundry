import { Client } from 'pg';

async function main() {
  const cfg = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'service_db',
  };

  const client = new Client(cfg);
  await client.connect();

  // Danger: this wipes ALL company-scoped data in dev.
  // Marketplace + LLM keys/providers are preserved.
  await client.query('BEGIN');
  try {
    await client.query('TRUNCATE TABLE companies RESTART IDENTITY CASCADE;');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }

  console.log('OK: truncated companies (CASCADE).');
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});

