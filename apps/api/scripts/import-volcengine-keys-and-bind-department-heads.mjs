/**
 * Import Volcengine keys into LLM key pool and bind 3 keys
 * to each marketplace department head (agent_category='department_head').
 *
 * Usage:
 *   pnpm --filter @service/api run seed:volcengine-keys
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
 *   KEYS_FILE: path to key list file (default: ../../../docs/key.txt)
 *   PROVIDER_CODE: (default: volcengine)
 *   MODEL_NAME: (default: doubao-seed-2.0-pro)
 *   DAILY_QUOTA_TOKENS: (default: 2000000)
 *   DRY_RUN=1 to preview without writing
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { SecurityManager, createSecurityConfigFromEnv } from '@service/security';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function main() {
  loadEnvFromFile();

  const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const KEYS_FILE = process.env.KEYS_FILE
    ? resolve(process.env.KEYS_FILE)
    : resolve(__dirname, '../../../docs/key.txt');

  const PROVIDER_CODE = (process.env.PROVIDER_CODE || 'volcengine').trim();
  const MODEL_NAME = (process.env.MODEL_NAME || 'doubao-seed-2.0-pro').trim();
  const DAILY_QUOTA_TOKENS = safeIntFromEnv('DAILY_QUOTA_TOKENS', 2_000_000);

  if (!PROVIDER_CODE) throw new Error('PROVIDER_CODE is empty');
  if (!MODEL_NAME) throw new Error('MODEL_NAME is empty');

  const secrets = readKeysFromFile(KEYS_FILE);
  if (!secrets.length) throw new Error(`No keys found in file: ${KEYS_FILE}`);

  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const existing = await client.query(
      `
      SELECT id, key_alias
      FROM llm_keys
      WHERE provider = $1 AND model_name = $2
    `,
      [PROVIDER_CODE, MODEL_NAME],
    );
    const existingByAlias = new Map(existing.rows.map((r) => [String(r.key_alias), String(r.id)]));

    const desiredAliases = secrets.map((s) => `volc-${MODEL_NAME}-${String(s).slice(0, 8)}`);

    const toCreate = [];
    const resolvedKeyIds = [];
    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i];
      const keyAlias = desiredAliases[i];
      const existingId = existingByAlias.get(keyAlias);
      if (existingId) {
        resolvedKeyIds.push(existingId);
        continue;
      }
      toCreate.push({ secret, keyAlias });
    }

    if (DRY_RUN) {
      console.log(
        JSON.stringify(
          {
            keysFile: KEYS_FILE,
            provider: PROVIDER_CODE,
            modelName: MODEL_NAME,
            dailyQuotaTokens: DAILY_QUOTA_TOKENS,
            hasAesKey: !!process.env.AES_KEY,
            hasRsaKeyPair: !!(process.env.RSA_PUBLIC_KEY && process.env.RSA_PRIVATE_KEY),
            totalSecretsInFile: secrets.length,
            existingKeysMatchedByAlias: resolvedKeyIds.length,
            willCreateKeys: toCreate.length,
          },
          null,
          2,
        ),
      );
      return;
    }

    // Only initialize encryption when we actually need to insert new secrets.
    // (DRY_RUN and "all keys already exist" should not require security env.)
    let encryptionManager = null;
    if (toCreate.length) {
      const securityConfig = createSecurityConfigFromEnv();
      const securityManager = await SecurityManager.createFromConfig(securityConfig);
      encryptionManager = securityManager.getEncryptionManager();
    }

    await client.query('BEGIN');

    for (const item of toCreate) {
      const encryptedSecret = await encryptSecretToBase64(encryptionManager, item.secret);
      const inserted = await client.query(
        `
        INSERT INTO llm_keys (provider, model_name, key_alias, encrypted_secret, is_active, daily_quota_tokens)
        VALUES ($1, $2, $3, $4, true, $5)
        RETURNING id
      `,
        [PROVIDER_CODE, MODEL_NAME, item.keyAlias, encryptedSecret, String(DAILY_QUOTA_TOKENS)],
      );
      const id = String(inserted.rows?.[0]?.id);
      resolvedKeyIds.push(id);
      existingByAlias.set(item.keyAlias, id);
    }

    // Resolve department heads
    const deptHeads = await client.query(
      `
      SELECT id, slug, name
      FROM marketplace_agents
      WHERE agent_category = 'department_head'
      ORDER BY slug ASC
    `,
    );
    const heads = deptHeads.rows.map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
    }));

    const keysNeeded = heads.length * 3;
    const available = resolvedKeyIds.length;
    if (available < keysNeeded) {
      console.warn(
        `WARNING: not enough keys to bind 3 per department head. heads=${heads.length}, need=${keysNeeded}, available=${available}. Will bind as many as possible.`,
      );
    }

    // Ensure keys are not bound elsewhere (we're explicitly assigning them to dept heads)
    const keysToUse = resolvedKeyIds.slice(0, Math.min(keysNeeded, available));
    if (keysToUse.length) {
      await client.query(
        `
        DELETE FROM marketplace_agent_key_bindings
        WHERE llm_key_id = ANY($1::uuid[])
      `,
        [keysToUse],
      );
    }

    let cursor = 0;
    let boundHeads = 0;
    const unboundSlugs = [];
    for (const head of heads) {
      const slice = keysToUse.slice(cursor, cursor + 3);
      if (slice.length < 3) {
        unboundSlugs.push(head.slug);
        continue;
      }
      cursor += 3;

      await client.query(
        `
        UPDATE marketplace_agents
        SET bound_model_name = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
        [head.id, MODEL_NAME],
      );

      await client.query(
        `
        DELETE FROM marketplace_agent_key_bindings
        WHERE marketplace_agent_id = $1
      `,
        [head.id],
      );

      for (let i = 0; i < slice.length; i++) {
        await client.query(
          `
          INSERT INTO marketplace_agent_key_bindings (marketplace_agent_id, llm_key_id, sort_order)
          VALUES ($1, $2, $3)
        `,
          [head.id, slice[i], i],
        );
      }

      boundHeads += 1;
    }

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: PROVIDER_CODE,
          modelName: MODEL_NAME,
          dailyQuotaTokens: DAILY_QUOTA_TOKENS,
          keysImportedOrReused: resolvedKeyIds.length,
          departmentHeadsFound: heads.length,
          departmentHeadsBound: boundHeads,
          totalBindingsCreated: boundHeads * 3,
          unboundDepartmentHeadSlugs: unboundSlugs.slice(0, 50),
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

