/**
 * 将 SCnet（超算中心）API Key 批量写入 llm_keys，并确保 llm_providers 中存在 scnet。
 * 每个 key 只绑定一个模型：按文件顺序轮询分配到 MODEL_NAMES 列表中的模型。
 *
 * 用法:
 *   pnpm --filter @service/api run seed:scnet-keys
 *
 * 环境变量:
 *   DATABASE_URL（优先）或与 import-volcengine 脚本相同的 DB/POSTGRES 组合
 *   KEYS_FILE: 密钥文件路径（默认: 仓库根目录 key.txt）
 *   DAILY_QUOTA_TOKENS: 每 key 每日 token 配额（默认: 2000000）
 *   MODEL_NAMES: 逗号分隔模型列表，覆盖默认列表
 *   DRY_RUN=1: 仅打印计划，不写库
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { SecurityManager, createSecurityConfigFromEnv } from '@service/security';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODEL_NAMES = [
  'DeepSeek-R1-0528',
  'MiniMax-M2.5',
  'Qwen3-235B-A22B',
  'Qwen3-30B-A3B-Instruct-2507',
  'Qwen3-235B-A22B-Thinking-2507',
  'DeepSeek-R1-Distill-Qwen-7B',
  'Qwen3-30B-A3B',
  'QwQ-32B',
  'DeepSeek-R1-Distill-Llama-70B',
  'DeepSeek-R1-Distill-Qwen-32B',
  'Qwen3-Embedding-8B',
];

const PROVIDER_CODE = 'scnet';
const PROVIDER_DISPLAY = 'SCnet（超算中心）';
const REQUEST_URL = 'https://api.scnet.cn/api/llm/v1';

function loadEnvFromFile() {
  const tryPaths = [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../../.env.local'),
    resolve(__dirname, '../.env'),
    resolve(__dirname, '../.env.local'),
    resolve(__dirname, '../../.env'),
  ];
  for (const p of tryPaths) {
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    } catch {
      // ignore
    }
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const user = process.env.POSTGRES_USER || process.env.DB_USERNAME || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

function readKeysFromFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/\r$/, '').trim())
    .filter(Boolean);
  const uniq = [];
  const seen = new Set();
  for (const k of lines) {
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(k);
  }
  return uniq;
}

function parseModelNames() {
  const raw = (process.env.MODEL_NAMES || '').trim();
  if (!raw) return [...DEFAULT_MODEL_NAMES];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function encryptSecretToBase64(encryptionManager, secret) {
  const res = await encryptionManager.encrypt(String(secret).trim(), { algorithm: 'aes-256-gcm' });

  const encryptedBase64 = Buffer.isBuffer(res.encrypted)
    ? res.encrypted.toString('base64')
    : Buffer.from(res.encrypted).toString('base64');

  const ivBase64 = res.iv ? (Buffer.isBuffer(res.iv) ? res.iv.toString('base64') : String(res.iv)) : '';
  const tagBase64 = res.tag ? (Buffer.isBuffer(res.tag) ? res.tag.toString('base64') : String(res.tag)) : '';

  const combined = JSON.stringify({
    encrypted: encryptedBase64,
    iv: ivBase64,
    tag: tagBase64,
  });
  return Buffer.from(combined, 'utf8').toString('base64');
}

function safeIntFromEnv(name, fallback) {
  const v = Number(process.env[name]);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.floor(v);
}

function makeKeyAlias(modelName, secret) {
  const prefix = String(secret).slice(0, 10);
  const alias = `scnet-${modelName}-${prefix}`;
  return alias.length > 120 ? alias.slice(0, 120) : alias;
}

async function main() {
  loadEnvFromFile();

  const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const KEYS_FILE = process.env.KEYS_FILE
    ? resolve(process.env.KEYS_FILE)
    : resolve(__dirname, '../../../key.txt');

  const modelNames = parseModelNames();
  const DAILY_QUOTA_TOKENS = safeIntFromEnv('DAILY_QUOTA_TOKENS', 2_000_000);

  if (!modelNames.length) throw new Error('MODEL_NAMES resolved empty');

  const secrets = readKeysFromFile(KEYS_FILE);
  if (!secrets.length) throw new Error(`No keys found in file: ${KEYS_FILE}`);

  const assignments = secrets.map((secret, i) => ({
    secret,
    modelName: modelNames[i % modelNames.length],
  }));

  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const existingRows = await client.query(
      `
      SELECT model_name, key_alias, id
      FROM llm_keys
      WHERE provider = $1
    `,
      [PROVIDER_CODE],
    );
    const existing = new Map();
    for (const r of existingRows.rows) {
      existing.set(`${String(r.model_name)}\0${String(r.key_alias)}`, String(r.id));
    }

    let toCreateCount = 0;
    const distribution = new Map();
    for (const m of modelNames) distribution.set(m, 0);

    for (const { secret, modelName } of assignments) {
      const keyAlias = makeKeyAlias(modelName, secret);
      if (!existing.has(`${modelName}\0${keyAlias}`)) toCreateCount += 1;
      distribution.set(modelName, (distribution.get(modelName) ?? 0) + 1);
    }

    if (DRY_RUN) {
      console.log(
        JSON.stringify(
          {
            keysFile: KEYS_FILE,
            provider: PROVIDER_CODE,
            requestUrl: REQUEST_URL,
            modelCount: modelNames.length,
            models: modelNames,
            dailyQuotaTokens: DAILY_QUOTA_TOKENS,
            totalSecretsInFile: secrets.length,
            willInsertRows: toCreateCount,
            keysPerModelRoundRobin: Object.fromEntries(distribution),
            hasAesKey: !!process.env.AES_KEY,
            hasRsaKeyPair: !!(process.env.RSA_PUBLIC_KEY && process.env.RSA_PRIVATE_KEY),
          },
          null,
          2,
        ),
      );
      return;
    }

    let encryptionManager = null;
    if (toCreateCount > 0) {
      const securityConfig = createSecurityConfigFromEnv();
      const securityManager = await SecurityManager.createFromConfig(securityConfig);
      encryptionManager = securityManager.getEncryptionManager();
    }

    await client.query('BEGIN');

    await client.query(
      `
      INSERT INTO llm_providers(code, display_name, kind, request_url)
      VALUES ($1, $2, 'openai', $3)
      ON CONFLICT (code) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        kind = EXCLUDED.kind,
        request_url = EXCLUDED.request_url,
        updated_at = CURRENT_TIMESTAMP
    `,
      [PROVIDER_CODE, PROVIDER_DISPLAY, REQUEST_URL],
    );

    let inserted = 0;

    for (const { secret, modelName } of assignments) {
      const keyAlias = makeKeyAlias(modelName, secret);
      if (existing.has(`${modelName}\0${keyAlias}`)) continue;

      const encryptedSecret = await encryptSecretToBase64(encryptionManager, secret);

      await client.query(
        `
        INSERT INTO llm_keys (provider, model_name, key_alias, encrypted_secret, is_active, daily_quota_tokens)
        VALUES ($1, $2, $3, $4, true, $5)
      `,
        [PROVIDER_CODE, modelName, keyAlias, encryptedSecret, String(DAILY_QUOTA_TOKENS)],
      );
      existing.set(`${modelName}\0${keyAlias}`, 'new');
      inserted += 1;
    }

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: PROVIDER_CODE,
          requestUrl: REQUEST_URL,
          models: modelNames,
          dailyQuotaTokens: DAILY_QUOTA_TOKENS,
          secretsCount: secrets.length,
          rowsInserted: inserted,
          keysPerModelRoundRobin: Object.fromEntries(distribution),
        },
        null,
        2,
      ),
    );
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
